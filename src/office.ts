// ============================================================================
// BeeHaven Office - Office State Engine
// Maps Claude Code events to bee character positions and activities
// ============================================================================

import type {
  BeeCharacter,
  BeeActivity,
  BeeHavenCommand,
  CityProjectState,
  ClaudeEvent,
  EventLogEntry,
  HiredBee,
  HiredBeeType,
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
    case 'EnterPlanMode':
    case 'ExitPlanMode':
    case 'AskUserQuestion':
      return 'meeting-room';
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
      return 'meeting-room';
    case 'Skill':
      return 'studio';
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
      return 'reading';
    case 'Glob':
    case 'Grep':
      return 'searching';
    case 'Bash':
      return 'running-command';
    case 'Task':
    case 'EnterPlanMode':
      return 'thinking';
    case 'ExitPlanMode':
    case 'AskUserQuestion':
      return 'presenting';
    case 'WebFetch':
    case 'WebSearch':
      return 'browsing';
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
      return 'thinking';
    case 'Skill':
      return 'coding';
    default:
      return 'coding';
  }
}

/** Event icon mapping */
function eventIcon(event: string, tool?: string): string {
  if (tool) {
    switch (tool) {
      case 'Edit': case 'Write': case 'NotebookEdit': return '✏️';
      case 'Read': return '📖';
      case 'Glob': case 'Grep': return '🔍';
      case 'Bash': return '⚡';
      case 'Task': return '🐝';
      case 'WebFetch': case 'WebSearch': return '🌐';
      case 'EnterPlanMode': case 'ExitPlanMode': return '📋';
      case 'AskUserQuestion': return '💬';
      case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': case 'TaskList': return '📝';
      case 'Skill': return '⚙️';
      default: return '🔧';
    }
  }
  switch (event) {
    case 'SessionStart': return '🚪';
    case 'UserPromptSubmit': return '💬';
    case 'PermissionRequest': return '🔐';
    case 'Stop': return '🎤';
    case 'SessionEnd': return '👋';
    case 'SubagentStart': return '🐝';
    case 'SubagentStop': return '✅';
    case 'Notification': return '🔔';
    case 'PreCompact': return '🗜️';
    case 'TeammateIdle': return '💤';
    case 'TaskCompleted': return '🏁';
    default: return '📋';
  }
}

