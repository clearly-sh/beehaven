// ============================================================================
// BeeHaven Office - Type Definitions
// ============================================================================

/** Claude Code hook events */
export type HookEventName =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Stop'
  | 'SessionEnd'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'Notification'
  | 'PreCompact'
  | 'TeammateIdle'
  | 'TaskCompleted';

/** Raw event from Claude Code hooks */
export interface ClaudeEvent {
  session_id: string;
  hook_event_name: HookEventName;
  cwd: string;
  timestamp: string;
  // Tool events
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_use_id?: string;
  error?: string;
  // Prompt events
  prompt?: string;
  // Session events
  source?: string;
  model?: string;
  // Stop events
  stop_hook_active?: boolean;
  // Subagent events
  agent_id?: string;
  agent_type?: string;
  // Notification events
  notification_type?: string;
  message?: string;
  // PreCompact events
  trigger?: string;
  // Team events
  teammate_name?: string;
  team_name?: string;
  task_id?: string;
  task_subject?: string;
  // PermissionRequest events
  reason?: string;
  // Transcript (present on most events)
  transcript_path?: string;
}

/** Rooms in the BeeHaven office — WeWork single-team layout */
export type Room =
  | 'lobby'
  | 'library'
  | 'studio'
  | 'web-booth'
  | 'phone-b'
  | 'server-room'
  | 'meeting-room'
  | 'water-cooler'
  | 'coffee';

/** Activity a bee character can be doing */
export type BeeActivity =
  | 'idle'
  | 'walking'
  | 'coding'
  | 'reading'
  | 'running-command'
  | 'thinking'
  | 'presenting'
  | 'drinking-coffee'
  | 'chatting'
  | 'arriving'
  | 'searching'
  | 'browsing'
  | 'celebrating';

/** Hired bee type */
export type HiredBeeType = 'developer' | 'designer' | 'manager' | 'researcher' | 'devops';

/** A hired bee persisted to config */
export interface HiredBee {
  id: string;
  type: HiredBeeType;
  name: string;
  hiredAt: number;
  customTools?: string[];
  customColor?: string;
}

/** A bee character in the office */
export interface BeeCharacter {
  id: string;
  name: string;
  role: 'queen' | 'worker' | 'narrator' | 'recruiter' | 'hired';
  room: Room;
  activity: BeeActivity;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  color: string;
  message?: string;
  messageTimeout?: number;
  project?: string;
  hiredType?: HiredBeeType;
  hiredTools?: string[];
}

/** Room definition with position coordinates */
export interface RoomDef {
  id: Room;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/** State of the entire office */
export interface OfficeState {
  bees: BeeCharacter[];
  currentEvent?: string;
  currentTool?: string;
  sessionActive: boolean;
  eventLog: EventLogEntry[];
  stats: OfficeStats;
  projects?: string[];
  terminalLog?: TerminalEntry[];
  shop: ShopState;
  officeLevel: number;
  unlockedRooms: Room[];
}

export interface EventLogEntry {
  timestamp: string;
  event: string;
  detail: string;
  icon: string;
  project?: string;
}

export interface TerminalEntry {
  event: string;
  content: string;
  timestamp: string;
  project?: string;
  role?: 'user' | 'claude' | 'tool' | 'error';
}

/** Persisted session data saved to ~/.beehaven/sessions/ */
export interface SessionPersistData {
  id: string;
  project?: string;
  startTime: string;
  endTime: string;
  terminalLog: TerminalEntry[];
  eventLog: EventLogEntry[];
  stats: OfficeStats;
}

export interface OfficeStats {
  toolCalls: number;
  filesRead: number;
  filesWritten: number;
  commandsRun: number;
  errors: number;
  sessionStartTime?: string;
}

// ============================================================================
// Shop & Currency Types
// ============================================================================

/** A purchasable item in the shop */
export interface ShopItem {
  id: string;
  name: string;
  type: 'skin' | 'accessory';
  price: number;
  color?: string;
  description?: string;
}

/** Full shop state broadcast to clients */
export interface ShopState {
  honey: number;
  ownedSkins: string[];
  ownedAccessories: string[];
  equippedSkin: string;
  equippedAccessory: string | null;
  items: ShopItem[];
}

/** Persisted shop data (subset of ShopState, without catalog) */
export interface ShopPersistData {
  honey: number;
  ownedSkins: string[];
  ownedAccessories: string[];
  equippedSkin: string;
  equippedAccessory: string | null;
}

/** WebSocket message from server to client */
export interface WSMessage {
  type: 'state' | 'event' | 'speech' | 'transcript' | 'response' | 'shop-result';
  payload: unknown;
}

/** TTS request */
export interface SpeechRequest {
  text: string;
  priority: 'high' | 'normal' | 'low';
}

// ============================================================================
// Building & Onboarding Types
// ============================================================================

/** Tier of BeeHaven usage */
export type BeeHavenTier = 'local' | 'connected' | 'team';

/** Clearly account profile returned from relay heartbeat */
export interface ClearlyProfile {
  displayName: string;
  photoURL?: string;
  email?: string;
  subscriptionPlan: 'free' | 'starter' | 'pro' | 'studio';
  subscriptionStatus?: string;
}

/** Full onboarding config persisted to ~/.beehaven/config.json */
export interface OnboardingConfig {
  onboarded: boolean;
  tier: BeeHavenTier;
  token?: string;
  endpoint?: string;
  pinHash?: string;
  building?: {
    id: string;
    name: string;
    floor: number;
    desk: number;
  };
  user?: ClearlyProfile;
  shop?: ShopPersistData;
  team?: HiredBee[];
}

/** State of the entire building (returned from relay) */
export interface BuildingState {
  id: string;
  name: string;
  floors: FloorState[];
}

/** A single floor in the building */
export interface FloorState {
  number: number;
  type: 'lobby' | 'amenity' | 'office';
  label: string;
  desks?: DeskState[];
}

/** A single desk on a floor */
export interface DeskState {
  number: number;
  userId?: string;
  displayName?: string;
  active: boolean;
}

// ============================================================================
// City State Types (used by project sync)
// ============================================================================

/** Indicator types that can be placed on city buildings */
export type IndicatorType = 'bug' | 'feature' | 'refactor' | 'priority' | 'in-progress' | 'done';

/** An indicator badge on a building in the city view */
export interface CityIndicator {
  type: IndicatorType;
  note: string;
  file: string;       // relative path e.g. "src/server.ts"
  addedAt: number;
}

/** A board item in the project Kanban board */
export interface BoardItem {
  id: string;
  title: string;
  status: 'backlog' | 'in-progress' | 'done';
  file?: string;
  indicator?: IndicatorType;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** Per-project city state (indicators + board) */
export interface CityProjectState {
  indicators: CityIndicator[];
  board: BoardItem[];
}

// ============================================================================
// Project Sync Types (Clearly Integration)
// ============================================================================

/** Full project context payload synced to Clearly cloud */
export interface ProjectSyncData {
  project: string;
  path: string;
  fileTree: {
    files: { path: string; name: string; ext: string; dir: string; size: number }[];
    directories: string[];
    fileCount: number;
  };
  cityState: CityProjectState;
  conversations: TerminalEntry[];
  syncedAt: number;
}
