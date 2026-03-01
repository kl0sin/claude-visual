export interface ClaudeEvent {
  id: string;
  type: string;
  timestamp: number;
  data: Record<string, any>;
  toolName?: string;
  agentType?: string;
  sessionId?: string;
  duration?: number;
}

export interface AgentProcess {
  id: string;
  type: string;
  description?: string;
  startTime: number;
  endTime?: number;
  status: "active" | "completed";
  sessionId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

export interface SessionInfo {
  id: string;
  firstEvent: number;
  lastEvent: number;
  eventCount: number;
  status: "active" | "ended";
  isProcessing: boolean;
}

export interface PendingTool {
  tool: string;
  since: number;
}

export interface SessionStats {
  totalEvents: number;
  toolCounts: Record<string, number>;
  toolFailCounts: Record<string, number>;
  agentCounts: Record<string, number>;
  eventTypeCounts: Record<string, number>;
  activeAgents: AgentProcess[];
  tokens: TokenUsage;
  pendingTools: PendingTool[];
  model?: string;
  firstEvent?: number;
  lastEvent?: number;
}

export type WSMessage =
  | { type: "event"; data: ClaudeEvent; stats: SessionStats; sessions: SessionInfo[] }
  | { type: "snapshot"; events: ClaudeEvent[]; stats: SessionStats; sessions: SessionInfo[] }
  | { type: "stats"; stats: SessionStats; sessions: SessionInfo[] }
  | { type: "eventPatch"; events: ClaudeEvent[] }
  | { type: "clear" };

export const EMPTY_TOKENS: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
};

// ── HISTORY BROWSER TYPES ──────────────────────────────────

export interface HistoryProject {
  id: string;           // encoded directory name
  name: string;         // display name (last path component)
  fullPath: string;     // decoded full path
  sessionCount: number;
  lastActivity?: number;
}

export interface HistorySession {
  id: string;           // UUID (filename without .jsonl)
  projectId: string;
  filePath: string;
  messageCount: number;
  userTurns: number;
  tokens: TokenUsage;
  model?: string;
  lastModified: number;
}

export type TranscriptContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean };

export interface TranscriptMessage {
  role: "user" | "assistant";
  content: TranscriptContent[];
  tokens?: TokenUsage;
  model?: string;
}

export interface HistorySessionDetail {
  session: HistorySession;
  messages: TranscriptMessage[];
  totalMessages: number;
  offset: number;
}

export interface HookStatus {
  installed: boolean;
}