const BEE_COLORS = ['#F59E0B', '#EF4444', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899'];

/** Hired bee type definitions */
const HIRED_BEE_CONFIG: Record<HiredBeeType, { homeRoom: Room; color: string; cost: number }> = {
  developer:  { homeRoom: 'studio',       color: '#22C55E', cost: 50 },
  designer:   { homeRoom: 'studio',       color: '#8B5CF6', cost: 75 },
  manager:    { homeRoom: 'meeting-room', color: '#3B82F6', cost: 100 },
  researcher: { homeRoom: 'library',      color: '#06B6D4', cost: 60 },
  devops:     { homeRoom: 'server-room',  color: '#F97316', cost: 80 },
};

const BEE_NAMES: Record<HiredBeeType, string[]> = {
  developer:  ['DevBee', 'StackBee', 'ByteBee', 'CodeBee', 'SyntaxBee', 'LogicBee', 'GitBee', 'NullBee'],
  designer:   ['ArtBee', 'PixelBee', 'ColorBee', 'SketchBee', 'CanvasBee', 'PaletteBee'],
  manager:    ['ChiefBee', 'PlanBee', 'BoardBee', 'SyncBee', 'OrgBee'],
  researcher: ['DataBee', 'LabBee', 'ScanBee', 'SearchBee', 'InfoBee'],
  devops:     ['OpsBee', 'PipeBee', 'DockerBee', 'CloudBee', 'ServerBee'],
};

const MAX_HIRED_BEES = 8;

/** Which tools each hired bee type responds to */
const HIRED_BEE_TOOLS: Record<HiredBeeType, string[]> = {
  developer:  ['Edit', 'Write', 'NotebookEdit', 'Skill'],
  designer:   ['Edit', 'Write'],
  researcher: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
  devops:     ['Bash'],
  manager:    ['Task', 'EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion', 'TaskCreate', 'TaskUpdate', 'TaskList'],
};

/** Work room for each hired bee type */
const HIRED_BEE_WORKROOM: Record<HiredBeeType, Room> = {
  developer: 'studio',
  designer: 'studio',
  researcher: 'library',
  devops: 'server-room',
  manager: 'meeting-room',
};

/** Speech bubbles for hired bees when working */
const HIRED_BEE_MESSAGES: Record<HiredBeeType, Record<string, string>> = {
  developer:  { coding: 'Writing code...', default: 'On it!' },
  designer:   { coding: 'Designing...', default: 'Creating!' },
  researcher: { reading: 'Analyzing...', searching: 'Searching...', browsing: 'Researching...', default: 'Investigating!' },
  devops:     { 'running-command': 'Running commands...', default: 'Deploying!' },
  manager:    { thinking: 'Planning...', presenting: 'Presenting!', default: 'Organizing!' },
};

/** All room IDs (no progressive unlock — all rooms always visible) */
const ALL_ROOMS: Room[] = ['lobby', 'studio', 'meeting-room', 'library', 'coffee', 'server-room', 'water-cooler', 'web-booth', 'phone-b'];

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

  constructor(shopData?: ShopPersistData, teamData?: HiredBee[]) {
    const shop = loadShopState(shopData);
    const queenColor = getEquippedSkinColor(shop);
    const queenPos = roomCenter('lobby');
    const recruiterPos = roomCenter('meeting-room');
    const hiredBees = teamData || [];

    // Office level is cosmetic only (all rooms always unlocked)
    const officeLevel = Office.calcOfficeLevel(hiredBees.length);
    const unlockedRooms = ALL_ROOMS;

    const bees: BeeCharacter[] = [
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
        message: hiredBees.length === 0
          ? 'Welcome! Click me to build your team'
          : 'Need more help? Click me!',
      },
    ];

    // Add hired bees
    for (const hb of hiredBees) {
      const config = HIRED_BEE_CONFIG[hb.type];
      const room = config.homeRoom;
      const pos = roomCenter(room);
      bees.push({
        id: hb.id,
        name: hb.name,
        role: 'hired',
        room,
        activity: 'idle',
        x: pos.x,
        y: pos.y,
        targetX: pos.x,
        targetY: pos.y,
        color: hb.customColor || config.color,
        hiredType: hb.type,
        hiredTools: hb.customTools || HIRED_BEE_TOOLS[hb.type],
      });
    }

    this.state = {
      bees,
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
      officeLevel,
      unlockedRooms,
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
          // Decode directory name to absolute path as fallback for file tree scanning
          // Format: "-Users-gemini-projects-clearly-beehaven" → "/Users/gemini/projects/clearly/beehaven"
          if (projectName && !this.projectPaths.has(projectName)) {
            const absPath = '/' + d.name.slice(1);
            // Try progressive path resolution to handle hyphens in directory names
            // Walk the filesystem to find the actual path
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
    // Build initial project list from known projects with paths
    this.refreshActiveProjects();
  }

  /** Resolve an encoded Claude projects path by walking the filesystem */
  private resolveEncodedPath(encoded: string): string | null {
    // The encoded path has / replaced with - but directory names can contain -
    // Strategy: walk from root, trying each segment boundary
    const parts = encoded.split('/').filter(Boolean); // e.g. ["Users-gemini-projects-clearly-beehaven"]
    if (parts.length !== 1) return null;

    const segments = parts[0].split('-');
    // Try to build a valid path by joining segments with / or -
    // Start with "/" and greedily match existing directories
    let current = '';
    let i = 0;
    while (i < segments.length) {
      let found = false;
      // Try longest possible segment first (handles hyphenated dir names)
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
        // Try just the single segment
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
        queen.message = project ? `Starting work on ${project}!` : 'Good morning! Ready to go';
        this.mobilizeHiredBees();
        this.log('SessionStart', 'Session started', eventIcon('SessionStart'), project);
        speechText = 'Starting a new session. Let me see what we are working on.';
        break;
      }

      case 'UserPromptSubmit': {
        this.moveBee(queen, 'meeting-room', 'thinking');
        const prompt = event.prompt || '';
        const shortPrompt = prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt;
        queen.message = shortPrompt ? `"${shortPrompt}"` : 'Thinking...';
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

        // Build a natural, tool-specific message
        let detail = tool;
        let msg = tool;
        const input = event.tool_input;
        if (input) {
          const fileName = 'file_path' in input ? String(input.file_path).split('/').pop() : '';
          const cmd = 'command' in input ? String(input.command) : '';
          const pattern = 'pattern' in input ? String(input.pattern) : '';
          const query = 'query' in input ? String(input.query) : '';
          const url = 'url' in input ? String(input.url) : '';

          switch (tool) {
            case 'Read':
              msg = `Reading ${fileName || 'file'}...`;
              detail = `Read: ${fileName}`;
              break;
            case 'Edit':
              msg = `Editing ${fileName || 'file'}...`;
              detail = `Edit: ${fileName}`;
              break;
            case 'Write':
              msg = `Writing ${fileName || 'file'}...`;
              detail = `Write: ${fileName}`;
              break;
            case 'NotebookEdit':
              msg = `Editing notebook ${fileName || ''}...`;
              detail = `NotebookEdit: ${fileName}`;
              break;
            case 'Grep':
              msg = `Searching for "${pattern.length > 30 ? pattern.slice(0, 30) + '...' : pattern}"`;
              detail = `Grep: ${pattern}`;
              break;
            case 'Glob':
              msg = `Finding files: ${pattern.length > 30 ? pattern.slice(0, 30) + '...' : pattern}`;
              detail = `Glob: ${pattern}`;
              break;
            case 'Bash': {
              const shortCmd = cmd.length > 35 ? cmd.slice(0, 35) + '...' : cmd;
              msg = `$ ${shortCmd}`;
              detail = `Bash: ${shortCmd}`;
              break;
            }
            case 'WebFetch':
              msg = `Fetching ${url ? new URL(url).hostname : 'web page'}...`;
              detail = `WebFetch: ${url}`;
              break;
            case 'WebSearch':
              msg = `Searching: "${query.length > 30 ? query.slice(0, 30) + '...' : query}"`;
              detail = `WebSearch: ${query}`;
              break;
            case 'Task':
              msg = 'Delegating to a worker bee...';
              detail = 'Task: spawning subagent';
              break;
            case 'EnterPlanMode':
              msg = 'Planning my approach...';
              detail = 'Planning';
              break;
            case 'ExitPlanMode':
              msg = 'Plan ready for review!';
              detail = 'Plan complete';
              break;
            case 'AskUserQuestion':
              msg = 'Got a question for you...';
              detail = 'Asking question';
              break;
            case 'TaskCreate':
              msg = 'Creating a task...';
              detail = 'TaskCreate';
              break;
            case 'TaskUpdate':
              msg = 'Updating task status...';
              detail = 'TaskUpdate';
              break;
            case 'Skill':
              msg = 'Running skill...';
              detail = 'Skill';
              break;
            default:
              msg = `Using ${tool}...`;
              detail = tool;
          }
        }

        queen.message = msg;
        this.dispatchToHiredBees(tool, activity);
        this.log('PreToolUse', detail, eventIcon('PreToolUse', tool), project);

        // Update stats
        if (tool === 'Read' || tool === 'Glob' || tool === 'Grep') this.state.stats.filesRead++;
        if (tool === 'Edit' || tool === 'Write') this.state.stats.filesWritten++;
        if (tool === 'Bash') this.state.stats.commandsRun++;
        break;
      }

      case 'PostToolUse': {
        const tool = event.tool_name || 'unknown';
        const doneMessages: Record<string, string> = {
          Read: 'Got it!', Edit: 'Changes saved!', Write: 'File written!',
          Grep: 'Found results!', Glob: 'Files located!', Bash: 'Command done!',
          WebFetch: 'Page loaded!', WebSearch: 'Results in!',
        };
        queen.message = doneMessages[tool] || `${tool} done ✓`;
        this.idleHiredBees(doneMessages[tool] ? '✓ Done!' : undefined);
        this.log('PostToolUse', `${tool} completed`, eventIcon('PostToolUse', tool), project);
        break;
      }

      case 'PostToolUseFailure': {
        const tool = event.tool_name || 'unknown';
        this.state.stats.errors++;
        queen.activity = 'thinking';
        const errMsg = event.error ? String(event.error).slice(0, 40) : '';
        queen.message = errMsg ? `Hmm, ${tool} failed: ${errMsg}` : `${tool} failed — let me rethink`;
        this.idleHiredBees('Hmm...');
        this.log('PostToolUseFailure', `${tool} error: ${event.error || 'unknown'}`, '❌', project);
        speechText = `Hmm, that didn't work. Let me try a different approach.`;
        break;
      }

      case 'Stop': {
        this.moveBee(queen, 'meeting-room', 'presenting');
        queen.message = 'All done! Here you go';
        this.idleHiredBees('Done!');
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

      case 'PermissionRequest': {
        const tool = event.tool_name || 'unknown';
        queen.activity = 'thinking';
        queen.message = `May I use ${tool}?`;
        this.log('PermissionRequest', `Permission needed: ${tool}`, eventIcon('PermissionRequest'), project);
        break;
      }

      case 'Notification': {
        const msg = event.message || event.notification_type || 'notification';
        const shortMsg = msg.length > 60 ? msg.slice(0, 60) + '...' : msg;
        queen.message = shortMsg;
        this.log('Notification', shortMsg, eventIcon('Notification'), project);
        break;
      }

      case 'PreCompact': {
        const trigger = event.trigger || 'auto';
        queen.message = 'Tidying up my memory...';
        this.log('PreCompact', `Context compaction (${trigger})`, eventIcon('PreCompact'), project);
        break;
      }

      case 'TeammateIdle': {
        const teammate = event.teammate_name || 'teammate';
        this.log('TeammateIdle', `${teammate} is idle`, eventIcon('TeammateIdle'), project);
        break;
      }

      case 'TaskCompleted': {
        const subject = event.task_subject || 'task';
        const shortSubject = subject.length > 50 ? subject.slice(0, 50) + '...' : subject;
        queen.message = `Finished: ${shortSubject}`;
        this.log('TaskCompleted', shortSubject, eventIcon('TaskCompleted'), project);
        break;
      }

      case 'SessionEnd': {
        this.activeSessions.delete(event.session_id);
        this.refreshActiveProjects();
        this.state.sessionActive = this.activeSessions.size > 0;
        this.moveBee(queen, 'lobby', 'idle');
        queen.message = 'See you next time!';
        this.idleHiredBees('Break time!');
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

  /** Dispatch a tool event to matching hired bees */
  private dispatchToHiredBees(tool: string, activity: BeeActivity) {
    for (const bee of this.state.bees) {
      if (bee.role !== 'hired' || !bee.hiredType) continue;
      const tools = bee.hiredTools || HIRED_BEE_TOOLS[bee.hiredType] || [];
      if (!tools.includes(tool)) continue;

      const workRoom = HIRED_BEE_WORKROOM[bee.hiredType];
      this.moveBee(bee, workRoom, activity);
      const msgs = HIRED_BEE_MESSAGES[bee.hiredType];
      bee.message = msgs[activity] || msgs.default || 'Working...';
    }
  }

  /** Return all hired bees to idle */
  private idleHiredBees(message?: string) {
    for (const bee of this.state.bees) {
      if (bee.role !== 'hired') continue;
      bee.activity = 'idle';
      if (message) bee.message = message;
    }
  }

  /** Move all hired bees to their work rooms */
  private mobilizeHiredBees() {
    for (const bee of this.state.bees) {
      if (bee.role !== 'hired' || !bee.hiredType) continue;
      const workRoom = HIRED_BEE_WORKROOM[bee.hiredType];
      this.moveBee(bee, workRoom, 'walking');
      bee.message = 'Time to work!';
    }
  }

  /** Transition to idle state */
  private goIdle() {
    const queen = this.state.bees[0];
    const idleRooms: Room[] = ['water-cooler', 'coffee'];
    const room = idleRooms[Math.floor(Math.random() * idleRooms.length)];
    const idleActivities: BeeActivity[] = ['drinking-coffee', 'chatting', 'idle'];
    const activity = idleActivities[Math.floor(Math.random() * idleActivities.length)];
    this.moveBee(queen, room, activity);
    queen.message = activity === 'drinking-coffee' ? 'Coffee break' : activity === 'chatting' ? 'Just hanging out' : undefined;
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

  /** Process a BEEHAVEN command from Claude's output */
  processCityCommand(project: string, cmd: BeeHavenCommand): void {
    const state = this.getCityState(project);
    const now = Date.now();

    switch (cmd.action) {
      case 'mark': {
        if (!cmd.file || !cmd.indicator) break;
        // Remove existing indicator of same type on same file
        state.indicators = state.indicators.filter(
          i => !(i.file === cmd.file && i.type === cmd.indicator)
        );
        state.indicators.push({
          type: cmd.indicator,
          note: cmd.note || '',
          file: cmd.file,
          addedAt: now,
        });
        break;
      }
      case 'unmark': {
        if (!cmd.file) break;
        if (cmd.indicator) {
          state.indicators = state.indicators.filter(
            i => !(i.file === cmd.file && i.type === cmd.indicator)
          );
        } else {
          state.indicators = state.indicators.filter(i => i.file !== cmd.file);
        }
        break;
      }
      case 'board-add': {
        if (!cmd.title) break;
        const id = `item-${now}-${Math.random().toString(36).slice(2, 8)}`;
        state.board.push({
          id,
          title: cmd.title,
          status: cmd.status || 'backlog',
          file: cmd.file,
          indicator: cmd.indicator,
          note: cmd.note,
          createdAt: now,
          updatedAt: now,
        });
        break;
      }
      case 'board-move': {
        if (!cmd.itemId || !cmd.status) break;
        const item = state.board.find(b => b.id === cmd.itemId);
        if (item) {
          item.status = cmd.status;
          item.updatedAt = now;
        }
        break;
      }
      case 'board-remove': {
        if (!cmd.itemId) break;
        state.board = state.board.filter(b => b.id !== cmd.itemId);
        break;
      }
      case 'analyze': {
        // No-op on server — triggers client-side highlight sweep
        break;
      }
    }
  }

  /** Get all city states keyed by project for WS broadcast */
  getAllCityState(): Record<string, CityProjectState> {
    const result: Record<string, CityProjectState> = {};
    for (const [project, state] of this.cityState) {
      result[project] = state;
    }
    return result;
  }

  /** Assemble full project context for Clearly cloud sync */
  getProjectSyncData(project: string): ProjectSyncData | null {
    const rootPath = this.projectPaths.get(project);
    if (!rootPath) return null;

    // Scan file tree (uses 30s cache internally)
    const tree = scanProjectFiles(project, rootPath);
    const fileTree = tree
      ? { files: tree.files, directories: tree.directories, fileCount: tree.files.length }
      : { files: [], directories: [], fileCount: 0 };

    // Get city state (indicators + board)
    const cityState = this.getCityState(project);

    // Filter terminal log to this project's entries (last 200)
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
    // Active sessions (highest priority — currently running)
    for (const proj of this.activeSessions.values()) {
      if (!this.deletedProjects.has(proj)) all.add(proj);
    }
    // Known projects that have resolved filesystem paths (from ~/.claude/projects/ scan)
    for (const proj of this.knownProjects) {
      if (!this.deletedProjects.has(proj) && this.projectPaths.has(proj)) {
        all.add(proj);
      }
    }
    this.state.projects = Array.from(all).sort();
  }

  // --- Team Management ---

  /** Calculate office level from hired bee count */
  static calcOfficeLevel(hiredCount: number): number {
    if (hiredCount <= 1) return 1;
    if (hiredCount <= 3) return 2;
    if (hiredCount <= 5) return 3;
    return 4;
  }

  /** Recalculate office level (cosmetic — all rooms always unlocked) */
  private refreshOfficeLevel() {
    const hiredCount = this.state.bees.filter(b => b.role === 'hired').length;
    this.state.officeLevel = Office.calcOfficeLevel(hiredCount);
    this.state.unlockedRooms = ALL_ROOMS;
  }

  /** Get hire cost for a bee type */
  static getHireCost(type: HiredBeeType): number {
    return HIRED_BEE_CONFIG[type]?.cost ?? 999;
  }

  /** Hire a new bee. Returns the hired bee or an error string. */
  hireBee(type: HiredBeeType): HiredBee | string {
    const config = HIRED_BEE_CONFIG[type];
    if (!config) return 'Unknown bee type';

    const hiredCount = this.state.bees.filter(b => b.role === 'hired').length;
    if (hiredCount >= MAX_HIRED_BEES) return `Team is full (max ${MAX_HIRED_BEES})`;
    if (this.state.shop.honey < config.cost) return `Not enough honey (need ${config.cost}, have ${this.state.shop.honey})`;

    // Deduct honey
    this.state.shop.honey -= config.cost;

    // Pick a name
    const pool = BEE_NAMES[type];
    const usedNames = new Set(this.state.bees.map(b => b.name));
    const name = pool.find(n => !usedNames.has(n)) || `${type}-${hiredCount + 1}`;

    const hiredBee: HiredBee = {
      id: `hired-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      name,
      hiredAt: Date.now(),
    };

    const room = config.homeRoom;

    // Spawn at recruiter position, target home room
    const recruiter = this.state.bees.find(b => b.role === 'recruiter');
    const spawnX = recruiter?.x ?? 0;
    const spawnY = recruiter?.y ?? 0;
    const homePos = roomCenter(room);

    this.state.bees.push({
      id: hiredBee.id,
      name,
      role: 'hired',
      room,
      activity: 'walking',
      x: spawnX,
      y: spawnY,
      targetX: homePos.x,
      targetY: homePos.y,
      color: config.color,
      message: 'Reporting for duty!',
      hiredType: type,
      hiredTools: HIRED_BEE_TOOLS[type],
    });

    this.refreshOfficeLevel();
    this.log('TeamHire', `${name} (${type}) joined the team`, '🎉');
    console.log(`[office] Hired ${name} (${type}) — team size: ${hiredCount + 1}, level: ${this.state.officeLevel}`);

    return hiredBee;
  }

  /** Fire a hired bee. Returns error string or null. */
  fireBee(id: string): string | null {
    const idx = this.state.bees.findIndex(b => b.id === id && b.role === 'hired');
    if (idx < 0) return 'Bee not found';

    const bee = this.state.bees[idx];
    this.state.bees.splice(idx, 1);
    this.refreshOfficeLevel();
    this.log('TeamFire', `${bee.name} left the team`, '👋');
    console.log(`[office] Fired ${bee.name} — team size: ${this.state.bees.filter(b => b.role === 'hired').length}`);

    return null;
  }

  /** Get current team as HiredBee[] for persistence */
  getTeam(): HiredBee[] {
    return this.state.bees
      .filter(b => b.role === 'hired' && b.hiredType)
      .map(b => {
        const typeDefaults = HIRED_BEE_TOOLS[b.hiredType!];
        const typeColor = HIRED_BEE_CONFIG[b.hiredType!]?.color;
        const entry: HiredBee = {
          id: b.id,
          type: b.hiredType!,
          name: b.name,
          hiredAt: 0,
        };
        // Only persist custom overrides (not type defaults)
        if (b.hiredTools && JSON.stringify(b.hiredTools) !== JSON.stringify(typeDefaults)) {
          entry.customTools = b.hiredTools;
        }
        if (b.color !== typeColor) {
          entry.customColor = b.color;
        }
        return entry;
      });
  }

  /** Update a hired bee's customization. Returns error string or null. */
  updateBee(id: string, updates: { name?: string; customTools?: string[]; customColor?: string }): string | null {
    const bee = this.state.bees.find(b => b.id === id && b.role === 'hired');
    if (!bee || !bee.hiredType) return 'Bee not found';

    if (updates.name !== undefined) {
      const name = updates.name.trim();
      if (name.length === 0 || name.length > 20) return 'Name must be 1-20 characters';
      bee.name = name;
    }

    if (updates.customColor !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(updates.customColor)) return 'Invalid color format';
      bee.color = updates.customColor;
    }

    if (updates.customTools !== undefined) {
      if (!Array.isArray(updates.customTools)) return 'customTools must be an array';
      bee.hiredTools = updates.customTools;
    }

    this.log('TeamUpdate', `${bee.name} updated`, '⚙️');
    return null;
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
