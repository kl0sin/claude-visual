// Re-export shared types used by both server and frontend
export type {
  ClaudeEvent,
  AgentProcess,
  TokenUsage,
  SessionInfo,
  SessionStats,
  PendingTool,
  WSMessage,
  HistoryProject,
  HistorySession,
  HistorySessionDetail,
  TranscriptMessage,
  TranscriptContent,
  HookStatus,
  SearchMatch,
  SearchResult,
} from "../shared/types";

export { EMPTY_TOKENS } from "../shared/types";

// Frontend-only constants

export const EVENT_COLORS: Record<string, string> = {
  SubagentStart: "#00f0ff",
  SubagentStop: "#00f0ff",
  PreToolUse: "#ff2d95",
  PostToolUse: "#00ff9f",
  PostToolUseFailure: "#ff0040",
  SessionStart: "#f0ff00",
  SessionEnd: "#f0ff00",
  UserPromptSubmit: "#ffaa00",
  Stop: "#8b5cf6",
  Notification: "#06b6d4",
  TaskCompleted: "#00ff9f",
  PreCompact: "#ff6b00",
  PermissionRequest: "#ff2d95",
  ConfigChange: "#8892a8",
  WorktreeCreate: "#06b6d4",
  WorktreeRemove: "#06b6d4",
  Thinking: "#00f0ff",
  Output: "#a78bfa",
};

export const EVENT_ICONS: Record<string, string> = {
  SubagentStart: "▶",
  SubagentStop: "■",
  PreToolUse: "⚡",
  PostToolUse: "✓",
  PostToolUseFailure: "✗",
  SessionStart: "◉",
  SessionEnd: "◎",
  UserPromptSubmit: "›",
  Stop: "⏸",
  Notification: "◆",
  TaskCompleted: "★",
  PreCompact: "⟐",
  PermissionRequest: "⚠",
  Thinking: "◈",
  Output: "◆",
};
