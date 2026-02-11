/**
 * Claude Code Integration Types
 *
 * Types for IPC communication between Electron main process
 * and renderer process for Claude Code subprocess management.
 */

// ============================================
// CONFIGURATION
// ============================================

export interface ContextReference {
  id: string;
  type: 'note' | 'block' | 'brand';
  name: string;
  blockId?: string;
}

export interface ClaudeCodeConfig {
  /** Path to claude CLI binary (auto-detected or user-configured) */
  binaryPath?: string;
  /** Working directory for claude sessions (defaults to user's home directory) */
  workingDirectory?: string;
  /** Model to use: 'sonnet', 'opus', 'haiku' or full model name */
  model?: string;
  /** Custom instructions from SettingsChip (appended to default system prompt) */
  customInstructions?: string;
  /** Art style instructions */
  artStyleInstructions?: string;
  /** Context references (notes, blocks, brands) */
  contextReferences?: ContextReference[];
  /** Permission level for tool execution */
  permissionLevel: 'ask' | 'auto-approve-safe' | 'auto-approve-all';
}

/** Canvas state for Claude context awareness */
export interface CanvasContext {
  /** Current note title */
  noteTitle?: string;
  /** Current note ID */
  noteId?: string;
  /** Blocks on the canvas with their types and summary */
  blocks: Array<{
    id: string;
    type: string;
    /** Brief description or content preview */
    summary?: string;
    /** Position on canvas */
    position?: { x: number; y: number };
    /** Dimensions */
    size?: { width: number; height: number };
    /** Image URL for image blocks */
    imageUrl?: string;
    /** Website URL for website/iframe blocks */
    websiteUrl?: string;
    /** YouTube video ID */
    videoId?: string;
    /** Text content for text blocks */
    content?: string;
    /** Analysis metadata */
    analysis?: {
      midjourneyPrompt?: string;
      brandAnalysis?: {
        colors?: string[];
        style?: string;
        mood?: string[];
        personality?: string;
      };
      aiDescription?: string;
      tags?: string[];
    };
  }>;
  /** Currently selected block IDs */
  selectedBlockIds?: string[];
  /** Canvas dimensions */
  canvasSize?: { width: number; height: number };
  /** Viewport/scroll position */
  viewport?: { x: number; y: number; zoom: number };
}

export interface ClaudeCodeSession {
  id: string;
  status: 'starting' | 'ready' | 'processing' | 'error' | 'terminated';
  pid?: number;
  startedAt: number;
}

// ============================================
// PROMPT INPUT
// ============================================

export interface ClaudePromptInput {
  requestId?: string;
  text: string;
  /** Attached files as base64 */
  attachments?: Array<{
    name: string;
    mimeType: string;
    data: string;
  }>;
  /** @deprecated Use attachments instead */
  files?: Array<{
    name: string;
    mimeType: string;
    data: string;
  }>;
  /** Audio transcription (pre-processed) */
  audioTranscript?: string;
  /** Mode from LiquidGlassInput */
  mode?: 'text' | 'voice' | 'image' | 'vectorize' | 'image-gen';
  /** Current canvas state for context awareness */
  canvasContext?: CanvasContext;
  /** Settings from SettingsChip */
  settings?: {
    customInstructions?: string;
    artStyleInstructions?: string;
    contextReferences?: ContextReference[];
    outputFormat?: 'svg' | 'png' | 'text';
    aspectRatio?: string;
    /** WebSocket chat room ID for conversation context */
    chatRoomId?: string;
  };
}

// ============================================
// TOOL TYPES
// ============================================

export type ClaudeToolName =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Glob'
  | 'Grep'
  | 'WebFetch'
  | 'WebSearch'
  | 'Task';

export type ClaudeToolStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface ClaudeToolUse {
  id: string;
  name: ClaudeToolName;
  input: Record<string, unknown>;
  /** For permission UI */
  description?: string;
  riskLevel?: 'safe' | 'moderate' | 'dangerous';
}

export interface ClaudeToolResult {
  success: boolean;
  output?: string;
  error?: string;
  truncated?: boolean;
  duration?: number;
}

// ============================================
// ARTIFACT TYPES
// ============================================

export type ClaudeArtifactType = 'svg' | 'code' | 'text' | 'markdown' | 'json' | 'image';

export interface ClaudeArtifact {
  id: string;
  type: ClaudeArtifactType;
  title?: string;
  content: string;
  mimeType?: string;
  language?: string;
}

// ============================================
// CANVAS BLOCK TYPES
// ============================================

