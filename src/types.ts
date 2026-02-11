// ============================================================================
// BeeHaven Office - Type Definitions
// ============================================================================

/** Claude Code hook events */
export type HookEventName =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Stop'
  | 'SessionEnd'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'Notification'
  | 'PreCompact';

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
}

/** Rooms in the BeeHaven office — WeWork single-team layout */
export type Room =
  | 'lobby'
  | 'desk'
  | 'server-room'
  | 'meeting-room'
  | 'water-cooler'
  | 'coffee'
  | 'phone-a'
  | 'phone-b';

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
  | 'celebrating';

/** A bee character in the office */
export interface BeeCharacter {
  id: string;
  name: string;
  role: 'queen' | 'worker' | 'narrator' | 'recruiter';
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
  chat?: ChatSession;
  agentScripts?: AgentScript[];
  projects?: string[];
  terminalLog?: TerminalEntry[];
  shop: ShopState;
}

/** Chat message in the recruiter conversation */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  agentScript?: {
    name: string;
    filename: string;
    status: 'draft' | 'committed' | 'pr-created';
  };
}

/** Chat session state */
export interface ChatSession {
  messages: ChatMessage[];
  projectId?: string;
  isProcessing: boolean;
}

/** Agent script metadata */
export interface AgentScript {
  name: string;
  filename: string;
  description: string;
  createdAt: string;
  status: 'draft' | 'committed' | 'pr-created';
  prUrl?: string;
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
  type: 'state' | 'event' | 'speech' | 'transcript' | 'chat' | 'projects' | 'agent-status' | 'shop-result';
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

/** Full onboarding config persisted to ~/.beehaven/config.json */
export interface OnboardingConfig {
  onboarded: boolean;
  tier: BeeHavenTier;
  token?: string;
  endpoint?: string;
  building?: {
    id: string;
    name: string;
    floor: number;
    desk: number;
  };
  user?: {
    displayName: string;
    photoURL?: string;
  };
  shop?: ShopPersistData;
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
