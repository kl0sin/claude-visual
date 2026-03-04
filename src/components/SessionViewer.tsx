import { useState, useEffect, useRef, useCallback } from "react";
import type { HistoryProject, HistorySession, SearchResult } from "../types";
import { HistoricalStatsPanel } from "./HistoricalStatsPanel";
import { TranscriptPanel } from "./TranscriptPanel";
import { SessionList } from "./SessionList";
import { SearchResultsPanel } from "./SearchResultsPanel";
import { formatDate, shortParentPath } from "../lib/transcriptUtils";

const MIN_WIDTH = 160;
const MAX_WIDTH = 600;

// ── Resize handle ───────────────────────────────────────────

function ResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="resize-handle" onMouseDown={onMouseDown}>
      <div className="resize-handle-bar" />
    </div>
  );
}

// ── Collapsed sidebar strip ─────────────────────────────────

function CollapsedStrip({
  label,
  onExpand,
}: {
  label: string;
  onExpand: () => void;
}) {
  return (
    <div className="history-panel-collapsed">
      <button
        className="collapsed-expand-btn"
        onClick={onExpand}
        title={`Expand ${label}`}
        aria-label={`Expand ${label} panel`}
      >
        ›
      </button>
      <div className="collapsed-label">{label}</div>
    </div>
  );
}

// ── Main SessionViewer ───────────────────────────────────────

interface SessionViewerProps {
  projectId?: string;
  sessionId?: string;
  onNavigate: (projectId?: string, sessionId?: string) => void;
  apiBase: string;
  authHeaders: Record<string, string>;
}

