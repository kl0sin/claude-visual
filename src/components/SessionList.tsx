import { useState, useEffect, useRef } from "react";
import type { HistorySession } from "../types";
import { estimateCost } from "../../shared/tokens";
import { formatDate, formatTime, formatTokenCount, shortModel } from "../lib/transcriptUtils";

interface SessionListProps {
  projectId: string;
  selectedSessionId: string | null;
  autoSelectId?: string;
  onSelect: (session: HistorySession) => void;
  onAutoSelect?: (session: HistorySession) => void;
  apiBase: string;
  authHeaders: Record<string, string>;
}

export function SessionList({
  projectId,
  selectedSessionId,
  autoSelectId,
  onSelect,
  onAutoSelect,
  apiBase,
  authHeaders,
}: SessionListProps) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const didAutoSelect = useRef<string | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    setSessions([]);
    didAutoSelect.current = undefined;
    fetch(`${apiBase}/api/history/sessions?project=${encodeURIComponent(projectId)}`, {
      headers: authHeaders,
    })
      .then((r) => r.json())
      .then((data: HistorySession[]) => setSessions(data))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Auto-select session from URL on load (or when autoSelectId changes).
  // Uses onAutoSelect when provided (search navigation) to avoid clearing scrollToIdx.
  useEffect(() => {
    if (!autoSelectId || sessions.length === 0) return;
    if (didAutoSelect.current === autoSelectId) return;
    const found = sessions.find((s) => s.id === autoSelectId);
    if (found) {
      didAutoSelect.current = autoSelectId;
      (onAutoSelect ?? onSelect)(found);
    }
  }, [sessions, autoSelectId, onSelect, onAutoSelect]);

  if (loading) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">⟳</span>
        <span>LOADING...</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">∅</span>
        <span>NO SESSIONS FOUND</span>
      </div>
    );
  }

  return (
    <div className="history-list">
      {sessions.map((s) => (
        <button
          key={s.id}
          className={`history-item ${selectedSessionId === s.id ? "active" : ""}`}
          onClick={() => onSelect(s)}
        >
          <div className="history-item-snippet">
            {s.snippet ?? <span className="history-item-snippet--empty">no messages</span>}
          </div>
          <div className="history-item-middle">
            <span className="history-item-meta">
              {formatDate(s.lastModified)} · {formatTime(s.lastModified)}
            </span>
            {s.model && <span className="history-item-model">{shortModel(s.model)}</span>}
          </div>
          <div className="history-item-bottom">
            <span className="history-item-tokens">
              {formatTokenCount(s.tokens.totalTokens)} tokens
              <span className="history-item-cost-inline"> ({estimateCost(s.tokens, s.model)})</span>
            </span>
          </div>
          <div className="history-item-id-row">
            <span className="history-item-session-id">{s.id}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
