// ============================================================================
// BeeHaven Office - Main Entry Point
// Ties together: Event Watcher → Office State → WebSocket Server → Voice → Relay
// ============================================================================

import { ClaudeWatcher } from './watcher.js';
import { Office } from './office.js';
import { Server } from './server.js';
import { Voice } from './voice.js';
import { Relay } from './relay.js';
import { ensureHooks } from './setup-hooks.js';

import { FolderWatcher, getLinkedFolders } from './folder-sync.js';

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir, hostname } from 'os';
import { join } from 'path';
import type { BeeHavenCommand, OnboardingConfig, ShopPersistData } from './types.js';

const CONFIG_DIR = join(homedir(), '.beehaven');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function loadConfig(): OnboardingConfig {
  if (!existsSync(CONFIG_FILE)) return { onboarded: false, tier: 'local' };
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { onboarded: false, tier: 'local' }; }
}

function saveOnboardingConfig(update: Partial<OnboardingConfig>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = loadConfig();
  const merged = { ...existing, ...update };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

function saveShopToConfig(shop: ShopPersistData): void {
  saveOnboardingConfig({ shop });
}

// Per-session transcript tracking — maps transcript path → { byte offset, project }
const transcriptTrackers = new Map<string, { size: number; project?: string }>();

// Event deduplication — when global + project-local hooks both fire, skip duplicates.
// Key: session_id:hook_event:tool_use_id|timestamp — ring buffer of recent keys.
const recentEventKeys = new Set<string>();
const DEDUP_MAX = 200;
function isDuplicate(event: { session_id: string; hook_event_name: string; tool_use_id?: string; timestamp: string }): boolean {
  const key = `${event.session_id}:${event.hook_event_name}:${event.tool_use_id || ''}:${event.timestamp}`;
  if (recentEventKeys.has(key)) return true;
  recentEventKeys.add(key);
  if (recentEventKeys.size > DEDUP_MAX) {
    // Delete oldest entries (Set iterates in insertion order)
    const it = recentEventKeys.values();
    for (let i = 0; i < 50; i++) it.next();
    // Rebuild with recent entries only
    const keep = Array.from(recentEventKeys).slice(-DEDUP_MAX + 50);
    recentEventKeys.clear();
    for (const k of keep) recentEventKeys.add(k);
  }
  return false;
}

/** Parse and strip BEEHAVEN commands from Claude's text output */
const BEEHAVEN_RE = /<!--BEEHAVEN:(.*?)-->/g;

function extractBeeHavenCommands(text: string, project: string | undefined, office: Office): string {
  let match: RegExpExecArray | null;
  const commands: BeeHavenCommand[] = [];
  while ((match = BEEHAVEN_RE.exec(text)) !== null) {
    try {
      const cmd = JSON.parse(match[1]) as BeeHavenCommand;
      if (cmd.action) commands.push(cmd);
    } catch {
      console.warn('[beehaven] Failed to parse command:', match[1]);
    }
  }
  // Reset regex lastIndex for next call
  BEEHAVEN_RE.lastIndex = 0;

  if (commands.length > 0 && project) {
    console.log(`[beehaven] Processing ${commands.length} city commands for ${project}`);
    for (const cmd of commands) {
      office.processCityCommand(project, cmd);
    }
  }

  // Strip BEEHAVEN tags from display text
  return text.replace(BEEHAVEN_RE, '').trim();
}

/**
 * Scan ~/.claude/projects/ for recently modified transcript JSONL files.
 * This discovers sessions that may not have hooks configured, ensuring
 * ALL active sessions show text in the terminal.
 */
const TRANSCRIPT_SCAN_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
function scanActiveTranscripts(server: Server, voice: Voice, office: Office) {
  const claudeProjects = join(homedir(), '.claude', 'projects');
  if (!existsSync(claudeProjects)) return;

  const now = Date.now();
  try {
    const dirs = readdirSync(claudeProjects, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      // Extract project name from encoded dir (e.g., -Users-gemini-projects-clearly → clearly)
      const segments = d.name.split('-').filter(Boolean);
      const project = segments[segments.length - 1];
      if (!project) continue;

      const dirPath = join(claudeProjects, d.name);
      let files: string[];
      try { files = readdirSync(dirPath); } catch { continue; }

      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        // Skip subagent transcripts (agent-*.jsonl)
        if (f.startsWith('agent-')) continue;

        const filePath = join(dirPath, f);
        try {
          const stat = statSync(filePath);
          // Only track recently modified files (active sessions)
          if (now - stat.mtimeMs > TRANSCRIPT_SCAN_MAX_AGE_MS) continue;

          // If not already tracked, register and flush recent content
          if (!transcriptTrackers.has(filePath)) {
            // Look back up to 100KB to find recent assistant responses
            const LOOKBACK = 100 * 1024;
            const initOffset = Math.max(0, stat.size - LOOKBACK);
            transcriptTrackers.set(filePath, { size: initOffset, project });
            // Register as an active session
            const sessionId = f.replace('.jsonl', '');
            office.registerSession(sessionId, project);
            console.log(`[scan] Discovered active session: ${project} (${f}) — reading last ${stat.size - initOffset} bytes`);
            // Immediately flush the lookback content
            flushNewTranscriptText(filePath, project, server, voice, office);
          } else {
            // Already tracked — flush any new content
            flushNewTranscriptText(filePath, project, server, voice, office);
          }
        } catch { continue; }
      }
    }
  } catch { /* dir may not exist */ }
}

