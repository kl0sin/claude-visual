import type { ClaudeEvent, AgentProcess, TokenUsage, SessionInfo, SessionStats, PendingTool } from "../shared/types";
import { EMPTY_TOKENS } from "../shared/types";

export type { ClaudeEvent, AgentProcess, TokenUsage, SessionInfo, SessionStats };

export class EventStore {
  private events: ClaudeEvent[] = [];
  private agents: Map<string, AgentProcess> = new Map();
  private tokens: TokenUsage = { ...EMPTY_TOKENS };
  private sessionTokens: Map<string, TokenUsage> = new Map();
  private sessions: Map<string, SessionInfo> = new Map();
  private pendingTools: Map<string, PendingTool[]> = new Map();
  private idCounter = 0;

  add(raw: Record<string, any>): ClaudeEvent {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid event: expected an object");
    }

    const eventType = raw.event_type || raw.type || "unknown";
    const sessionId = raw.session_id || undefined;

    // agent_type can be empty string from Claude Code hooks — treat as undefined
    // Also check tool_input.subagent_type for Task tool events
    const agentType =
      raw.agent_type || raw.subagent_type || raw.tool_input?.subagent_type || undefined;

    const event: ClaudeEvent = {
      id: `evt_${++this.idCounter}`,
      type: eventType,
      timestamp: Date.now(),
      data: raw,
      toolName: raw.tool_name,
      agentType,
      sessionId,
    };

    // Track session
    if (sessionId) {
      const existing = this.sessions.get(sessionId);
      if (existing) {
        existing.lastEvent = event.timestamp;
        existing.eventCount++;
        if (eventType === "SessionEnd") {
          existing.status = "ended";
        }
      } else {
        this.sessions.set(sessionId, {
          id: sessionId,
          firstEvent: event.timestamp,
          lastEvent: event.timestamp,
          eventCount: 1,
          status: eventType === "SessionEnd" ? "ended" : "active",
        });
      }
    } else if (eventType === "SessionEnd") {
      // SessionEnd without session_id — find most recent active session and end it
      let latest: SessionInfo | null = null;
      for (const s of this.sessions.values()) {
        if (s.status === "active" && (!latest || s.lastEvent > latest.lastEvent)) {
          latest = s;
        }
      }
      if (latest) {
        latest.status = "ended";
        latest.lastEvent = event.timestamp;
        latest.eventCount++;
        event.sessionId = latest.id;
      }
    }

    // Track agent lifecycle
    if (eventType === "SubagentStart") {
      const agentId = raw.agent_id || `agent_${this.idCounter}`;
      const description =
        raw.description || raw.tool_input?.description || undefined;
      this.agents.set(agentId, {
        id: agentId,
        type: agentType || "unknown",
        description,
        startTime: event.timestamp,
        status: "active",
        sessionId,
      });
    } else if (eventType === "SubagentStop") {
      const agentId = raw.agent_id;
      const agent = agentId ? this.agents.get(agentId) : null;
      if (agent) {
        agent.endTime = event.timestamp;
        agent.status = "completed";
        // Update type if it was unknown and Stop provides it
        if (agent.type === "unknown" && agentType) {
          agent.type = agentType;
        }
        // Update description if missing and Stop has useful info
        if (!agent.description && raw.description) {
          agent.description = raw.description;
        }
        event.duration = agent.endTime - agent.startTime;
      } else if (agentId) {
        // SubagentStop without matching Start — create retroactively
        this.agents.set(agentId, {
          id: agentId,
          type: agentType || "unknown",
          description: raw.description || undefined,
          startTime: event.timestamp,
          endTime: event.timestamp,
          status: "completed",
          sessionId,
        });
      }
    }

