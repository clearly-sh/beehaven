/**
 * Claude Daemon Types
 *
 * Types for the 24/7 Claude daemon service, token management,
 * and WebSocket gateway communication.
 */

// ============================================
// TOKEN MANAGEMENT
// ============================================

export type TokenType = 'oauth' | 'api-key' | 'setup-token' | 'claude-login';

export interface TokenConfig {
  /** Type of token stored */
  type: TokenType;
  /** Encrypted token value (never stored plaintext) */
  encryptedToken?: string;
  /** When the token was created/stored */
  createdAt: number;
  /** When the token expires (if known) */
  expiresAt?: number;
  /** Account type from Claude auth */
  accountType?: 'free' | 'pro' | 'max' | 'enterprise';
  /** Email associated with the account */
  email?: string;
}

export interface TokenStatus {
  /** Whether a token is stored */
  hasToken: boolean;
  /** Whether the token is valid */
  isValid: boolean;
  /** Token type if available */
  type?: TokenType;
  /** Account type if authenticated */
  accountType?: 'free' | 'pro' | 'max' | 'enterprise';
  /** Email if authenticated */
  email?: string;
  /** When token expires */
  expiresAt?: number;
  /** Whether encryption is available on this platform */
  encryptionAvailable: boolean;
  /** Error message if any */
  error?: string;
}

export interface SetupTokenResult {
  success: boolean;
  token?: string;
  accountType?: 'free' | 'pro' | 'max' | 'enterprise';
  email?: string;
  error?: string;
}

// ============================================
// DAEMON CONFIGURATION
// ============================================

export interface DaemonConfig {
  /** Whether daemon auto-starts with app */
  autoStart: boolean;
  /** WebSocket gateway port */
  wsPort: number;
  /** Auto-sleep after this many ms of inactivity (0 = never) */
  maxIdleTime: number;
  /** Whether to persist session context across restarts */
  persistContext: boolean;
  /** Maximum session history to keep in memory */
  maxSessionHistory: number;
  /** Default model for daemon sessions */
  defaultModel?: string;
}

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  autoStart: true,
  wsPort: 18790,
  maxIdleTime: 0, // Never auto-sleep
  persistContext: true,
  maxSessionHistory: 100,
  defaultModel: undefined, // Use Claude's default
};

// ============================================
// DAEMON STATUS
// ============================================

export type DaemonState = 'stopped' | 'starting' | 'running' | 'error' | 'sleeping';

export interface DaemonStatus {
  /** Current daemon state */
  state: DaemonState;
  /** Claude session ID if active */
  sessionId: string | null;
  /** Number of connected WebSocket clients */
  wsClients: number;
  /** Daemon uptime in milliseconds */
  uptime: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Start timestamp */
  startedAt: number | null;
  /** Current model in use */
  model?: string;
  /** Error message if in error state */
  error?: string;
  /** Token status */
  tokenStatus: TokenStatus;
}

// ============================================
// WEBSOCKET PROTOCOL
// ============================================

/** Client -> Gateway messages */
export type WSClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'prompt'; id: string; text: string; canvasContext?: import('./types.js').CanvasContext }
  | { type: 'cancel'; promptId: string }
  | { type: 'status' }
  | { type: 'canvas-sync'; state: import('./types.js').CanvasContext }
  | { type: 'ping' };

/** Gateway -> Client messages */
export type WSGatewayMessage =
  | { type: 'authenticated'; sessionId: string; clientId: string }
  | { type: 'auth-error'; message: string }
  | { type: 'text'; id: string; delta: string; content: string }
  | { type: 'thinking'; id: string; content: string; delta?: string }
  | { type: 'tool-use'; id: string; tool: import('./types.js').ClaudeToolUse }
  | {
      type: 'tool-result';
      id: string;
      toolId: string;
      result: import('./types.js').ClaudeToolResult;
    }
  | { type: 'canvas-block'; id: string; block: import('./types.js').CanvasBlockData }
  | { type: 'artifact'; id: string; artifact: import('./types.js').ClaudeArtifact }
  | { type: 'complete'; id: string; usage?: import('./types.js').ClaudeUsage }
  | { type: 'error'; id: string; message: string }
  | { type: 'status'; daemon: DaemonStatus }
  | { type: 'pong' };

// ============================================
// IPC CHANNELS
// ============================================

