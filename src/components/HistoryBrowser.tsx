import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  HistoryProject,
  HistorySession,
  HistorySessionDetail,
  TranscriptContent,
  SearchMatch,
  SearchResult,
} from "../types";
import { estimateCost } from "../../shared/tokens";

const API_BASE = (window as any).__TAURI__ ? "http://localhost:3200" : "";

function formatTokenCount(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortModel(model?: string): string {
  if (!model) return "";
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model.split("-")[0] ?? model;
}

// ── Tool use block ──────────────────────────────────────────

function ToolUseBlock({
  name,
  input,
}: {
  name: string;
  input: Record<string, unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = useMemo(() => JSON.stringify(input, null, 2), [input]);
  const preview = useMemo(() => Object.entries(input)
    .slice(0, 2)
    .map(([k, v]) => {
      const val =
        typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40);
      return `${k}: ${val}`;
    })
    .join(", "), [input]);

  return (
    <div className="tool-block">
      <button
        className="tool-block-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="tool-block-icon">⚙</span>
        <span className="tool-block-name">{name}</span>
        {preview && <span className="tool-block-preview">{preview}</span>}
        <span className="tool-block-chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && <pre className="tool-block-body">{inputStr}</pre>}
    </div>
  );
}

// ── Tool result block ───────────────────────────────────────

function ToolResultBlock({
  content,
  isError,
}: {
  content: unknown;
  isError?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((c: unknown) =>
              typeof c === "object" && c !== null && "text" in c
                ? (c as { text: string }).text
                : JSON.stringify(c),
            )
            .join("\n")
        : JSON.stringify(content, null, 2);

  const preview = text.slice(0, 80).replace(/\n/g, " ");
  const needsExpand = text.length > 80;

  return (
    <div className={`tool-result-block ${isError ? "error" : ""}`}>
      <button
        className="tool-result-header"
        aria-expanded={needsExpand ? expanded : undefined}
        style={!needsExpand ? { cursor: "default" } : undefined}
        onClick={() => needsExpand && setExpanded((e) => !e)}
      >
        <span className="tool-result-icon">{isError ? "✗" : "✓"}</span>
        <span className="tool-result-preview">
          {preview}
          {needsExpand && !expanded ? "…" : ""}
        </span>
        {needsExpand && (
          <span className="tool-block-chevron">{expanded ? "▲" : "▼"}</span>
        )}
      </button>
      {expanded && <pre className="tool-block-body">{text}</pre>}
    </div>
  );
}

// ── Instruction / system context detection ──────────────────

const SYSTEM_TAG_RE = /^<[a-z][a-z-]+[\s>]/;
const INVISIBLE_CHARS_RE = /[\u00a0\u200b\u200c\u200d\u2060\ufeff]/g;

function getFirstText(content: TranscriptContent[]): string {
  const t = content.find(
    (c): c is { type: "text"; text: string } => c.type === "text",
  );
  return t?.text ?? "";
}

// Tool results sent back to Claude — not the user's own words
function isProcessMessage(
  role: "user" | "assistant",
  content: TranscriptContent[],
): boolean {
  if (role !== "user") return false;
  return content.some((c) => c.type === "tool_result");
}

function isSystemInstruction(
  role: "user" | "assistant",
  content: TranscriptContent[],
): boolean {
  if (role !== "user") return false;
  if (isProcessMessage(role, content)) return false;
  const text = getFirstText(content).trim();
  if (!text) return false;

  // YAML frontmatter — subagent / CLAUDE.md injections
  if (text.startsWith("---\n") || text.startsWith("---\r\n")) return true;

  // XML-style system tags injected by Claude Code at the START of the message.
  // Must begin with "<" + lowercase word with possible hyphens + space or ">".
  // Anchored to start so TypeScript generics mid-message (e.g. Array<string>) are not matched.
  if (SYSTEM_TAG_RE.test(text)) return true;

  // Long injected context starting with markdown header
  if (text.startsWith("# ") && text.length > 500) return true;

  // Short self-issued continuation notes:
  // ≤ 3 non-empty lines, ends with ":", contains backtick code references
  const nonEmptyLines = text.split("\n").filter((l) => l.trim()).length;
  if (nonEmptyLines <= 3 && text.endsWith(":") && text.includes("`"))
    return true;

  return false;
}

function parseInstructionName(text: string): string {
  const t = text.trim();

  // YAML frontmatter `name:` field
  const yamlName = t.match(/^---[\s\S]*?name:\s*(.+)/m);
  if (yamlName?.[1]?.trim()) return yamlName[1].trim();

  // XML tag name → "<system-reminder>" → "SYSTEM REMINDER"
  const tagMatch = t.match(/^<([a-z][a-z-]+)[\s>]/);
  if (tagMatch?.[1]) return tagMatch[1].toUpperCase().replace(/-/g, " ");

  // First markdown header
  const header = t.match(/^#+ (.+)/m);
  if (header?.[1]?.trim()) return header[1].trim();

  // Short note: use the first non-empty line as title
  const firstLine =
    t
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "";
  if (firstLine)
    return firstLine.length <= 80 ? firstLine : firstLine.slice(0, 77) + "…";

  return "SYSTEM CONTEXT";
}

// ── Instruction block ────────────────────────────────────────

// Checks for any real printable content (handles &nbsp; and other whitespace-like chars)
function hasVisibleContent(s: string): boolean {
  return /\S/.test(s.replace(INVISIBLE_CHARS_RE, ""));
}

function InstructionBlock({ content }: { content: TranscriptContent[] }) {
  const [expanded, setExpanded] = useState(false);
  const text = getFirstText(content);
  const name = parseInstructionName(text);

  if (!hasVisibleContent(text) || !hasVisibleContent(name)) return null;

  return (
    <div className="instruction-block">
      <button
        className="instruction-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="instruction-icon">⬡</span>
        <span className="instruction-label">INSTRUCTION</span>
        <span className="instruction-name">{name}</span>
        <span className="tool-block-chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && <pre className="instruction-body">{text}</pre>}
    </div>
  );
}

// ── Message bubble ──────────────────────────────────────────

function MessageBubble({
  role,
  content,
  tokens,
  model,
}: {
  role: "user" | "assistant";
  content: TranscriptContent[];
  tokens?: { totalTokens: number } | undefined;
  model?: string;
}) {
  if (isSystemInstruction(role, content)) {
    return <InstructionBlock content={content} />;
  }

  const isProcess = isProcessMessage(role, content);

  const textParts = content.filter(
    (c): c is { type: "text"; text: string } => c.type === "text",
  );
  const toolUses = content.filter(
    (
      c,
    ): c is {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    } => c.type === "tool_use",
  );
  const toolResults = content.filter(
    (
      c,
    ): c is {
      type: "tool_result";
      tool_use_id: string;
      content: unknown;
      is_error?: boolean;
    } => c.type === "tool_result",
  );

  const bubbleClass = isProcess ? "process" : role;
  const hasError = toolResults.some((r) => r.is_error);

  return (
    <div className={`msg-bubble ${bubbleClass}`}>
      <div className="msg-meta">
        {isProcess ? (
          <>
            <span className={`msg-role-process ${hasError ? "error" : ""}`}>
              {hasError ? "✗" : "◎"} PROCESS
            </span>
            <span className="msg-process-count">
              {toolResults.length} result{toolResults.length !== 1 ? "s" : ""}
            </span>
          </>
        ) : role === "assistant" ? (
          <>
            <span className="msg-role">CLAUDE</span>
            {model && <span className="msg-model">{shortModel(model)}</span>}
            {tokens && tokens.totalTokens > 0 && (
              <span className="msg-tokens">
                {formatTokenCount(tokens.totalTokens)} tok
              </span>
            )}
          </>
        ) : (
          <span className="msg-role">YOU</span>
        )}
      </div>
      <div className="msg-content">
        {textParts.map((c, i) => (
          <p key={i} className="msg-text">
            {c.text}
          </p>
        ))}
        {toolUses.map((c, i) => (
          <ToolUseBlock key={i} name={c.name} input={c.input} />
        ))}
        {toolResults.map((c, i) => (
          <ToolResultBlock key={i} content={c.content} isError={c.is_error} />
        ))}
      </div>
    </div>
  );
}

// ── Transcript panel ────────────────────────────────────────

const DEFAULT_LIMIT = 300;
// Must stay in sync with estimateSize below. Used to compensate for prepended items.
const VIRTUAL_ESTIMATE_PX = 150;

function TranscriptPanel({ session }: { session: HistorySession }) {
  const [detail, setDetail] = useState<HistorySessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);
  // null   → initial/retry load: scroll to end
  // number → Load All: target scrollTop in pixels after prepending (preserves viewport)
  const scrollTargetRef = useRef<number | null>(null);

  const messages = detail?.messages ?? [];
  const isTruncated = detail != null && detail.totalMessages > messages.length;

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUAL_ESTIMATE_PX,
    overscan: 8,
  });

  // Fetch on session change
  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    fetch(
      `${API_BASE}/api/history/session?path=${encodeURIComponent(session.filePath)}&limit=${DEFAULT_LIMIT}`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: HistorySessionDetail) => setDetail(data))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [session.filePath, retryKey]);

  // After detail loads: scroll to end (initial/retry) or restore pixel offset (Load All).
  useEffect(() => {
    if (!detail || messages.length === 0) return;
    const target = scrollTargetRef.current;
    scrollTargetRef.current = null; // consume
    if (target !== null) {
      // Directly set scrollTop — no animation, immediate. The virtualizer renders
      // items around this offset and measures them, naturally correcting any drift.
      if (parentRef.current) parentRef.current.scrollTop = target;
    } else {
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const handleLoadAll = useCallback(() => {
    // Convert current scroll position to the equivalent position after prepending.
    // New items (detail.offset of them) each have estimated height VIRTUAL_ESTIMATE_PX.
    const savedScrollTop = parentRef.current?.scrollTop ?? 0;
    const prependedCount = detail?.offset ?? 0;
    scrollTargetRef.current = savedScrollTop + prependedCount * VIRTUAL_ESTIMATE_PX;
    setLoadingAll(true);
    fetch(
      `${API_BASE}/api/history/session?path=${encodeURIComponent(session.filePath)}&limit=999999`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: HistorySessionDetail) => {
        setDetail(data);
      })
      .catch(() => {})
      .finally(() => setLoadingAll(false));
  }, [session.filePath, detail]);

  if (loading) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">⟳</span>
        <span>LOADING TRANSCRIPT...</span>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">✗</span>
        <span>FAILED TO LOAD: {error}</span>
        <button
          className="history-retry-btn"
          onClick={() => setRetryKey((k) => k + 1)}
        >
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div className="transcript-view">
      <div className="transcript-header">
        <div className="transcript-meta">
          <span className="transcript-id">{session.id.slice(0, 8)}…</span>
          <span className="transcript-date">
            {formatDate(session.lastModified)}
          </span>
          {session.model && (
            <span className="msg-model">{shortModel(session.model)}</span>
          )}
        </div>
        <div className="transcript-stats">
          <span className="transcript-stat">
            <span className="stat-label">EVENTS</span>
            <span className="stat-value cyan">{session.userTurns}</span>
          </span>
          <span className="transcript-stat">
            <span className="stat-label">TOKENS</span>
            <span className="stat-value magenta">
              {formatTokenCount(session.tokens.totalTokens)}
            </span>
          </span>
          <span className="transcript-stat">
            <span className="stat-label">COST</span>
            <span className="stat-value yellow">
              {estimateCost(session.tokens, session.model)}
            </span>
          </span>
        </div>
      </div>

      {isTruncated && (
        <div className="transcript-truncated-banner">
          <span>
            Showing last {messages.length} of {detail.totalMessages} messages
          </span>
          <button
            className="transcript-load-all-btn"
            onClick={handleLoadAll}
            disabled={loadingAll}
          >
            {loadingAll ? "LOADING..." : "LOAD ALL"}
          </button>
        </div>
      )}

      <div ref={parentRef} className="transcript-messages">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const msg = messages[virtualRow.index];
            if (!msg) return null;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="transcript-virtual-row"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MessageBubble
                  role={msg.role}
                  content={msg.content}
                  tokens={msg.tokens}
                  model={msg.model}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Session list ────────────────────────────────────────────

function SessionList({
  projectId,
  selectedSessionId,
  autoSelectId,
  onSelect,
}: {
  projectId: string;
  selectedSessionId: string | null;
  autoSelectId?: string;
  onSelect: (session: HistorySession) => void;
}) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const didAutoSelect = useRef<string | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    setSessions([]);
    didAutoSelect.current = undefined;
    fetch(
      `${API_BASE}/api/history/sessions?project=${encodeURIComponent(projectId)}`,
    )
      .then((r) => r.json())
      .then((data: HistorySession[]) => setSessions(data))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Auto-select session from URL on load (or when autoSelectId changes)
  useEffect(() => {
    if (!autoSelectId || sessions.length === 0) return;
    if (didAutoSelect.current === autoSelectId) return;
    const found = sessions.find((s) => s.id === autoSelectId);
    if (found) {
      didAutoSelect.current = autoSelectId;
      onSelect(found);
    }
  }, [sessions, autoSelectId, onSelect]);

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
          <div className="history-item-top">
            <span className="history-item-id">{s.id.slice(0, 8)}…</span>
            <span className="history-item-time">
              {formatTime(s.lastModified)}
            </span>
          </div>
          <div className="history-item-middle">
            <span className="history-item-meta">{formatDate(s.lastModified)}</span>
            {s.model && <span className="history-item-model">{shortModel(s.model)}</span>}
          </div>
          <div className="history-item-bottom">
            <span className="history-item-turns">{s.userTurns} events</span>
            <span className="history-item-tokens">
              {formatTokenCount(s.tokens.totalTokens)} tokens
              <span className="history-item-cost-inline"> ({estimateCost(s.tokens, s.model)})</span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

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

// ── Search components ────────────────────────────────────────

function HighlightSnippet({ snippet, matchOffset, matchLength }: SearchMatch) {
  const before = snippet.slice(0, matchOffset);
  const match = snippet.slice(matchOffset, matchOffset + matchLength);
  const after = snippet.slice(matchOffset + matchLength);
  return (
    <span>
      {before}
      <mark className="search-highlight">{match}</mark>
      {after}
    </span>
  );
}

function SearchResultsPanel({
  query,
  results,
  searching,
  onSelect,
}: {
  query: string;
  results: SearchResult[];
  searching: boolean;
  onSelect: (result: SearchResult) => void;
}) {
  if (searching) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">⟳</span>
        <span>SEARCHING TRANSCRIPTS...</span>
      </div>
    );
  }

  const queryDisplay = query.length > 32 ? query.slice(0, 32) + "…" : query;

  if (results.length === 0) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">∅</span>
        <span>NO RESULTS FOR "{queryDisplay.toUpperCase()}"</span>
      </div>
    );
  }

  return (
    <div className="search-results-panel">
      <div className="search-results-header">
        {results.length} SESSION{results.length !== 1 ? "S" : ""} MATCHED
      </div>
      {results.map((result) => (
        <div
          key={`${result.projectId}-${result.session.id}`}
          className="search-result-item"
          onClick={() => onSelect(result)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSelect(result)}
        >
          <div className="search-result-header">
            <span className="search-result-project">{result.projectName}</span>
            <span className="search-result-date">
              {formatDate(result.session.lastModified)}
            </span>
            {result.session.model && (
              <span className="msg-model">{shortModel(result.session.model)}</span>
            )}
            <span className="search-result-count">
              {result.matches.length} MATCH{result.matches.length !== 1 ? "ES" : ""}
            </span>
          </div>
          {result.matches.map((m, i) => (
            <div key={i} className="search-snippet">
              <div className="search-snippet-role">{m.role === "assistant" ? "CLAUDE" : "YOU"}</div>
              <HighlightSnippet {...m} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main HistoryBrowser ─────────────────────────────────────

const MIN_WIDTH = 160;
const MAX_WIDTH = 600;

interface HistoryBrowserProps {
  projectId?: string;
  sessionId?: string;
  onNavigate: (projectId?: string, sessionId?: string) => void;
}

export function HistoryBrowser({
  projectId: routeProjectId,
  sessionId: routeSessionId,
  onNavigate,
}: HistoryBrowserProps) {
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
      let url = `${API_BASE}/api/history/search?q=${encodeURIComponent(searchQuery)}`;
      if (selectedProject) url += `&project=${encodeURIComponent(selectedProject.id)}`;
      fetch(url)
        .then((r) => r.json())
        .then((data: SearchResult[]) => setSearchResults(data))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, selectedProject]);

  // Load projects and select from URL if present
  useEffect(() => {
    fetch(`${API_BASE}/api/history/projects`)
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
    setSelectedSession(s);
    onNavigate(selectedProject?.name, s.id);
  }, [onNavigate, selectedProject?.name]);

  const isSearching = searchQuery.trim().length >= 2;

  return (
    <div className="history-browser">
      {/* Search bar */}
      <div className="history-search-bar">
        <span className="history-search-icon">⌕</span>
        <input
          className="history-search-input"
          placeholder="SEARCH TRANSCRIPTS..."
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
          onSelect={(result) => {
            const proj = projects.find((p) => p.id === result.projectId);
            if (proj) {
              setSelectedProject(proj);
              setSelectedSession(result.session);
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
                  >
                    <div className="history-item-top">
                      <span className="history-item-name">{p.name}</span>
                    </div>
                    <div className="history-item-bottom">
                      <span className="history-item-meta">
                        {p.lastActivity ? formatDate(p.lastActivity) : "—"}
                      </span>
                      <span className="history-item-turns">
                        {p.sessionCount} sessions
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
              />
            )}
          </div>
          <ResizeHandle onMouseDown={startDrag("sessions")} />
        </>
      )}

      {/* Right: Transcript */}
      <div className="history-panel history-panel-wide">
        <div className="panel-header">
          <span className="panel-title">TRANSCRIPT</span>
          {selectedSession && (
            <span className="panel-subtitle">
              {selectedSession.id.slice(0, 8)}…
            </span>
          )}
        </div>

        {!selectedSession ? (
          <div className="history-empty">
            <span className="history-empty-icon">←</span>
            <span>SELECT A SESSION</span>
          </div>
        ) : (
          <TranscriptPanel key={selectedSession.filePath} session={selectedSession} />
        )}
      </div>
      </div>
      )}
    </div>
  );
}