async function flushNewTranscriptText(
  transcriptPath: string,
  sessionProject: string | undefined,
  server: Server,
  voice: Voice,
  office: Office,
) {
  try {
    let tracker = transcriptTrackers.get(transcriptPath);
    if (!tracker) {
      // First time seeing this transcript — look back to capture recent content
      const LOOKBACK = 100 * 1024;
      let fileSize = 0;
      try { fileSize = statSync(transcriptPath).size; } catch { /* file may not exist yet */ }
      const initOffset = Math.max(0, fileSize - LOOKBACK);
      tracker = { size: initOffset, project: sessionProject };
      transcriptTrackers.set(transcriptPath, tracker);
      console.log(`[transcript] Initialized ${transcriptPath} at offset ${initOffset} (${fileSize - initOffset} bytes lookback)`);
      // Fall through to read the lookback content
    }

    // Update project if we have a newer mapping
    if (sessionProject) tracker.project = sessionProject;

    const stat = statSync(transcriptPath);
    if (stat.size <= tracker.size) return;

    console.log(`[transcript] Reading ${stat.size - tracker.size} new bytes from ${transcriptPath}`);

    const buf = readFileSync(transcriptPath);
    const newContent = buf.slice(tracker.size).toString('utf8');
    tracker.size = stat.size;

    const newLines = newContent.trim().split('\n');
    for (const line of newLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant') {
          const content = entry.message?.content;
          let texts: string[] = [];
          if (Array.isArray(content)) {
            texts = content
              .filter((b: any) => b.type === 'text' && b.text?.trim())
              .map((b: any) => b.text.trim());
          } else if (typeof content === 'string' && content.trim()) {
            texts = [content.trim()];
          }
          for (let text of texts) {
            if (text.length > 0) {
              // Extract and process BEEHAVEN commands, strip tags from display
              text = extractBeeHavenCommands(text, tracker.project, office);
              if (!text) continue; // Text was entirely commands
              const displayText = text.length > 5000 ? text.slice(0, 5000) + '\n...' : text;
              console.log(`[transcript] Text (${text.length} chars): ${text.slice(0, 80)}...`);
              office.addTerminalEntry({
                event: 'Stop',
                content: displayText,
                timestamp: new Date().toISOString(),
                project: tracker.project,
              });
              server.broadcastResponse({ event: 'Stop', content: displayText });

              if (server.isVoiceRequested() && voice.isEnabled()) {
                console.log(`[voice] Speaking ${text.length} chars...`);
                try {
                  const audio = await voice.speak(text);
                  if (audio) {
                    console.log(`[voice] Got ${audio.length} bytes audio`);
                    server.broadcastSpeech(audio.toString('base64'), displayText, tracker.project);
                  } else {
                    console.log(`[voice] speak() returned null`);
                  }
                } catch (err) {
                  console.error(`[voice] TTS failed:`, (err as Error).message);
                }
              }
            }
          }
        }
      } catch { continue; }
    }
  } catch (err) {
    console.error(`[transcript] Read failed:`, (err as Error).message);
  }
}

export interface StartOptions {
  port?: number;
  openBrowser?: boolean;
  verbose?: boolean;
}

