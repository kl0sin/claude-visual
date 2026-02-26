import { useState, useEffect } from "react";
import type { SessionInfo } from "../types";

interface SessionSelectorProps {
  sessions: SessionInfo[];
  selectedSession: string | null;
  onSelect: (id: string | null) => void;
}

/** Threshold in ms — session is "processing" if last event was within this window */
const PROCESSING_THRESHOLD = 10_000;

type SessionState = "processing" | "idle" | "ended";

function getSessionState(session: SessionInfo, now: number): SessionState {
  if (session.status === "ended") return "ended";
  if (now - session.lastEvent < PROCESSING_THRESHOLD) return "processing";
  return "idle";
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return id.slice(0, 6) + "..." + id.slice(-4);
}

export function SessionSelector({ sessions, selectedSession, onSelect }: SessionSelectorProps) {
  const [now, setNow] = useState(Date.now());

  // Tick every 2s to update processing/idle states
  const hasActive = sessions.some((s) => s.status === "active");
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(interval);
  }, [hasActive]);

  if (sessions.length === 0) return null;

  return (
    <div className="session-selector">
      <button
        className={`session-tab ${selectedSession === null ? "active" : ""}`}
        onClick={() => onSelect(null)}
      >
        <span className="session-tab-icon">◈</span>
        <span className="session-tab-label">ALL</span>
        <span className="session-tab-count">{sessions.reduce((s, x) => s + x.eventCount, 0)}</span>
      </button>

      <div className="session-divider" />

      <div className="session-list">
        {sessions.map((session) => {
          const isSelected = selectedSession === session.id;
          const state = getSessionState(session, now);

          return (
            <button
              key={session.id}
              className={`session-tab ${isSelected ? "active" : ""} session-${state}`}
              onClick={() => onSelect(isSelected ? null : session.id)}
              title={`Session: ${session.id}\nStatus: ${state}\nEvents: ${session.eventCount}\nStarted: ${new Date(session.firstEvent).toLocaleString()}`}
            >
              <span className={`session-status-dot ${state}`} />
              <span className="session-tab-label">{shortId(session.id)}</span>
              <span className="session-tab-time">{formatTime(session.firstEvent)}</span>
              <span className="session-tab-count">{session.eventCount}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
