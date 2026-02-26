import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ClaudeEvent, SessionStats, SessionInfo, WSMessage, TokenUsage } from "../types";
import { EMPTY_TOKENS } from "../types";

interface UseWebSocketReturn {
  events: ClaudeEvent[];
  stats: SessionStats | null;
  globalStats: SessionStats | null;
  sessions: SessionInfo[];
  selectedSession: string | null;
  setSelectedSession: (id: string | null) => void;
  connected: boolean;
  clearEvents: () => void;
}

const DEFAULT_STATS: SessionStats = {
  totalEvents: 0,
  toolCounts: {},
  agentCounts: {},
  eventTypeCounts: {},
  activeAgents: [],
  tokens: { ...EMPTY_TOKENS },
  pendingTools: [],
};

const API_BASE = (window as any).__TAURI__ ? 'http://localhost:3200' : '';

export function useWebSocket(url: string): UseWebSocketReturn {
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
            setAllEvents(msg.events);
            setGlobalStats(msg.stats);
            setSessions(msg.sessions);
            break;

          case "event":
            setAllEvents((prev) => [...prev, msg.data]);
            setSessions(msg.sessions);
            // Use server-computed stats (includes transcript-based token data)
            setGlobalStats(msg.stats);
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

  // Fetch per-session token stats when session changes or new events arrive
  useEffect(() => {
    if (!selectedSession) {
      setSessionTokens(null);
      return;
    }
    fetch(`${API_BASE}/api/stats?session=${encodeURIComponent(selectedSession)}`)
      .then((r) => r.json())
      .then((data: SessionStats) => setSessionTokens(data.tokens))
      .catch(() => setSessionTokens(null));
  }, [selectedSession, globalStats]);

  const clearEvents = useCallback(() => {
    fetch(`${API_BASE}/api/clear`, { method: "POST" }).catch((err) => {
      console.error("[NEURAL LINK] Clear failed:", err);
    });
  }, []);

  // Filtered views based on selected session
  const events = useMemo(() => {
    if (!selectedSession) return allEvents;
    return allEvents.filter((e) => e.sessionId === selectedSession);
  }, [allEvents, selectedSession]);

  const stats = useMemo(() => {
    if (!selectedSession) return globalStats;

    const toolCounts: Record<string, number> = {};
    const agentCounts: Record<string, number> = {};
    const eventTypeCounts: Record<string, number> = {};

    for (const evt of events) {
      if (evt.toolName) {
        toolCounts[evt.toolName] = (toolCounts[evt.toolName] || 0) + 1;
      }
      if (evt.agentType) {
        agentCounts[evt.agentType] = (agentCounts[evt.agentType] || 0) + 1;
      }
      eventTypeCounts[evt.type] = (eventTypeCounts[evt.type] || 0) + 1;
    }

    return {
      totalEvents: events.length,
      toolCounts,
      agentCounts,
      eventTypeCounts,
      activeAgents: globalStats?.activeAgents.filter((a) => a.sessionId === selectedSession) || [],
      tokens: sessionTokens || { ...EMPTY_TOKENS },
      pendingTools: globalStats?.pendingTools || [],
      firstEvent: events[0]?.timestamp,
      lastEvent: events[events.length - 1]?.timestamp,
    };
  }, [selectedSession, events, globalStats, sessionTokens]);

  return { events, stats, globalStats, sessions, selectedSession, setSelectedSession, connected, clearEvents };
}
