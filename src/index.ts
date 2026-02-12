// ============================================================================
// BeeHaven Office - Main Entry Point
// Ties together: Event Watcher → Office State → WebSocket Server → Voice → Relay
// ============================================================================

import { ClaudeWatcher } from './watcher.js';
import { Office } from './office.js';
import { Server } from './server.js';
import { Voice } from './voice.js';
import { Relay } from './relay.js';

import { readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { OnboardingConfig, ShopPersistData } from './types.js';

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

// Track transcript reading position so we only send new text
let lastTranscriptSize = 0;
let lastTranscriptPath = '';

async function flushNewTranscriptText(transcriptPath: string, server: Server, voice: Voice, office: Office) {
  try {
    if (transcriptPath !== lastTranscriptPath) {
      lastTranscriptPath = transcriptPath;
      try {
        lastTranscriptSize = statSync(transcriptPath).size;
      } catch { lastTranscriptSize = 0; }
      console.log(`[transcript] Initialized at offset ${lastTranscriptSize}`);
      return;
    }

    const stat = statSync(transcriptPath);
    if (stat.size <= lastTranscriptSize) return;

    console.log(`[transcript] Reading ${stat.size - lastTranscriptSize} new bytes`);

    const buf = readFileSync(transcriptPath);
    const newContent = buf.slice(lastTranscriptSize).toString('utf8');
    lastTranscriptSize = stat.size;

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
          for (const text of texts) {
            if (text.length > 0) {
              const displayText = text.length > 5000 ? text.slice(0, 5000) + '\n...' : text;
              console.log(`[transcript] Text (${text.length} chars): ${text.slice(0, 80)}...`);
              const queenProject = office.getState().bees[0]?.project;
              office.addTerminalEntry({
                event: 'Stop',
                content: displayText,
                timestamp: new Date().toISOString(),
                project: queenProject,
              });
              server.broadcastResponse({ event: 'Stop', content: displayText });

              if (server.isVoiceRequested() && voice.isEnabled()) {
                console.log(`[voice] Speaking ${text.length} chars...`);
                try {
                  const audio = await voice.speak(text);
                  if (audio) {
                    console.log(`[voice] Got ${audio.length} bytes audio`);
                    server.broadcastSpeech(audio.toString('base64'), displayText);
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

  // Initialize components
  const config = loadConfig();
  const watcher = new ClaudeWatcher();
  const office = new Office(config.shop);
  const server = new Server(port);
  const relay = new Relay();
  const voice = new Voice({
    enabled: !!process.env.ELEVENLABS_API_KEY,
  });

  // Wire up server dependencies
  server.setVoice(voice);
  server.setRelay(relay);
  server.setOffice(office);

  // When relay heartbeat returns profile, save to config
  relay.onProfileUpdate = (profile) => {
    saveOnboardingConfig({ user: profile });
  };

  // Wire up: events → office state → broadcast + relay
  watcher.on('event', async (event) => {
    const { speechText } = office.processEvent(event);

    if (event.hook_event_name === 'UserPromptSubmit' && event.prompt) {
      const proj = event.cwd
        ? event.cwd.replace(/\/+$/, '').split('/').filter(Boolean).pop() || undefined
        : undefined;
      office.addTerminalEntry({
        event: 'UserPromptSubmit',
        content: event.prompt,
        timestamp: new Date().toISOString(),
        project: proj,
      });
    }

    server.broadcastState(office.getState());
    server.broadcastEvent(event.hook_event_name, event.tool_name || '');

    if (event.hook_event_name === 'UserPromptSubmit' && event.prompt) {
      server.broadcastResponse({ event: 'UserPromptSubmit', content: event.prompt });
    }

    const transcriptPath = (event as any).transcript_path as string | undefined;
    if (transcriptPath) {
      await flushNewTranscriptText(transcriptPath, server, voice, office);
    }

    if (event.hook_event_name === 'Stop' && lastTranscriptPath) {
      setTimeout(() => flushNewTranscriptText(lastTranscriptPath, server, voice, office), 1000);
    }

    if (event.hook_event_name === 'SessionStart') {
      office.markSessionStart();
    }

    if (event.hook_event_name === 'SessionEnd') {
      saveShopToConfig(office.shopPersistData());
      office.saveSession();
    }

    relay.syncState(office.getState());
    relay.sendEvent(event);
  });

  // Periodic state broadcast (for animation interpolation)
  setInterval(() => {
    server.broadcastState(office.getState());
  }, 500);

  // Auto-save shop state every 60s
  setInterval(() => {
    saveShopToConfig(office.shopPersistData());
  }, 60_000);

  // Start everything
  await server.start();
  watcher.start();
  await relay.start();

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
  console.log('  Waiting for Claude Code events...');
  console.log('  (Make sure hooks are configured — run: beehaven setup)');
  console.log('');

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