    // Track pending tool uses (PreToolUse without matching PostToolUse)
    const pendingKey = sessionId || "";
    if (eventType === "PreToolUse" && raw.tool_name) {
      const pending = this.pendingTools.get(pendingKey) || [];
      pending.push({ tool: raw.tool_name, since: event.timestamp });
      this.pendingTools.set(pendingKey, pending);
    } else if (
      (eventType === "PostToolUse" || eventType === "PostToolUseFailure") &&
      raw.tool_name
    ) {
      const pending = this.pendingTools.get(pendingKey);
      if (pending) {
        const idx = pending.findIndex((p) => p.tool === raw.tool_name);
        if (idx >= 0) pending.splice(idx, 1);
        if (pending.length === 0) this.pendingTools.delete(pendingKey);
      }
    } else if (eventType === "Stop" || eventType === "SessionEnd") {
      // Turn/session complete — clear all pending for this session
      this.pendingTools.delete(pendingKey);
    }

    this.events.push(event);

    // Keep last 2000 events
    if (this.events.length > 2000) {
      this.events.shift();
    }

    return event;
  }

  /**
   * Add token usage read from a transcript file.
   * These are incremental tokens (only new entries since last read).
   */
  addTranscriptTokens(usage: TokenUsage, sessionId?: string) {
    this.tokens.inputTokens += usage.inputTokens;
    this.tokens.outputTokens += usage.outputTokens;
    this.tokens.cacheCreationTokens += usage.cacheCreationTokens;
    this.tokens.cacheReadTokens += usage.cacheReadTokens;
    this.tokens.totalTokens += usage.totalTokens;

    if (sessionId) {
      const existing = this.sessionTokens.get(sessionId);
      if (existing) {
        existing.inputTokens += usage.inputTokens;
        existing.outputTokens += usage.outputTokens;
        existing.cacheCreationTokens += usage.cacheCreationTokens;
        existing.cacheReadTokens += usage.cacheReadTokens;
        existing.totalTokens += usage.totalTokens;
      } else {
        this.sessionTokens.set(sessionId, { ...usage });
      }
    }
  }

  getAll(sessionId?: string): ClaudeEvent[] {
    if (!sessionId) return this.events;
    return this.events.filter((e) => e.sessionId === sessionId);
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.lastEvent - a.lastEvent
    );
  }

  getStats(sessionId?: string): SessionStats {
    const events = sessionId
      ? this.events.filter((e) => e.sessionId === sessionId)
      : this.events;

    const toolCounts: Record<string, number> = {};
    const agentCounts: Record<string, number> = {};
    const eventTypeCounts: Record<string, number> = {};

    for (const event of events) {
      if (event.toolName) {
        toolCounts[event.toolName] = (toolCounts[event.toolName] || 0) + 1;
      }
      if (event.agentType) {
        agentCounts[event.agentType] =
          (agentCounts[event.agentType] || 0) + 1;
      }
      eventTypeCounts[event.type] =
        (eventTypeCounts[event.type] || 0) + 1;
    }

    const agents = sessionId
      ? Array.from(this.agents.values()).filter((a) => a.sessionId === sessionId)
      : Array.from(this.agents.values());

    // Token data: use per-session tracking or global totals
    const tokens = sessionId
      ? { ...(this.sessionTokens.get(sessionId) || EMPTY_TOKENS) }
      : { ...this.tokens };

    // Pending tool uses
    const pendingTools = sessionId
      ? (this.pendingTools.get(sessionId) || [])
      : Array.from(this.pendingTools.values()).flat();

    return {
      totalEvents: events.length,
      toolCounts,
      agentCounts,
      eventTypeCounts,
      activeAgents: agents,
      tokens,
      pendingTools,
      firstEvent: events[0]?.timestamp,
      lastEvent: events[events.length - 1]?.timestamp,
    };
  }

  clear() {
    this.events = [];
    this.agents.clear();
    this.sessions.clear();
    this.sessionTokens.clear();
    this.pendingTools.clear();
    this.tokens = { ...EMPTY_TOKENS };
    this.idCounter = 0;
  }
}
