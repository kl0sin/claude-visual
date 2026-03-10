import type { ClaudeEvent, TokenUsage } from "../../shared/types";

// ── Raw DB row shapes ────────────────────────────────────────────────────────

export interface DbEvent {
  id: string;
  type: string;
  timestamp: number;
  session_id: string | null;
  tool_name: string | null;
  agent_type: string | null;
  duration: number | null;
  data: string;
}

export interface DbSession {
  id: string;
  first_event: number;
  last_event: number;
  event_count: number;
  status: string;
  is_processing: number;
  stop_reason: string | null;
  cwd: string | null;
}

export interface DbAgent {
  id: string;
  type: string;
  description: string | null;
  start_time: number;
  end_time: number | null;
  status: string;
  session_id: string | null;
}

export interface DbTokenRow {
  session_id: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
}

// ── Row → domain object converters ──────────────────────────────────────────

export function rowToEvent(r: DbEvent): ClaudeEvent {
  return {
    id: r.id,
    type: r.type,
    timestamp: r.timestamp,
    sessionId: r.session_id ?? undefined,
    toolName: r.tool_name ?? undefined,
    agentType: r.agent_type ?? undefined,
    duration: r.duration ?? undefined,
    data: JSON.parse(r.data) as Record<string, any>,
  };
}

export function tokenRowToUsage(r: DbTokenRow): TokenUsage {
  return {
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheCreationTokens: r.cache_creation_tokens,
    cacheReadTokens: r.cache_read_tokens,
    totalTokens: r.total_tokens,
  };
}
