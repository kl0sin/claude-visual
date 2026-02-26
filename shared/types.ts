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
}

export interface PendingTool {
  tool: string;
  since: number;
}

export interface SessionStats {
  totalEvents: number;
  toolCounts: Record<string, number>;
  agentCounts: Record<string, number>;
  eventTypeCounts: Record<string, number>;
  activeAgents: AgentProcess[];
  tokens: TokenUsage;
  pendingTools: PendingTool[];
  firstEvent?: number;
  lastEvent?: number;
}

export type WSMessage =
  | { type: "event"; data: ClaudeEvent; stats: SessionStats; sessions: SessionInfo[] }
  | { type: "snapshot"; events: ClaudeEvent[]; stats: SessionStats; sessions: SessionInfo[] }
  | { type: "stats"; stats: SessionStats; sessions: SessionInfo[] }
  | { type: "clear" };

export const EMPTY_TOKENS: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
};
