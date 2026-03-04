import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ClaudeEvent, SessionStats, SessionInfo, WSMessage, TokenUsage } from "../types";
import { EMPTY_TOKENS } from "../types";

interface UseWebSocketReturn {
  events: ClaudeEvent[];
  allEvents: ClaudeEvent[];
  stats: SessionStats | null;
  globalStats: SessionStats | null;
  sessions: SessionInfo[];
  selectedSession: string | null;
  setSelectedSession: (id: string | null) => void;
  connected: boolean;
  clearEvents: () => void;
  truncated: boolean;
}

const DEFAULT_STATS: SessionStats = {
  totalEvents: 0,
  maxEvents: 2000,
  toolCounts: {},
  toolFailCounts: {},
  agentCounts: {},
  eventTypeCounts: {},
  activeAgents: [],
  tokens: { ...EMPTY_TOKENS },
  pendingTools: [],
};

export function useWebSocket(
  url: string,
  apiBase: string,
  authHeaders: Record<string, string>,
): UseWebSocketReturn {
  const [allEvents, setAllEvents] = useState<ClaudeEvent[]>([]);
  const [globalStats, setGlobalStats] = useState<SessionStats | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState<TokenUsage | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("[NEURAL LINK] Connected");
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("[NEURAL LINK] Disconnected, reconnecting...");
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (e) => {
      try {
        const msg: WSMessage = JSON.parse(e.data);

        switch (msg.type) {
          case "snapshot":
            // Sort snapshot events by timestamp — synthetic/patched events may be out-of-order.
            setAllEvents(msg.events.slice().sort((a, b) => a.timestamp - b.timestamp));
            setGlobalStats(msg.stats);
            setSessions(msg.sessions);
            break;

          case "event": {
            setAllEvents((prev) => {
              const next = [...prev, msg.data];
              const len = next.length;
              // Keep the list sorted even when async transcript reads cause a
              // broadcast to arrive after a later event was already appended.
              if (len >= 2 && next[len - 1]!.timestamp < next[len - 2]!.timestamp) {
                return next.sort((a, b) => a.timestamp - b.timestamp);
              }
              return next;
            });
            setSessions(msg.sessions);
            // Use server-computed stats (includes transcript-based token data)
            setGlobalStats(msg.stats);
            break;
          }

          case "eventPatch":
            // Server sent corrected/synthetic events (e.g. retroactively adopted SubagentStart).
            // Replace existing events with the same id and re-sort by timestamp.
            setAllEvents((prev) => {
              const patchIds = new Set(msg.events.map((e) => e.id));
              const base = prev.filter((e) => !patchIds.has(e.id));
              return [...base, ...msg.events].sort((a, b) => a.timestamp - b.timestamp);
            });
            break;

          case "stats":
            setGlobalStats(msg.stats);
            setSessions(msg.sessions);
            break;

          case "clear":
            setAllEvents([]);
            setGlobalStats({ ...DEFAULT_STATS });
            setSessions([]);
            setSelectedSession(null);
            setSessionTokens(null);
            break;
        }
      } catch (err) {
        console.error("[NEURAL LINK] Parse error:", err);
      }
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Reset local state when switching to a different server
  useEffect(() => {
    setAllEvents([]);
    setGlobalStats(null);
    setSessions([]);
    setSelectedSession(null);
    setSessionTokens(null);
  }, [url]);

  // Fetch per-session token stats when session changes or new events arrive
  useEffect(() => {
    if (!selectedSession) {
      setSessionTokens(null);
      return;
    }
    fetch(`${apiBase}/api/stats?session=${encodeURIComponent(selectedSession)}`, {
      headers: authHeaders,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: SessionStats) => setSessionTokens(data.tokens))
      .catch(() => setSessionTokens(null));
  }, [selectedSession, globalStats]);

  const clearEvents = useCallback(() => {
    fetch(`${apiBase}/api/clear`, { method: "POST", headers: authHeaders }).catch((err) => {
      console.error("[NEURAL LINK] Clear failed:", err);
    });
  }, []);

  // Filtered views based on selected session.
  // The server retroactively patches SubagentStart events into the correct session via
  // eventPatch messages, so simple sessionId filtering is now sufficient.
  const events = useMemo(() => {
    if (!selectedSession) return allEvents;
    return allEvents.filter((e) => e.sessionId === selectedSession);
  }, [allEvents, selectedSession]);

  const stats = useMemo(() => {
    if (!selectedSession) return globalStats;

    const toolCounts: Record<string, number> = {};
    const toolFailCounts: Record<string, number> = {};
    const agentCounts: Record<string, number> = {};
    const eventTypeCounts: Record<string, number> = {};

    for (const evt of events) {
      if (evt.toolName) {
        toolCounts[evt.toolName] = (toolCounts[evt.toolName] || 0) + 1;
        if (evt.type === "PostToolUseFailure") {
          toolFailCounts[evt.toolName] = (toolFailCounts[evt.toolName] || 0) + 1;
        }
      }
      if (evt.agentType) {
        agentCounts[evt.agentType] = (agentCounts[evt.agentType] || 0) + 1;
      }
      eventTypeCounts[evt.type] = (eventTypeCounts[evt.type] || 0) + 1;
    }

    return {
      totalEvents: events.length,
      maxEvents: globalStats?.maxEvents ?? 2000,
      toolCounts,
      toolFailCounts,
      agentCounts,
      eventTypeCounts,
      activeAgents: globalStats?.activeAgents.filter((a) => a.sessionId === selectedSession) || [],
      tokens: sessionTokens || { ...EMPTY_TOKENS },
      pendingTools: globalStats?.pendingTools || [],
      firstEvent: events[0]?.timestamp,
      lastEvent: events[events.length - 1]?.timestamp,
    };
  }, [selectedSession, events, globalStats, sessionTokens]);

  const truncated = (globalStats?.totalEvents ?? 0) > (globalStats?.maxEvents ?? 2000);

  return { events, allEvents, stats, globalStats, sessions, selectedSession, setSelectedSession, connected, clearEvents, truncated };
}
