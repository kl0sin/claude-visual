import { useState, useEffect } from "react";
import type { SessionInfo } from "../types";

interface SessionSelectorProps {
  sessions: SessionInfo[];
  selectedSession: string | null;
  onSelect: (id: string | null) => void;
  onReplay?: (sessionId: string) => void;
  onDismiss?: (sessionId: string) => void;
}

/** Fallback threshold in ms — treat session as processing if very recent events arrived */
const RECENT_EVENT_THRESHOLD = 5_000;
/** If isProcessing but no events for this long, assume the process was killed */
const STALE_PROCESSING_THRESHOLD = 60_000;

type SessionState = "processing" | "idle" | "ended";

function getSessionState(session: SessionInfo, now: number): SessionState {
  if (session.status === "ended") return "ended";
  // Primary signal: server tracks whether Claude is actively handling a request
  if (session.isProcessing) {
    // Guard: if no events for a long time, the process was likely killed without sending Stop
    if (now - session.lastEvent > STALE_PROCESSING_THRESHOLD) return "idle";
    return "processing";
  }
  // Fallback: very recent events (e.g. hook fired but UserPromptSubmit not yet received)
  if (now - session.lastEvent < RECENT_EVENT_THRESHOLD) return "processing";
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
  return id.slice(0, 6) + "…" + id.slice(-4);
}

function projectLabel(session: { id: string; cwd?: string }): string {
  if (session.id === "__global__") return "—";
  if (session.cwd) {
    const parts = session.cwd.replace(/\\/g, "/").split("/").filter(Boolean);
    const name = parts[parts.length - 1];
    if (name) return name;
  }
  return "Session";
}

function formatDuration(from: number, to: number): string {
  const ms = to - from;
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${m % 60}m`;
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

export function SessionSelector({ sessions, selectedSession, onSelect, onReplay, onDismiss }: SessionSelectorProps) {
  const [now, setNow] = useState(Date.now());

  // Tick every 2s to update processing/idle states
  const hasActive = sessions.some((s) => s.status === "active");
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(interval);
  }, [hasActive]);

  if (sessions.length === 0) return null;

  const hasProcessing = sessions.some((s) => getSessionState(s, now) === "processing");

  return (
    <div className={`session-selector${hasProcessing ? " has-processing" : ""}`}>
      <button
        className={`session-tab ${selectedSession === null ? "active" : ""}`}
        aria-pressed={selectedSession === null}
        onClick={() => onSelect(null)}
      >
        <span className="session-tab-icon" aria-hidden="true">
          ◈
        </span>
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
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : session.id)}
            >
              <span className={`session-status-dot ${state}`} aria-hidden="true" />
              <span
                className="session-tab-label"
                data-tooltip={`ID: ${session.id}${session.cwd ? `\nPath: ${session.cwd}` : ""}\nStatus: ${state} · Events: ${session.eventCount}\nStarted: ${new Date(session.firstEvent).toLocaleString()}`}
              >{projectLabel(session)}</span>
              <span className="session-tab-duration">
                {formatDuration(session.firstEvent, state === "ended" ? session.lastEvent : now)}
              </span>
              <span className="session-tab-count">{session.eventCount}</span>
              {state === "ended" && onReplay && (
                <button
                  className="session-replay-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReplay(session.id);
                  }}
                  data-tooltip="Replay session"
                  aria-label="Replay session"
                >
                  ▶
                </button>
              )}
              {state === "ended" && onDismiss && (
                <button
                  className="session-dismiss-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSelected) onSelect(null);
                    onDismiss(session.id);
                  }}
                  data-tooltip="Remove session from view"
                  aria-label="Remove session from view"
                >
                  ×
                </button>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
