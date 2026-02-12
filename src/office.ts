// ============================================================================
// BeeHaven Office - Office State Engine
// Maps Claude Code events to bee character positions and activities
// ============================================================================

import type {
  BeeCharacter,
  BeeActivity,
  CityProjectState,
  ClaudeEvent,
  EventLogEntry,
  OfficeState,
  OfficeStats,
  ProjectSyncData,
  Room,
  RoomDef,
  SessionPersistData,
  ShopPersistData,
  TerminalEntry,
} from './types.js';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { scanProjectFiles } from './file-tree.js';
import {
  HONEY_REWARDS,
  loadShopState,
  getShopPersistData,
  purchaseItem,
  equipItem,
  getEquippedSkinColor,
} from './shop.js';

/** Office room layout — WeWork single-team office (half-scale for PixiJS doubling) */
export const ROOMS: RoomDef[] = [
  { id: 'lobby',        label: 'Reception',   x: 20,  y: 200, width: 100, height: 30,  color: '#FEF3C7' },
  { id: 'library',      label: 'Library',     x: 125, y: 20,  width: 140, height: 170, color: '#D1FAE5' },
  { id: 'studio',       label: 'Studio',      x: 275, y: 20,  width: 150, height: 170, color: '#DBEAFE' },
  { id: 'web-booth',    label: 'Web',         x: 20,  y: 20,  width: 40,  height: 50,  color: '#E0E0FE' },
  { id: 'phone-b',      label: 'Focus',       x: 530, y: 20,  width: 40,  height: 50,  color: '#E0F2FE' },
  { id: 'server-room',  label: 'Server Room', x: 500, y: 235, width: 60,  height: 80,  color: '#FEE2E2' },
  { id: 'meeting-room', label: 'Conference',  x: 20,  y: 235, width: 100, height: 100, color: '#D1FAE5' },
  { id: 'water-cooler', label: 'Lounge',      x: 320, y: 235, width: 125, height: 100, color: '#E0F2FE' },
  { id: 'coffee',       label: 'Kitchen',     x: 170, y: 235, width: 100, height: 100, color: '#FED7AA' },
];

/** Get center position of a room */
function roomCenter(room: Room): { x: number; y: number } {
  const r = ROOMS.find((rm) => rm.id === room)!;
  return {
    x: r.x + r.width / 2 + (Math.random() - 0.5) * (r.width * 0.4),
    y: r.y + r.height / 2 + (Math.random() - 0.5) * (r.height * 0.3),
  };
}

/** Map tool names to rooms */
function toolToRoom(toolName: string): Room {
  switch (toolName) {
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return 'studio';
    case 'Read':
    case 'Glob':
    case 'Grep':
      return 'library';
    case 'WebFetch':
    case 'WebSearch':
      return 'web-booth';
    case 'Bash':
      return 'server-room';
    case 'Task':
      return 'meeting-room';
    default:
      return 'studio';
  }
}

/** Map tool names to activities */
function toolToActivity(toolName: string): BeeActivity {
  switch (toolName) {
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return 'coding';
    case 'Read':
    case 'Glob':
    case 'Grep':
      return 'reading';
    case 'Bash':
      return 'running-command';
    case 'Task':
      return 'thinking';
    case 'WebFetch':
    case 'WebSearch':
      return 'browsing';
    default:
      return 'coding';
  }
}

/** Event icon mapping */
function eventIcon(event: string, tool?: string): string {
  if (tool) {
    switch (tool) {
      case 'Edit': case 'Write': return '✏️';
      case 'Read': return '📖';
      case 'Glob': case 'Grep': return '🔍';
      case 'Bash': return '⚡';
      case 'Task': return '🐝';
      case 'WebFetch': case 'WebSearch': return '🌐';
      default: return '🔧';
    }
  }
  switch (event) {
    case 'SessionStart': return '🚪';
    case 'UserPromptSubmit': return '💬';
    case 'Stop': return '🎤';
    case 'SessionEnd': return '👋';
    case 'SubagentStart': return '🐝';
    case 'SubagentStop': return '✅';
    default: return '📋';
  }
}