export async function main(opts: StartOptions = {}) {
  const port = opts.port || parseInt(process.env.BEEHAVEN_PORT || '3333');

  console.log('');
  console.log('  \uD83D\uDC1D BeeHaven Office');
  console.log('  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  console.log('  Visualize Claude Code as a busy bee office');
  console.log('');

  // Auto-install global hooks if not present
  ensureHooks();

  // Initialize components
  const config = loadConfig();
  const watcher = new ClaudeWatcher();
  const office = new Office(config.shop, config.team);
  const server = new Server(port);
  const relay = new Relay();
  const voice = new Voice({
    enabled: !!process.env.ELEVENLABS_API_KEY,
  });

  // Wire up server dependencies
  server.setVoice(voice);
  server.setRelay(relay);
  server.setOffice(office);
  server.setLinkedFolders(getLinkedFolders());

  // When relay heartbeat returns profile, save to config
  relay.onProfileUpdate = (profile) => {
    saveOnboardingConfig({ user: profile });
  };

  // Wire up: events → office state → broadcast + relay
  watcher.on('event', async (event) => {
    // Deduplicate — global + project-local hooks can both fire for the same event
    if (isDuplicate(event)) return;

    const { speechText } = office.processEvent(event);

    // Resolve project: prefer cwd extraction, fall back to session→project map
    const cwdProject = event.cwd
      ? event.cwd.replace(/\/+$/, '').split('/').filter(Boolean).pop() || undefined
      : undefined;
    const proj = cwdProject || office.getSessionProject(event.session_id);

    if (event.hook_event_name === 'UserPromptSubmit' && event.prompt) {
      office.addTerminalEntry({
        event: 'UserPromptSubmit',
        content: event.prompt,
        timestamp: new Date().toISOString(),
        project: proj,
        role: 'user',
      });
    }

    // Add tool use events to terminal log
    if (event.hook_event_name === 'PreToolUse' && event.tool_name) {
      let detail = event.tool_name;
      if (event.tool_input) {
        if ('file_path' in event.tool_input) {
          const fp = String(event.tool_input.file_path);
          detail = `${event.tool_name}: ${fp.split('/').pop()}`;
        } else if ('command' in event.tool_input) {
          const cmd = String(event.tool_input.command);
          detail = `${event.tool_name}: ${cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd}`;
        } else if ('pattern' in event.tool_input) {
          detail = `${event.tool_name}: ${event.tool_input.pattern}`;
        }
      }
      office.addTerminalEntry({
        event: 'PreToolUse',
        content: detail,
        timestamp: new Date().toISOString(),
        project: proj,
        role: 'tool',
      });
    }

    if (event.hook_event_name === 'PermissionRequest' && event.tool_name) {
      office.addTerminalEntry({
        event: 'PermissionRequest',
        content: `Waiting for approval: ${event.tool_name}`,
        timestamp: new Date().toISOString(),
        project: proj,
        role: 'tool',
      });
    }

    if (event.hook_event_name === 'PostToolUseFailure' && event.tool_name) {
      office.addTerminalEntry({
        event: 'PostToolUseFailure',
        content: `${event.tool_name} failed: ${event.error || 'unknown error'}`,
        timestamp: new Date().toISOString(),
        project: proj,
        role: 'error',
      });
    }

    server.broadcastState(office.getState());
    server.broadcastEvent(event.hook_event_name, event.tool_name || '');

    if (event.hook_event_name === 'UserPromptSubmit' && event.prompt) {
      server.broadcastResponse({ event: 'UserPromptSubmit', content: event.prompt });
    }

    const transcriptPath = event.transcript_path;
    if (transcriptPath) {
      await flushNewTranscriptText(transcriptPath, proj, server, voice, office);
    }

    if (event.hook_event_name === 'Stop') {
      // Flush all known transcripts for this project
      for (const [path, tracker] of transcriptTrackers) {
        if (!proj || tracker.project === proj) {
          setTimeout(() => flushNewTranscriptText(path, proj, server, voice, office), 1000);
        }
      }
    }

    if (event.hook_event_name === 'SessionStart') {
      office.markSessionStart();
    }

    if (event.hook_event_name === 'SessionEnd') {
      saveShopToConfig(office.shopPersistData());
      office.saveSession();
      // Sync project context to Clearly cloud on session end
      if (proj) {
        const syncData = office.getProjectSyncData(proj);
        if (syncData) relay.syncProject(syncData);
        // Upload transcript and docs to Clearly cloud
        if (event.transcript_path) {
          relay.uploadTranscript(event.transcript_path, event.session_id, proj);
        }
        const projectRoot = office.getProjectPath(proj);
        if (projectRoot) {
          relay.uploadDocs(proj, projectRoot);
        }
      }
    }

    relay.syncState(office.getState());
    relay.sendEvent(event);
  });

  // Periodic state broadcast (for animation interpolation)
  setInterval(() => {
    server.broadcastState(office.getState());
  }, 500);

  // Scan for active transcripts every 3s — discovers sessions without hooks
  scanActiveTranscripts(server, voice, office); // initial scan
  setInterval(() => {
    scanActiveTranscripts(server, voice, office);
  }, 3000);

  // Auto-save shop state every 60s
  setInterval(() => {
    saveShopToConfig(office.shopPersistData());
  }, 60_000);

  // Sync active project context to Clearly cloud every 60s
  setInterval(() => {
    if (!relay.isConnected()) return;
    const projects = office.getState().projects || [];
    for (const proj of projects) {
      const syncData = office.getProjectSyncData(proj);
      if (syncData) relay.syncProject(syncData);
    }
  }, 60_000);

  // Start everything
  await server.start();
  watcher.start();
  await relay.start();

  // Start folder sync watchers for any linked projects
  const linkedFolders = getLinkedFolders();
  const folderWatchers: FolderWatcher[] = [];

  for (const [folderPath, link] of Object.entries(linkedFolders)) {
    if (!existsSync(folderPath)) continue;

    const fw = new FolderWatcher(folderPath, link.brandId, relay);
    fw.on('syncing', (count: number) => {
      console.log(`[folder-sync] Syncing ${count} files from ${folderPath}...`);
    });
    fw.on('synced', (count: number) => {
      console.log(`[folder-sync] Synced ${count} files from ${folderPath}`);
    });
    fw.start();
    folderWatchers.push(fw);

    if (relay.isConnected()) {
      relay.updateBrandSync(link.brandId, {
        localPath: folderPath,
        syncDevice: hostname(),
        syncStatus: 'connected',
      });
    }
  }

  const url = `http://localhost:${port}`;
  console.log('');
  console.log(`  Open ${url} to see the office`);
  console.log('  Voice: ' + (voice.isEnabled() ? 'ON (ElevenLabs)' : 'OFF (set ELEVENLABS_API_KEY)'));

  const profile = relay.getProfile();
  if (relay.isConfigured() && profile) {
    console.log(`  Clearly: ${profile.displayName} (${profile.subscriptionPlan})`);
  } else if (relay.isConfigured()) {
    console.log('  Clearly: Linked (connecting...)');
  } else {
    console.log('  Clearly: Not linked (run: beehaven login)');
  }
  console.log('');
  if (folderWatchers.length > 0) {
    console.log(`  Folder sync: ${folderWatchers.length} linked folder(s)`);
  }
  console.log('  Hooks: auto-configured (~/.claude/settings.json)');
  console.log('  To remove hooks: beehaven uninstall');
  console.log('');
  console.log('  Waiting for Claude Code events...');
  console.log('');

  // Graceful shutdown — kill orphans on Ctrl+C or SIGTERM
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n  [beehaven] ${signal} received — saving state and shutting down...`);
    try { saveShopToConfig(office.shopPersistData()); } catch { /* best effort */ }
    try { office.saveSession(); } catch { /* best effort */ }
    try { watcher.stop(); } catch { /* best effort */ }
    // Stop folder watchers and mark brands disconnected
    for (const fw of folderWatchers) {
      try { fw.stop(); } catch { /* best effort */ }
      try { relay.updateBrandSync(fw.brandId, { syncStatus: 'disconnected' }); } catch { /* best effort */ }
    }
    try { relay.stop(); } catch { /* best effort */ }
    // Give WebSocket clients a moment to disconnect
    setTimeout(() => process.exit(0), 300);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Auto-open browser
  if (opts.openBrowser !== false) {
    try {
      const openModule = await import('open');
      await openModule.default(url);
    } catch {
      // open package not available or failed — not critical
    }
  }
}
