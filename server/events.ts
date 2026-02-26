import type { ClaudeEvent, AgentProcess, TokenUsage, SessionInfo, SessionStats } from "../shared/types";
import { EMPTY_TOKENS } from "../shared/types";

export type { ClaudeEvent, AgentProcess, TokenUsage, SessionInfo, SessionStats };

export class EventStore {
  private events: ClaudeEvent[] = [];
  private agents: Map<string, AgentProcess> = new Map();
  private tokens: TokenUsage = { ...EMPTY_TOKENS };
  private sessionTokens: Map<string, TokenUsage> = new Map();
  private sessions: Map<string, SessionInfo> = new Map();
  private idCounter = 0;

  add(raw: Record<string, any>): ClaudeEvent {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid event: expected an object");
    }

    const eventType = raw.event_type || raw.type || "unknown";
    const sessionId = raw.session_id || undefined;

    // agent_type can be empty string from Claude Code hooks — treat as undefined
    const agentType = raw.agent_type || raw.subagent_type || undefined;

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
          status: "active",
        });
      }
    }

    // Track agent lifecycle
    if (eventType === "SubagentStart") {
      const agentId = raw.agent_id || `agent_${this.idCounter}`;
      this.agents.set(agentId, {
        id: agentId,
        type: agentType || "unknown",
        description: raw.description,
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
        event.duration = agent.endTime - agent.startTime;
      } else if (agentId) {
        // SubagentStop without matching Start — create retroactively
        this.agents.set(agentId, {
          id: agentId,
          type: agentType || "unknown",
          description: raw.last_assistant_message
            ? raw.last_assistant_message.slice(0, 100)
            : undefined,
          startTime: event.timestamp,
          endTime: event.timestamp,
          status: "completed",
          sessionId,
        });
      }
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

    return {
      totalEvents: events.length,
      toolCounts,
      agentCounts,
      eventTypeCounts,
      activeAgents: agents,
      tokens,
      firstEvent: events[0]?.timestamp,
      lastEvent: events[events.length - 1]?.timestamp,
    };
  }

  clear() {
    this.events = [];
    this.agents.clear();
    this.sessions.clear();
    this.sessionTokens.clear();
    this.tokens = { ...EMPTY_TOKENS };
    this.idCounter = 0;
  }
}