export function SessionViewer({
  projectId: routeProjectId,
  sessionId: routeSessionId,
  onNavigate,
  apiBase,
  authHeaders,
}: SessionViewerProps) {
  const [projects, setProjects] = useState<HistoryProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProject, setSelectedProject] = useState<HistoryProject | null>(
    null,
  );
  const [selectedSession, setSelectedSession] = useState<HistorySession | null>(
    null,
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [scrollToIdx, setScrollToIdx] = useState<number | undefined>(undefined);
  const [highlightQuery, setHighlightQuery] = useState<string | undefined>(undefined);
  const [showStats, setShowStats] = useState(false);

  const [projectsWidth, setProjectsWidth] = useState(280);
  const [sessionsWidth, setSessionsWidth] = useState(320);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);

  const dragRef = useRef<{
    panel: "projects" | "sessions";
    startX: number;
    startWidth: number;
  } | null>(null);

  // Global mouse events for resize drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, dragRef.current.startWidth + delta),
      );
      if (dragRef.current.panel === "projects") {
        setProjectsWidth(newWidth);
      } else {
        setSessionsWidth(newWidth);
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag =
    (panel: "projects" | "sessions") => (e: React.MouseEvent) => {
      dragRef.current = {
        panel,
        startX: e.clientX,
        startWidth: panel === "projects" ? projectsWidth : sessionsWidth,
      };
      e.preventDefault();
    };

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      let url = `${apiBase}/api/history/search?q=${encodeURIComponent(searchQuery)}`;
      if (selectedProject) url += `&project=${encodeURIComponent(selectedProject.id)}`;
      fetch(url, { headers: authHeaders })
        .then((r) => r.json())
        .then((data: SearchResult[]) => setSearchResults(data))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, selectedProject]);

  // Load projects and select from URL if present
  useEffect(() => {
    fetch(`${apiBase}/api/history/projects`, { headers: authHeaders })
      .then((r) => r.json())
      .then((data: HistoryProject[]) => {
        setProjects(data);
        if (routeProjectId) {
          const found = data.find((p) => p.name === routeProjectId);
          if (found) setSelectedProject(found);
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
    // Only run on mount — routeProjectId handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync selectedProject when routeProjectId changes (back/forward navigation)
  useEffect(() => {
    if (!routeProjectId) {
      setSelectedProject(null);
      setSelectedSession(null);
      return;
    }
    if (projects.length === 0) return;
    const found = projects.find((p) => p.name === routeProjectId);
    if (found && found.id !== selectedProject?.id) {
      setSelectedProject(found);
      setSelectedSession(null);
    }
  }, [routeProjectId, projects]);

  // Clear session when routeSessionId disappears (back navigation)
  useEffect(() => {
    if (!routeSessionId) setSelectedSession(null);
  }, [routeSessionId]);

  const handleProjectSelect = (p: HistoryProject) => {
    if (p.id !== selectedProject?.id) {
      setSelectedProject(p);
      setSelectedSession(null);
      onNavigate(p.name, undefined);
    }
  };

  const handleSessionSelect = useCallback((s: HistorySession) => {
    setScrollToIdx(undefined);
    setHighlightQuery(undefined);
    setSelectedSession(s);
    setShowStats(false);
    onNavigate(selectedProject?.name, s.id);
  }, [onNavigate, selectedProject?.name]);

  // Used by SessionList auto-select (URL-driven) — does NOT clear scrollToIdx so that
  // search navigation state is preserved when SessionList reconciles with the URL.
  const handleAutoSessionSelect = useCallback((s: HistorySession) => {
    setSelectedSession(s);
  }, []);

  const isSearching = searchQuery.trim().length >= 2;

  return (
    <div className="history-browser">
      {/* Search bar */}
      <div className="history-search-bar">
        <span className="history-search-icon">⌕</span>
        <input
          className="history-search-input"
          placeholder="SEARCH TRANSCRIPTS..."
          aria-label="Search transcripts"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
        />
        {searching && <span className="history-search-spinner">⟳</span>}
        {searchQuery && !searching && (
          <button
            className="history-search-clear"
            onClick={() => setSearchQuery("")}
          >
            ✕
          </button>
        )}
      </div>

      {/* Search results OR 3-column layout */}
      {isSearching ? (
        <SearchResultsPanel
          query={searchQuery}
          results={searchResults}
          searching={searching}
          onSelect={(result, messageIndex) => {
            const proj = projects.find((p) => p.id === result.projectId);
            if (proj) {
              setSelectedProject(proj);
              setSelectedSession(result.session);
              setScrollToIdx(messageIndex);
              setHighlightQuery(searchQuery.trim() || undefined);
              onNavigate(proj.name, result.session.id);
            }
            setSearchQuery("");
          }}
        />
      ) : (
      <div className="history-columns">
      {/* Left: Projects */}
      {projectsCollapsed ? (
        <CollapsedStrip
          label="PROJECTS"
          onExpand={() => setProjectsCollapsed(false)}
        />
      ) : (
        <>
          <div className="history-panel" style={{ width: projectsWidth }}>
            <div className="panel-header">
              <span className="panel-title">PROJECTS</span>
              {!loadingProjects && (
                <span className="panel-count">{projects.length}</span>
              )}
              <button
                className="panel-collapse-btn"
                onClick={() => setProjectsCollapsed(true)}
                title="Collapse panel"
                aria-label="Collapse PROJECTS panel"
              >
                ‹
              </button>
            </div>

            {loadingProjects ? (
              <div className="history-empty">
                <span className="history-empty-icon">⟳</span>
                <span>SCANNING...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="history-empty">
                <span className="history-empty-icon">∅</span>
                <span>NO PROJECTS FOUND</span>
                <span className="history-empty-hint">
                  ~/.claude/projects/ is empty
                </span>
              </div>
            ) : (
              <div className="history-list">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className={`history-item ${selectedProject?.id === p.id ? "active" : ""}`}
                    onClick={() => handleProjectSelect(p)}
                    title={p.fullPath}
                  >
                    <div className="history-item-top">
                      <span className="history-item-name">{p.name}</span>
                      <span className="history-item-turns">{p.sessionCount}</span>
                    </div>
                    <div className="history-item-path">{shortParentPath(p.fullPath)}</div>
                    <div className="history-item-bottom">
                      <span className="history-item-meta">
                        {p.lastActivity ? formatDate(p.lastActivity) : "—"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <ResizeHandle onMouseDown={startDrag("projects")} />
        </>
      )}

      {/* Center: Sessions */}
      {sessionsCollapsed ? (
        <CollapsedStrip
          label="SESSIONS"
          onExpand={() => setSessionsCollapsed(false)}
        />
      ) : (
        <>
          <div className="history-panel" style={{ width: sessionsWidth }}>
            <div className="panel-header">
              <span className="panel-title">SESSIONS</span>
              {selectedProject && (
                <span className="panel-subtitle">{selectedProject.name}</span>
              )}
              <button
                className="panel-collapse-btn"
                onClick={() => setSessionsCollapsed(true)}
                title="Collapse panel"
                aria-label="Collapse SESSIONS panel"
              >
                ‹
              </button>
            </div>

            {!selectedProject ? (
              <div className="history-empty">
                <span className="history-empty-icon">←</span>
                <span>SELECT A PROJECT</span>
              </div>
            ) : (
              <SessionList
                projectId={selectedProject.id}
                selectedSessionId={selectedSession?.id || null}
                autoSelectId={routeSessionId}
                onSelect={handleSessionSelect}
                onAutoSelect={handleAutoSessionSelect}
                apiBase={apiBase}
                authHeaders={authHeaders}
              />
            )}
          </div>
          <ResizeHandle onMouseDown={startDrag("sessions")} />
        </>
      )}

      {/* Right: Transcript / Stats */}
      <div className="history-panel history-panel-wide">
        <div className="panel-header">
          <span className="panel-title">{showStats || !selectedSession ? "PROJECT STATS" : "TRANSCRIPT"}</span>
          {showStats && selectedProject ? (
            <span className="panel-subtitle">{selectedProject.name}</span>
          ) : selectedSession && !showStats ? (
            <span className="panel-subtitle">{selectedSession.id.slice(0, 8)}…</span>
          ) : null}
          {selectedProject && selectedSession && (
            <button
              className="hist-stats-toggle"
              onClick={() => setShowStats((v) => !v)}
              title={showStats ? "Show transcript" : "Show project statistics"}
            >
              {showStats ? "TRANSCRIPT" : "STATS"}
            </button>
          )}
        </div>

        {!selectedSession ? (
          selectedProject ? (
            <HistoricalStatsPanel
              projectId={selectedProject.id}
              projectName={selectedProject.name}
              apiBase={apiBase}
              authHeaders={authHeaders}
            />
          ) : (
            <div className="history-empty">
              <span className="history-empty-icon">←</span>
              <span>SELECT A SESSION</span>
            </div>
          )
        ) : showStats && selectedProject ? (
          <HistoricalStatsPanel
            projectId={selectedProject.id}
            projectName={selectedProject.name}
            apiBase={apiBase}
            authHeaders={authHeaders}
          />
        ) : (
          <TranscriptPanel
            key={selectedSession.filePath}
            session={selectedSession}
            scrollToMessageIndex={scrollToIdx}
            highlightQuery={highlightQuery}
            apiBase={apiBase}
            authHeaders={authHeaders}
          />
        )}
      </div>
      </div>
      )}
    </div>
  );
}