/** Canvas block created from Claude's streaming output via <canvas> tags */
export interface CanvasBlockData {
  type: 'svg' | 'website' | 'youtube' | 'image' | 'code';
  title?: string;
  content?: string;
  // Type-specific attributes
  url?: string; // website, image
  id?: string; // youtube video ID
  language?: string; // code
  src?: string; // image (alias for url)
}

// ============================================
// USAGE & METRICS
// ============================================

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

// ============================================
// IPC EVENTS
// ============================================

export type ClaudeCodeEvent =
  | { type: 'session:started'; sessionId: string }
  | { type: 'session:ready'; sessionId: string }
  | { type: 'session:error'; sessionId: string; error: string }
  | { type: 'session:terminated'; sessionId: string }
  | {
      type: 'response:thinking';
      sessionId: string;
      requestId: string;
      content: string;
      delta?: string;
    }
  | { type: 'response:text'; sessionId: string; requestId: string; content: string; delta?: string }
  | { type: 'response:tool-use'; sessionId: string; requestId: string; tool: ClaudeToolUse }
  | {
      type: 'response:tool-result';
      sessionId: string;
      requestId: string;
      toolId: string;
      result: ClaudeToolResult;
    }
  | { type: 'response:artifact'; sessionId: string; requestId: string; artifact: ClaudeArtifact }
  | {
      type: 'response:complete';
      sessionId: string;
      requestId: string;
      usage?: ClaudeUsage;
      moodUrl?: string;
    }
  | { type: 'response:error'; sessionId: string; requestId: string; error: string }
  // Canvas block events (parsed from <canvas> tags in Claude's output)
  | { type: 'canvas:block'; sessionId: string; requestId: string; block: CanvasBlockData }
  // File operation events (for workspace file tracking)
  | {
      type: 'file:created';
      sessionId: string;
      requestId: string;
      file: { path: string; content: string; name: string; extension: string };
    }
  | {
      type: 'file:edited';
      sessionId: string;
      requestId: string;
      file: {
        path: string;
        name: string;
        extension: string;
        oldString?: string;
        newString?: string;
      };
    }
  | {
      type: 'permission:required';
      sessionId: string;
      requestId: string;
      toolId: string;
      tool: ClaudeToolUse;
    }
  // Login events
  | { type: 'login:progress'; sessionId: string; data: { message: string } }
  | { type: 'login:complete'; sessionId: string; data: { success: boolean } }
  | { type: 'login:error'; sessionId: string; data: { error: string } }
  // Install events
  | { type: 'install:progress'; sessionId: string; data: { message: string; step: string } }
  | {
      type: 'install:complete';
      sessionId: string;
      data: { success: boolean; method: 'homebrew' | 'npm' };
    }
  | { type: 'install:error'; sessionId: string; data: { error: string } };

// ============================================
// INSTALLATION & AUTH
// ============================================

export interface ClaudeInstallationStatus {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
}

export interface ClaudeAuthStatus {
  authenticated: boolean;
  accountType?: 'free' | 'pro' | 'max' | 'enterprise';
  email?: string;
  error?: string;
}

// ============================================
// CANVAS BLOCK DATA
// ============================================

export interface ClaudeThinkingBlockData {
  content: string;
  isStreaming: boolean;
  isCollapsed: boolean;
  autoCollapse: boolean;
  timestamp: number;
  durationMs?: number;
  summary?: string;
  flowId: string;
  sequenceIndex: number;
}

export interface ClaudeToolBlockData {
  toolName: ClaudeToolName;
  toolLabel: string;
  status: ClaudeToolStatus;
  parameters: Record<string, unknown>;
  result?: ClaudeToolResult;
  isCollapsed: boolean;
  showFullOutput: boolean;
  startedAt: number;
  completedAt?: number;
  flowId: string;
  sequenceIndex: number;
  parentThinkingId?: string;
}

export interface ClaudeArtifactBlockData {
  artifactType: ClaudeArtifactType;
  content: string;
  title?: string;
  language?: string;
  filePath?: string;
  isInteractive: boolean;
  isEditable: boolean;
  showLineNumbers: boolean;
  createdAt: number;
  sourceToolId?: string;
  flowId: string;
  sequenceIndex: number;
}

export interface ClaudeCanvasBlockData {
  blockType: 'thinking' | 'tool' | 'artifact';
  thinkingData?: ClaudeThinkingBlockData;
  toolData?: ClaudeToolBlockData;
  artifactData?: ClaudeArtifactBlockData;
  flowId: string;
  flowPosition: number;
}