/** IPC channel names for daemon communication */
export const DAEMON_IPC_CHANNELS = {
  // Token management
  SETUP_TOKEN: 'daemon:setup-token',
  VALIDATE_TOKEN: 'daemon:validate-token',
  TOKEN_STATUS: 'daemon:token-status',
  CLEAR_TOKEN: 'daemon:clear-token',

  // Daemon lifecycle
  START: 'daemon:start',
  STOP: 'daemon:stop',
  RESTART: 'daemon:restart',
  STATUS: 'daemon:status',

  // WebSocket info
  WS_URL: 'daemon:ws-url',
  LOCAL_AUTH: 'daemon:local-auth',

  // Events (main -> renderer)
  STATUS_CHANGED: 'daemon:status-changed',
  TOKEN_EXPIRING: 'daemon:token-expiring',
  ERROR: 'daemon:error',
} as const;

// ============================================
// INPUT CHANNEL ABSTRACTION
// ============================================

export type InputChannelType = 'web-ui' | 'voice' | 'webhook' | 'telegram' | 'mobile' | 'scheduled';

export interface InputChannel {
  /** Unique channel identifier */
  id: string;
  /** Channel type */
  type: InputChannelType;
  /** Display name */
  name: string;
  /** Priority (higher = processed first) */
  priority: number;
  /** Whether channel is currently connected */
  connected: boolean;
  /** Last activity timestamp */
  lastActivity: number;
}

export interface ChannelMessage {
  /** Message ID */
  id: string;
  /** Source channel */
  channelId: string;
  /** Message content */
  text: string;
  /** Optional attachments */
  attachments?: Array<{
    name: string;
    mimeType: string;
    data: string;
  }>;
  /** Canvas context if from web UI */
  canvasContext?: import('./types.js').CanvasContext;
  /** Timestamp */
  timestamp: number;
}

// ============================================
// TRAY MENU
// ============================================

export interface TrayMenuState {
  daemonRunning: boolean;
  sessionActive: boolean;
  wsClients: number;
  tokenValid: boolean;
}

// ============================================
// SMS COMMAND SYSTEM (Cloud Function → Desktop Daemon)
// ============================================

/**
 * Intent types for SMS commands
 * Parsed by Gemini in Cloud Functions before routing to desktop
 */
export type SmsCommandIntent =
  | 'video-create' // Create video content (TikTok, YouTube, etc.)
  | 'code-generate' // Write code, create website, build app
  | 'research' // Research a topic, find information
  | 'file-operation' // Create, edit, or manage files
  | 'canvas-action' // Interact with notes/canvas
  | 'schedule-task' // Schedule a future action
  | 'query' // Ask a question, get information
  | 'conversation' // General chat, no specific action
  | 'system-command' // System operations (status, config, etc.)
  | 'unknown'; // Could not parse intent

/**
 * Command status lifecycle
 */
export type SmsCommandStatus =
  | 'pending' // Waiting for desktop daemon to pick up
  | 'processing' // Desktop daemon is working on it
  | 'completed' // Successfully completed
  | 'failed' // Failed with error
  | 'cancelled'; // User cancelled

/**
 * Parsed intent from SMS message
 * Generated by Gemini in Cloud Function for lightweight routing
 */
export interface ParsedSmsIntent {
  type: SmsCommandIntent;
  confidence: number; // 0-1 confidence score
  entities: {
    topic?: string; // Main topic/subject
    platform?: string; // Target platform (tiktok, youtube, etc.)
    action?: string; // Specific action to take
    style?: string; // Style preference
    duration?: number; // Duration in seconds (for video)
    urls?: string[]; // Any URLs mentioned
  };
  rawText: string; // Original message text
}

/**
 * SMS Command document stored in Firestore
 * Path: users/{userId}/smsCommands/{commandId}
 *
 * Flow:
 * 1. Cloud Function receives SMS → creates this doc
 * 2. Desktop daemon listens via onSnapshot → picks up pending commands
 * 3. Daemon processes with Claude Code CLI
 * 4. Daemon writes result to smsResponses collection
 */
export interface SmsCommand {
  id: string;
  userId: string;

  // Source
  fromPhone: string; // User's phone number
  toPhone: string; // Bee's Twilio number

  // Content
  body: string; // Raw SMS body
  mediaUrls?: string[]; // MMS attachments