const BEE_COLORS = ['#F59E0B', '#EF4444', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899'];

export class Office {
  state: OfficeState;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private knownProjects = new Set<string>();
  private deletedProjects = new Set<string>();
  private sessionProjects = new Map<string, string>();
  private activeSessions = new Map<string, string>(); // session_id → project
  private projectPaths = new Map<string, string>(); // project name → absolute cwd path
  private cityState = new Map<string, CityProjectState>(); // project → indicators + board
  private static CONFIG_DIR = join(homedir(), '.beehaven');
  private static CONFIG_FILE = join(homedir(), '.beehaven', 'config.json');

  constructor(shopData?: ShopPersistData) {
    const shop = loadShopState(shopData);
    const queenColor = getEquippedSkinColor(shop);
    const queenPos = roomCenter('lobby');
    const recruiterPos = roomCenter('meeting-room');
    this.state = {
      bees: [
        {
          id: 'queen',
          name: 'Claude',
          role: 'queen',
          room: 'lobby',
          activity: 'idle',
          x: queenPos.x,
          y: queenPos.y,
          targetX: queenPos.x,
          targetY: queenPos.y,
          color: queenColor,
        },
        {
          id: 'recruiter',
          name: 'Recruiter',
          role: 'recruiter',
          room: 'meeting-room',
          activity: 'idle',
          x: recruiterPos.x,
          y: recruiterPos.y,
          targetX: recruiterPos.x,
          targetY: recruiterPos.y,
          color: '#EC4899',
          message: 'Ready to help you create bee agents!',
        },
      ],
      sessionActive: false,
      eventLog: [],
      stats: {
        toolCalls: 0,
        filesRead: 0,
        filesWritten: 0,
        commandsRun: 0,
        errors: 0,
      },
      terminalLog: [],
      shop,
    };

    // Auto-detect projects on startup
    this.loadDeletedProjects();
    this.scanLocalProjects();
  }

  /** Load persisted deleted projects from config */
  private loadDeletedProjects() {
    try {
      if (existsSync(Office.CONFIG_FILE)) {
        const config = JSON.parse(readFileSync(Office.CONFIG_FILE, 'utf8'));
        if (Array.isArray(config.deletedProjects)) {
          for (const p of config.deletedProjects) this.deletedProjects.add(p);
        }
      }
    } catch { /* ignore corrupt config */ }
  }

  /** Persist deleted projects to config file */
  private saveDeletedProjects() {
    try {
      mkdirSync(Office.CONFIG_DIR, { recursive: true });
      const config = existsSync(Office.CONFIG_FILE)
        ? JSON.parse(readFileSync(Office.CONFIG_FILE, 'utf8'))
        : {};
      config.deletedProjects = Array.from(this.deletedProjects);
      writeFileSync(Office.CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (err) {
      console.warn('[office] Failed to save config:', err);
    }
  }

  /** Scan saved sessions and ~/.claude/projects/ to pre-populate knownProjects */
  private scanLocalProjects() {
    // 1. Extract projects from saved sessions
    try {
      const sessions = Office.loadSessionList();
      for (const s of sessions) {
        if (s.project && s.project !== 'unknown' && !this.deletedProjects.has(s.project)) {
          this.knownProjects.add(s.project);
        }
      }
    } catch { /* sessions dir may not exist yet */ }

    // 2. Scan ~/.claude/projects/ directories
    try {
      const claudeProjectsDir = join(homedir(), '.claude', 'projects');
      if (existsSync(claudeProjectsDir)) {
        const dirs = readdirSync(claudeProjectsDir, { withFileTypes: true });
        for (const d of dirs) {
          if (!d.isDirectory()) continue;
          // Directory names are URL-encoded paths like "-Users-gemini-projects-myapp"
          // Extract the last segment as the project name
          const segments = d.name.split('-').filter(Boolean);
          const projectName = segments[segments.length - 1];
          if (projectName && !this.deletedProjects.has(projectName)) {
            this.knownProjects.add(projectName);
          }
          // Decode directory name to absolute path for file tree scanning
          if (projectName && !this.projectPaths.has(projectName)) {
            const absPath = '/' + d.name.slice(1);
            const resolved = this.resolveEncodedPath(absPath);
            if (resolved && existsSync(resolved)) {
              this.projectPaths.set(projectName, resolved);
            }
          }
        }
      }
    } catch { /* claude dir may not exist */ }

    console.log(`[office] Known projects (from history): ${Array.from(this.knownProjects).join(', ') || 'none'}`);
    console.log(`[office] Project paths: ${Array.from(this.projectPaths.entries()).map(([k, v]) => `${k}→${v}`).join(', ') || 'none'}`);
    this.refreshActiveProjects();
  }

  /** Resolve an encoded Claude projects path by walking the filesystem */
  private resolveEncodedPath(encoded: string): string | null {
    const parts = encoded.split('/').filter(Boolean);
    if (parts.length !== 1) return null;

    const segments = parts[0].split('-');
    let current = '';
    let i = 0;
    while (i < segments.length) {
      let found = false;
      for (let len = segments.length - i; len >= 1; len--) {
        const candidate = segments.slice(i, i + len).join('-');
        const testPath = current + '/' + candidate;
        try {
          if (existsSync(testPath)) {
            current = testPath;
            i += len;
            found = true;
            break;
          }
        } catch { /* skip */ }
      }
      if (!found) {
        current += '/' + segments[i];
        i++;
      }
    }
    return existsSync(current) ? current : null;
  }

  /** Get the absolute filesystem path for a project */
  getProjectPath(name: string): string | undefined {
    return this.projectPaths.get(name);
  }

  /** Process a Claude Code event and update office state */
  processEvent(event: ClaudeEvent): { speechText?: string } {
    const queen = this.state.bees[0];
    let speechText: string | undefined;

    // Extract project name from cwd (strip trailing slashes, handle edge cases)
    const project = event.cwd
      ? event.cwd.replace(/\/+$/, '').split('/').filter(Boolean).pop() || undefined
      : undefined;
    if (project && !this.deletedProjects.has(project)) {
      this.knownProjects.add(project);
      queen.project = project;
    } else if (project) {
      queen.project = project;
    }

    // Store project → absolute path mapping for file tree scanning
    if (project && event.cwd) {
      this.projectPaths.set(project, event.cwd.replace(/\/+$/, ''));
    }

    // Track session → project mapping
    if (event.session_id && project) {
      this.sessionProjects.set(event.session_id, project);
      // Track active session (any event from a session means it's alive)
      if (event.hook_event_name !== 'SessionEnd') {
        this.activeSessions.set(event.session_id, project);
      }
    }

    // Derive project tabs from active sessions only
    this.refreshActiveProjects();

    // Reset idle timer
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.goIdle(), 8000);

    switch (event.hook_event_name) {
      case 'SessionStart': {
        this.state.sessionActive = true;
        this.state.stats.sessionStartTime = event.timestamp;
        this.moveBee(queen, 'lobby', 'arriving');
        queen.message = 'Good morning! Starting work...';
        this.log('SessionStart', 'Session started', eventIcon('SessionStart'), project);
        speechText = 'Starting a new session. Let me see what we are working on.';
        break;
      }

      case 'UserPromptSubmit': {
        this.moveBee(queen, 'meeting-room', 'thinking');
        const prompt = event.prompt || '';
        const shortPrompt = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;
        queen.message = `Hmm... "${shortPrompt}"`;
        this.log('UserPromptSubmit', shortPrompt, eventIcon('UserPromptSubmit'), project);
        speechText = `Let me think about this. ${shortPrompt}`;
        break;
      }

      case 'PreToolUse': {
        const tool = event.tool_name || 'unknown';
        const room = toolToRoom(tool);
        const activity = toolToActivity(tool);
        this.moveBee(queen, room, activity);
        this.state.currentTool = tool;
        this.state.stats.toolCalls++;

        let detail = tool;
        if (event.tool_input) {
          if ('file_path' in event.tool_input) {
            const fp = String(event.tool_input.file_path);
            detail = `${tool}: ${fp.split('/').pop()}`;
          } else if ('command' in event.tool_input) {
            const cmd = String(event.tool_input.command);
            detail = `${tool}: ${cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd}`;
          } else if ('pattern' in event.tool_input) {
            detail = `${tool}: ${event.tool_input.pattern}`;
          }
        }

        queen.message = detail;
        this.log('PreToolUse', detail, eventIcon('PreToolUse', tool), project);

        // Update stats
        if (tool === 'Read' || tool === 'Glob' || tool === 'Grep') this.state.stats.filesRead++;
        if (tool === 'Edit' || tool === 'Write') this.state.stats.filesWritten++;
        if (tool === 'Bash') this.state.stats.commandsRun++;
        break;
      }

      case 'PostToolUse': {
        const tool = event.tool_name || 'unknown';
        queen.message = `Done: ${tool} ✓`;
        this.log('PostToolUse', `${tool} completed`, eventIcon('PostToolUse', tool), project);
        break;
      }

      case 'PostToolUseFailure': {
        const tool = event.tool_name || 'unknown';
        this.state.stats.errors++;
        queen.activity = 'thinking';
        queen.message = `${tool} failed! Rethinking...`;
        this.log('PostToolUseFailure', `${tool} error: ${event.error || 'unknown'}`, '❌', project);
        speechText = `Hmm, that didn't work. Let me try a different approach.`;
        break;
      }

      case 'Stop': {
        this.moveBee(queen, 'meeting-room', 'presenting');
        queen.message = 'Here are my results!';
        this.log('Stop', 'Response complete', eventIcon('Stop'), project);
        break;
      }

      case 'SubagentStart': {
        const agentId = event.agent_id || `worker-${this.state.bees.length}`;
        const agentType = event.agent_type || 'worker';
        const room: Room = agentType === 'Bash' ? 'server-room' : agentType === 'Explore' ? 'library' : 'studio';
        const pos = roomCenter(room);
        const color = BEE_COLORS[this.state.bees.length % BEE_COLORS.length];

        this.state.bees.push({
          id: agentId,
          name: agentType,
          role: 'worker',
          room,
          activity: 'walking',
          x: queen.x,
          y: queen.y,
          targetX: pos.x,
          targetY: pos.y,
          color,
          message: `On it, boss!`,
          project: queen.project,
        });

        this.log('SubagentStart', `Worker bee "${agentType}" deployed`, '🐝', project);
        speechText = `Sending a worker bee to handle ${agentType}.`;
        break;
      }

      case 'SubagentStop': {
        const agentId = event.agent_id;
        const idx = this.state.bees.findIndex((b) => b.id === agentId);
        if (idx > 0) {
          const bee = this.state.bees[idx];
          bee.activity = 'celebrating';
          bee.message = 'Task complete!';
          // Remove after delay
          setTimeout(() => {
            const i = this.state.bees.findIndex((b) => b.id === agentId);
            if (i > 0) this.state.bees.splice(i, 1);
          }, 3000);
        }
        this.log('SubagentStop', `Worker returned`, '✅', project);
        break;
      }

      case 'SessionEnd': {
        this.activeSessions.delete(event.session_id);
        this.refreshActiveProjects();
        this.state.sessionActive = this.activeSessions.size > 0;
        this.moveBee(queen, 'lobby', 'idle');
        queen.message = 'See you next time!';
        this.log('SessionEnd', 'Session ended', eventIcon('SessionEnd'), project);
        speechText = 'Session complete. See you next time!';
        break;
      }
    }

    // Award honey for this event
    const honeyReward = HONEY_REWARDS[event.hook_event_name];
    if (honeyReward) {
      this.state.shop.honey += honeyReward;
    }

    this.state.currentEvent = event.hook_event_name;
    return { speechText };
  }

  /** Move a bee to a new room */
  private moveBee(bee: BeeCharacter, room: Room, activity: BeeActivity) {
    bee.room = room;
    bee.activity = activity;
    const pos = roomCenter(room);
    bee.targetX = pos.x;
    bee.targetY = pos.y;
  }

  /** Transition to idle state */
  private goIdle() {
    const queen = this.state.bees[0];
    const idleRooms: Room[] = ['water-cooler', 'coffee'];
    const room = idleRooms[Math.floor(Math.random() * idleRooms.length)];
    const idleActivities: BeeActivity[] = ['drinking-coffee', 'chatting', 'idle'];
    const activity = idleActivities[Math.floor(Math.random() * idleActivities.length)];
    this.moveBee(queen, room, activity);
    queen.message = activity === 'drinking-coffee' ? 'Coffee break ☕' : 'Waiting for instructions...';
  }

  /** Add entry to event log */
  private log(event: string, detail: string, icon: string, project?: string) {
    this.state.eventLog.unshift({
      timestamp: new Date().toISOString(),
      event,
      detail,
      icon,
      project,
    });
    // Keep last 50 entries
    if (this.state.eventLog.length > 50) {
      this.state.eventLog.length = 50;
    }
  }

  /** Add entry to terminal log (persists in state for reconnecting clients) */
  addTerminalEntry(entry: TerminalEntry) {
    if (!this.state.terminalLog) this.state.terminalLog = [];
    this.state.terminalLog.push(entry);
    if (this.state.terminalLog.length > 500) {
      this.state.terminalLog = this.state.terminalLog.slice(-500);
    }
  }

  /** Remove a project from the known list */
  removeProject(name: string) {
    this.knownProjects.delete(name);
    this.deletedProjects.add(name);
    // Remove active sessions for this project
    for (const [sid, proj] of this.activeSessions) {
      if (proj === name) this.activeSessions.delete(sid);
    }
    this.refreshActiveProjects();
    this.saveDeletedProjects();
    // Remove worker bees from this project; untag persistent bees (queen, recruiter)
    this.state.bees = this.state.bees.filter(bee => {
      if (bee.project !== name) return true;
      if (bee.role === 'queen' || bee.role === 'recruiter') {
        bee.project = undefined;
        return true;
      }
      return false; // Remove workers from deleted project
    });
    // Remove project from event log and terminal log entries
    this.state.eventLog = this.state.eventLog.filter(e => e.project !== name);
    if (this.state.terminalLog) {
      this.state.terminalLog = this.state.terminalLog.filter(e => e.project !== name);
    }
  }

  /** Purchase a shop item. Returns error string or null on success. */
  shopPurchase(itemId: string): string | null {
    const err = purchaseItem(this.state.shop, itemId);
    if (!err) this.applyEquippedSkin();
    return err;
  }

  /** Equip a shop item. Returns error string or null on success. */
  shopEquip(itemId: string): string | null {
    const err = equipItem(this.state.shop, itemId);
    if (!err) this.applyEquippedSkin();
    return err;
  }

  /** Get persist-safe shop data */
  shopPersistData(): ShopPersistData {
    return getShopPersistData(this.state.shop);
  }

  /** Sync queen bee color to equipped skin */
  private applyEquippedSkin() {
    const queen = this.state.bees[0];
    if (queen) {
      queen.color = getEquippedSkinColor(this.state.shop);
    }
  }

  /** Get or create city state for a project */
  getCityState(project: string): CityProjectState {
    let s = this.cityState.get(project);
    if (!s) {
      s = { indicators: [], board: [] };
      this.cityState.set(project, s);
    }
    return s;
  }

  /** Assemble full project context for Clearly cloud sync */
  getProjectSyncData(project: string): ProjectSyncData | null {
    const rootPath = this.projectPaths.get(project);
    if (!rootPath) return null;

    const tree = scanProjectFiles(project, rootPath);
    const fileTree = tree
      ? { files: tree.files, directories: tree.directories, fileCount: tree.files.length }
      : { files: [], directories: [], fileCount: 0 };

    const cityState = this.getCityState(project);

    const allEntries = this.state.terminalLog || [];
    const projectEntries = allEntries
      .filter(e => e.project === project)
      .slice(-200);

    return {
      project,
      path: rootPath,
      fileTree,
      cityState,
      conversations: projectEntries,
      syncedAt: Date.now(),
    };
  }

  getState(): OfficeState {
    return this.state;
  }

  /** Resolve which project a session belongs to */
  getSessionProject(sessionId?: string): string | undefined {
    if (!sessionId) return this.state.bees[0]?.project;
    return this.sessionProjects.get(sessionId) || this.state.bees[0]?.project;
  }

  /** Get an active session ID for a given project (or any active session if no project) */
  getActiveSessionId(project?: string): string | undefined {
    if (project) {
      for (const [sid, proj] of this.activeSessions) {
        if (proj === project) return sid;
      }
    }
    // Fall back to most recent active session
    const entries = [...this.activeSessions.keys()];
    return entries[entries.length - 1];
  }

  /** Register a discovered session (from transcript scan, not hooks) */
  registerSession(sessionId: string, project: string) {
    if (this.deletedProjects.has(project)) return;
    this.knownProjects.add(project);
    this.sessionProjects.set(sessionId, project);
    this.activeSessions.set(sessionId, project);
    this.refreshActiveProjects();
  }

  /** Rebuild state.projects from active sessions + known projects with paths */
  private refreshActiveProjects() {
    const all = new Set<string>();
    for (const proj of this.activeSessions.values()) {
      if (!this.deletedProjects.has(proj)) all.add(proj);
    }
    for (const proj of this.knownProjects) {
      if (!this.deletedProjects.has(proj) && this.projectPaths.has(proj)) {
        all.add(proj);
      }
    }
    this.state.projects = Array.from(all).sort();
  }

  // --- Session Persistence ---

  private static SESSIONS_DIR = join(homedir(), '.beehaven', 'sessions');
  private sessionStartTime: string | null = null;

  /** Mark session start time for later saving */
  markSessionStart() {
    this.sessionStartTime = new Date().toISOString();
  }

  /** Save current session to disk */
  saveSession(): string | null {
    if (!this.state.terminalLog?.length && !this.state.eventLog?.length) return null;

    mkdirSync(Office.SESSIONS_DIR, { recursive: true });

    const now = new Date();
    const project = this.state.bees[0]?.project || 'unknown';
    const id = `${now.toISOString().replace(/[:.]/g, '-')}-${project}`;

    const session: SessionPersistData = {
      id,
      project,
      startTime: this.sessionStartTime || this.state.stats.sessionStartTime || now.toISOString(),
      endTime: now.toISOString(),
      terminalLog: this.state.terminalLog || [],
      eventLog: this.state.eventLog || [],
      stats: { ...this.state.stats },
    };

    const filePath = join(Office.SESSIONS_DIR, `${id}.json`);
    writeFileSync(filePath, JSON.stringify(session, null, 2));
    console.log(`[office] Session saved: ${filePath}`);
    return id;
  }

  /** Load all saved sessions (metadata only — no logs) */
  static loadSessionList(): Array<{ id: string; project?: string; startTime: string; endTime: string; entryCount: number }> {
    if (!existsSync(Office.SESSIONS_DIR)) return [];
    try {
      const files = readdirSync(Office.SESSIONS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
      return files.slice(0, 50).map(f => {
        try {
          const data = JSON.parse(readFileSync(join(Office.SESSIONS_DIR, f), 'utf8')) as SessionPersistData;
          return {
            id: data.id,
            project: data.project,
            startTime: data.startTime,
            endTime: data.endTime,
            entryCount: (data.terminalLog?.length || 0) + (data.eventLog?.length || 0),
          };
        } catch { return null; }
      }).filter(Boolean) as any[];
    } catch { return []; }
  }

  /** Load a specific session by ID */
  static loadSession(id: string): SessionPersistData | null {
    const filePath = join(Office.SESSIONS_DIR, `${id}.json`);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch { return null; }
  }
}
