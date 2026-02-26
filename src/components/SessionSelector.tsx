import type { SessionInfo } from "../types";

interface SessionSelectorProps {
  sessions: SessionInfo[];
  selectedSession: string | null;
  onSelect: (id: string | null) => void;
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
          const isActive = session.status === "active";

          return (
            <button
              key={session.id}
              className={`session-tab ${isSelected ? "active" : ""}`}
              onClick={() => onSelect(isSelected ? null : session.id)}
              title={`Session: ${session.id}\nEvents: ${session.eventCount}\nStarted: ${new Date(session.firstEvent).toLocaleString()}`}
            >
              <span className={`session-status-dot ${isActive ? "live" : "ended"}`} />
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