  // Parsed intent
  intent: ParsedSmsIntent;

  // Status
  status: SmsCommandStatus;

  // Tracking
  createdAt: number;
  processedAt?: number;
  completedAt?: number;

  // Desktop daemon tracking
  daemonSessionId?: string; // Claude Code session handling this
  workingDirectory?: string; // Where files are being created

  // Error handling
  error?: string;
  retryCount: number;
}

/**
 * SMS Response document stored in Firestore
 * Path: users/{userId}/smsResponses/{responseId}
 *
 * Flow:
 * 1. Desktop daemon writes response after processing command
 * 2. Cloud Function trigger (sendSmsResponse) picks up new docs
 * 3. Cloud Function sends SMS/MMS via Twilio
 */
export interface SmsResponse {
  id: string;
  commandId: string; // Reference to original command
  userId: string;

  // Response content
  status: 'pending' | 'sent' | 'failed';
  message: string; // Text message to send
  mediaUrls?: string[]; // MMS attachments (images, video thumbnails)

  // Rich content references
  videoUrl?: string; // Firebase Storage URL for video
  canvasBlockId?: string; // ID of created canvas block
  artifactUrls?: string[]; // Any created artifacts

  // Metadata
  createdAt: number;
  sentAt?: number;

  // Twilio tracking
  twilioMessageSid?: string;

  // Error handling
  error?: string;
}

/**
 * Video creation task for autonomous video workflow
 */
export interface VideoCreationTask {
  id: string;
  commandId: string;
  userId: string;

  // Task definition
  topic: string;
  platform: 'tiktok' | 'youtube-short' | 'instagram-reel' | 'generic';
  style?: string;
  duration: number; // Target duration in seconds

  // Status
  status: 'pending' | 'downloading' | 'editing' | 'rendering' | 'uploading' | 'complete' | 'failed';
  progress: number; // 0-100
  currentStep: string; // Human-readable step description

  // Source material
  sourceUrls?: string[]; // YouTube URLs to download
  downloadedFiles?: string[]; // Local file paths

  // Remotion composition
  compositionId?: string;
  compositionPath?: string;

  // Output
  outputPath?: string;
  outputUrl?: string; // Firebase Storage URL
  thumbnailUrl?: string;

  // Tracking
  createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // Error
  error?: string;
}

/**
 * Default values for SMS commands
 */
export const DEFAULT_SMS_COMMAND: Partial<SmsCommand> = {
  status: 'pending',
  retryCount: 0,
};

/**
 * Parse SMS command intent using simple heuristics
 * (Used as fallback if Gemini parsing fails)
 */
export function parseIntentHeuristic(text: string): ParsedSmsIntent {
  const lowerText = text.toLowerCase();

  // Video creation patterns
  if (
    lowerText.includes('tiktok') ||
    lowerText.includes('video') ||
    lowerText.includes('reel') ||
    lowerText.includes('short')
  ) {
    const platformMatch = lowerText.match(/(tiktok|youtube|instagram|reel)/);
    return {
      type: 'video-create',
      confidence: 0.7,
      entities: {
        platform: platformMatch?.[1] || 'tiktok',
        topic: text.replace(/make|create|edit|me|a|about/gi, '').trim(),
      },
      rawText: text,
    };
  }

  // Code generation patterns
  if (
    lowerText.includes('create') ||
    lowerText.includes('build') ||
    lowerText.includes('website') ||
    lowerText.includes('app') ||
    lowerText.includes('code')
  ) {
    return {
      type: 'code-generate',
      confidence: 0.6,
      entities: {
        topic: text,
      },
      rawText: text,
    };
  }

  // Research patterns
  if (
    lowerText.includes('research') ||
    lowerText.includes('find') ||
    lowerText.includes('search') ||
    lowerText.includes('look up')
  ) {
    return {
      type: 'research',
      confidence: 0.6,
      entities: {
        topic: text,
      },
      rawText: text,
    };
  }

  // Query patterns
  if (lowerText.startsWith('what') || lowerText.startsWith('how') || lowerText.startsWith('why')) {
    return {
      type: 'query',
      confidence: 0.5,
      entities: {},
      rawText: text,
    };
  }

  // Default to conversation
  return {
    type: 'conversation',
    confidence: 0.3,
    entities: {},
    rawText: text,
  };
}
