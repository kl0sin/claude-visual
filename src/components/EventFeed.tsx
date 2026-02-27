import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ClaudeEvent } from "../types";
import { EVENT_COLORS, EVENT_ICONS } from "../types";

interface EventFeedProps {
  events: ClaudeEvent[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Syntax-highlighted JSON value renderer */
function JsonValue({ value, indent = 0 }: { value: unknown; indent?: number }): React.ReactElement {
  if (value === null) return <span className="json-null">null</span>;
  if (value === undefined) return <span className="json-null">undefined</span>;
  if (typeof value === "boolean") return <span className="json-bool">{String(value)}</span>;
  if (typeof value === "number") return <span className="json-number">{value}</span>;

  if (typeof value === "string") {
    if (value.length > 500) {
      return <span className="json-string">"{value.slice(0, 500)}…"</span>;
    }
    return <span className="json-string">"{value}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="json-bracket">[]</span>;
    return (
      <span>
        <span className="json-bracket">[</span>
        {value.map((item, i) => (
          <span key={i}>
            {"\n"}{"  ".repeat(indent + 1)}
            <JsonValue value={item} indent={indent + 1} />
            {i < value.length - 1 && <span className="json-punct">,</span>}
          </span>
        ))}
        {"\n"}{"  ".repeat(indent)}<span className="json-bracket">]</span>
      </span>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="json-bracket">{"{}"}</span>;
    return (
      <span>
        <span className="json-bracket">{"{"}</span>
        {entries.map(([k, v], i) => (
          <span key={k}>
            {"\n"}{"  ".repeat(indent + 1)}
            <span className="json-key">"{k}"</span>
            <span className="json-punct">: </span>
            <JsonValue value={v} indent={indent + 1} />
            {i < entries.length - 1 && <span className="json-punct">,</span>}
          </span>
        ))}
        {"\n"}{"  ".repeat(indent)}<span className="json-bracket">{"}"}</span>
      </span>
    );
  }

  return <span>{String(value)}</span>;
}

/** Labeled key-value field */
function DetailField({ label, value, variant }: { label: string; value: string; variant?: "error" }) {
  if (!value) return null;
  return (
    <div className={`detail-field${variant === "error" ? " detail-field-error" : ""}`}>
      <span className={`detail-field-label${variant === "error" ? " detail-field-label-error" : ""}`}>{label}</span>
      <span className="detail-field-value">{value}</span>
    </div>
  );
}

/** Scrollable code-block for multi-line output (Bash stdout, Grep results, etc.) */
function OutputBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  // Unescape literal \n and \t that may come from JSON-serialized hook payloads
  const formatted = value.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  return (
    <div className="detail-output-block">
      <span className="detail-field-label">{label}</span>
      <pre className="detail-output-pre">{formatted}</pre>
    </div>
  );
}

function truncate(s: string | undefined | null, max: number): string {
  if (!s) return "";
  if (typeof s !== "string") s = String(s);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function formatDuration(ms?: number): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/** Renders structured detail view for known event types, JSON for the rest */
function EventDetail({ event }: { event: ClaudeEvent }) {
  const d = event.data;
  const input = d.tool_input;

  switch (event.type) {
    case "PreToolUse":
      if (event.toolName === "Bash" && input?.command) {
        return (
          <div className="event-detail-structured">
            <DetailField label="COMMAND" value={input.command} />
            {input.description && <DetailField label="DESC" value={input.description} />}
            {input.timeout && <DetailField label="TIMEOUT" value={`${input.timeout}ms`} />}
          </div>
        );
      }
      if ((event.toolName === "Read" || event.toolName === "Write" || event.toolName === "Edit") && input?.file_path) {
        return (
          <div className="event-detail-structured">
            <DetailField label="FILE" value={input.file_path} />
            {input.old_string && <DetailField label="FIND" value={input.old_string} />}
            {input.new_string && <DetailField label="REPLACE" value={input.new_string} />}
            {input.content && <DetailField label="CONTENT" value={input.content.length > 200 ? input.content.slice(0, 200) + "…" : input.content} />}
          </div>
        );
      }
      if ((event.toolName === "Grep" || event.toolName === "Glob") && input) {
        return (
          <div className="event-detail-structured">
            <DetailField label="PATTERN" value={input.pattern} />
            <DetailField label="PATH" value={input.path || "."} />
            {input.glob && <DetailField label="GLOB" value={input.glob} />}
          </div>
        );
      }
      if (event.toolName === "Task" && input) {
        return (
          <div className="event-detail-structured">
            {input.description && <DetailField label="TASK" value={input.description} />}
            {input.prompt && <DetailField label="PROMPT" value={input.prompt} />}
          </div>
        );
      }
      return <pre className="event-detail-json"><JsonValue value={input || d} /></pre>;

    case "UserPromptSubmit": {
      let prompt = (d.prompt || d.message || "") as string;
      prompt = prompt.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
      return (
        <div className="event-detail-structured">
          <DetailField label="PROMPT" value={prompt} />
        </div>
      );
    }

    case "Notification":
      return (
        <div className="event-detail-structured">
          <DetailField label="MESSAGE" value={d.message || ""} />
        </div>
      );

    case "SubagentStart":
      return (
        <div className="event-detail-structured">
          <DetailField label="TYPE" value={d.agent_type || d.subagent_type || d.tool_input?.subagent_type || "unknown"} />
          {(d.description || d.tool_input?.description) && <DetailField label="TASK" value={d.description || d.tool_input?.description} />}
          {d.tool_input?.prompt && <DetailField label="PROMPT" value={truncate(d.tool_input.prompt, 500)} />}
        </div>
      );

    case "SubagentStop":
      return (
        <div className="event-detail-structured">
          <DetailField label="TYPE" value={d.agent_type || d.subagent_type || "unknown"} />
          {d.description && <DetailField label="TASK" value={d.description} />}
          {event.duration != null && <DetailField label="DURATION" value={formatDuration(event.duration)!} />}
        </div>
      );

    case "Stop":
      return (
        <div className="event-detail-structured">
          {d.stop_reason && <DetailField label="REASON" value={d.stop_reason} />}
          {d.message && <DetailField label="MESSAGE" value={truncate(d.message, 500)} />}
          {!d.stop_reason && !d.message && <DetailField label="STATUS" value="Response generation complete" />}
        </div>
      );

    case "SessionStart":
      return (
        <div className="event-detail-structured">
          {d.session_id && <DetailField label="SESSION" value={d.session_id} />}
          {d.cwd && <DetailField label="CWD" value={d.cwd} />}
        </div>
      );

    case "SessionEnd":
      return (
        <div className="event-detail-structured">
          {d.session_id && <DetailField label="SESSION" value={d.session_id} />}
        </div>
      );

    case "TaskCompleted":
      return (
        <div className="event-detail-structured">
          {d.description && <DetailField label="TASK" value={d.description} />}
          {d.result && <DetailField label="RESULT" value={truncate(d.result, 500)} />}
        </div>
      );

    case "PostToolUse": {
      const dur = formatDuration(event.duration);
      const response = typeof d.tool_response === "string" ? d.tool_response : d.tool_response != null ? JSON.stringify(d.tool_response, null, 2) : "";
      if (event.toolName === "Bash") {
        return (
          <div className="event-detail-structured">
            {d.tool_input?.command && <DetailField label="COMMAND" value={d.tool_input.command} />}
            {response && <OutputBlock label="OUTPUT" value={truncate(response, 2000)} />}
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      if (event.toolName === "Read" || event.toolName === "Write" || event.toolName === "Edit") {
        return (
          <div className="event-detail-structured">
            {d.tool_input?.file_path && <DetailField label="FILE" value={d.tool_input.file_path} />}
            {response && <OutputBlock label="OUTPUT" value={truncate(response, 2000)} />}
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      if (event.toolName === "Grep" || event.toolName === "Glob") {
        return (
          <div className="event-detail-structured">
            {d.tool_input?.pattern && <DetailField label="PATTERN" value={d.tool_input.pattern} />}
            {response && <OutputBlock label="RESULTS" value={truncate(response, 2000)} />}
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      if (event.toolName === "Task") {
        return (
          <div className="event-detail-structured">
            {d.tool_input?.description && <DetailField label="TASK" value={d.tool_input.description} />}
            {response && <OutputBlock label="RESULT" value={truncate(response, 2000)} />}
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      return (
        <div className="event-detail-structured">
          {response
            ? <OutputBlock label="OUTPUT" value={truncate(response, 2000)} />
            : <pre className="event-detail-json"><JsonValue value={d} /></pre>}
          {dur && <DetailField label="DURATION" value={dur} />}
        </div>
      );
    }

    case "PostToolUseFailure": {
      const errResponse = typeof d.tool_response === "string" ? d.tool_response : d.error || (d.tool_response != null ? JSON.stringify(d.tool_response) : "Unknown error");
      const contextLabel = event.toolName === "Bash" ? "COMMAND" : (event.toolName === "Read" || event.toolName === "Write" || event.toolName === "Edit") ? "FILE" : (event.toolName === "Grep" || event.toolName === "Glob") ? "PATTERN" : null;
      const contextValue = contextLabel === "COMMAND" ? d.tool_input?.command : contextLabel === "FILE" ? d.tool_input?.file_path : contextLabel === "PATTERN" ? d.tool_input?.pattern : null;
      return (
        <div className="event-detail-structured event-detail-error">
          {contextLabel && contextValue && <DetailField label={contextLabel} value={contextValue} />}
          <DetailField label="ERROR" value={truncate(errResponse, 2000)} variant="error" />
          {event.duration != null && <DetailField label="DURATION" value={formatDuration(event.duration)!} />}
        </div>
      );
    }

    default:
      return <pre className="event-detail-json"><JsonValue value={d} /></pre>;
  }
}

function getEventSummary(event: ClaudeEvent): string {
  const d = event.data;

  switch (event.type) {
    case "PreToolUse":
      if (event.toolName === "Bash") return d.tool_input?.command || "executing...";
      if (event.toolName === "Read") return d.tool_input?.file_path?.split("/").pop() || "reading...";
      if (event.toolName === "Write") return d.tool_input?.file_path?.split("/").pop() || "writing...";
      if (event.toolName === "Edit") return d.tool_input?.file_path?.split("/").pop() || "editing...";
      if (event.toolName === "Glob") return d.tool_input?.pattern || "searching...";
      if (event.toolName === "Grep") return d.tool_input?.pattern || "searching...";
      if (event.toolName === "Task") return d.tool_input?.description || "spawning agent...";
      return event.toolName || "unknown tool";

    case "PostToolUse": {
      const dur = event.duration != null ? ` (${event.duration < 1000 ? `${event.duration}ms` : `${(event.duration / 1000).toFixed(2)}s`})` : "";
      return `${event.toolName || "tool"} → ok${dur}`;
    }

    case "PostToolUseFailure": {
      const errMsg = typeof d.tool_response === "string" ? d.tool_response : d.error || "";
      const preview = errMsg ? `: ${errMsg.slice(0, 60).replace(/\n/g, " ")}` : "";
      return `${event.toolName || "tool"} → FAILED${preview}`;
    }

    case "SubagentStart":
      return `${d.agent_type || d.subagent_type || "agent"}: ${d.description || "started"}`;

    case "SubagentStop":
      return `${d.agent_type || d.subagent_type || "agent"}: completed${event.duration ? ` (${(event.duration / 1000).toFixed(1)}s)` : ""}`;

    case "SessionStart":
      return "Session initialized";

    case "SessionEnd":
      return "Session terminated";

    case "UserPromptSubmit": {
      let prompt = (d.prompt || d.message || "") as string;
      prompt = prompt.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
      return prompt || "prompt submitted";
    }

    case "Stop":
      return "Response complete";

    case "TaskCompleted":
      return d.description || "task done";

    case "Notification":
      return d.message || "notification";

    default:
      return JSON.stringify(d);
  }
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  PreToolUse: "PRE",
  PostToolUse: "POST",
  PostToolUseFailure: "FAIL",
  UserPromptSubmit: "PROMPT",
  SubagentStart: "AGENT▶",
  SubagentStop: "AGENT■",
  SessionStart: "SESS▶",
  SessionEnd: "SESS■",
  Stop: "STOP",
  Notification: "NOTIF",
  TaskCompleted: "DONE",
};

export function EventFeed({ events }: EventFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(() => {
    try { return localStorage.getItem("cv-filter-type") || null; } catch { return null; }
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    try { return localStorage.getItem("cv-search-query") || ""; } catch { return ""; }
  });

  useEffect(() => {
    try {
      if (filterType) localStorage.setItem("cv-filter-type", filterType);
      else localStorage.removeItem("cv-filter-type");
    } catch {}
  }, [filterType]);

  useEffect(() => {
    try {
      if (searchQuery) localStorage.setItem("cv-search-query", searchQuery);
      else localStorage.removeItem("cv-search-query");
    } catch {}
  }, [searchQuery]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Collect active event types with counts for filter pills
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.type, (counts.get(e.type) || 0) + 1);
    return counts;
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = events;
    if (filterType) {
      result = result.filter((e) => e.type === filterType);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) => {
        const summary = getEventSummary(e).toLowerCase();
        const tool = (e.toolName || "").toLowerCase();
        return summary.includes(q) || tool.includes(q);
      });
    }
    return result;
  }, [events, filterType, searchQuery]);

  const virtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 26,
    overscan: 20,
  });

  // Re-measure when expanded item changes
  useEffect(() => {
    virtualizer.measure();
  }, [expandedId, virtualizer]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (!autoScrollRef.current || filteredEvents.length === 0) return;
    virtualizer.scrollToIndex(filteredEvents.length - 1, { align: "end" });
  }, [filteredEvents.length, virtualizer]);

  const handleScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    autoScrollRef.current = atBottom;
  };

  return (
    <div className="panel event-feed">
      <div className="panel-header">
        <span className="panel-icon">▹</span>
        EVENT STREAM
        <span className="panel-count">{filteredEvents.length}{filteredEvents.length !== events.length ? `/${events.length}` : ""}</span>
      </div>
      <div className="event-filter-bar">
        <div className="event-filter-pills">
          {Array.from(typeCounts.entries()).map(([type, count]) => {
            const color = EVENT_COLORS[type] || "#8892a8";
            const label = EVENT_TYPE_LABELS[type] || type.toUpperCase();
            const isActive = filterType === type;
            return (
              <button
                key={type}
                className={`event-filter-pill${isActive ? " active" : ""}`}
                style={{ "--pill-color": color } as React.CSSProperties}
                onClick={() => setFilterType(isActive ? null : type)}
              >
                {label}<span className="event-filter-pill-count">{count}</span>
              </button>
            );
          })}
        </div>
        <input
          className="event-search-input"
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="event-feed-list" ref={feedRef} onScroll={handleScroll}>
        {filteredEvents.length === 0 ? (
          <div className="event-empty">
            <span className="blink">▊</span> {events.length === 0 ? "Awaiting neural signals..." : "No matching events"}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const event = filteredEvents[virtualRow.index]!;
              const color = EVENT_COLORS[event.type] || "#8892a8";
              const icon = EVENT_ICONS[event.type] || "·";
              const isExpanded = expandedId === event.id;

              return (
                <div
                  key={event.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={`event-item${isExpanded ? " expanded" : ""}`}
                  style={{
                    "--event-color": color,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  } as React.CSSProperties}
                >
                  <div className="event-row" onClick={() => toggleExpand(event.id)}>
                    <span className="event-time">{formatTime(event.timestamp)}</span>
                    <span className="event-icon" style={{ color }}>{icon}</span>
                    <span className="event-type" style={{ color }}>[{event.type}]</span>
                    {event.toolName && (
                      <span className="event-tool">{event.toolName}</span>
                    )}
                    <span className="event-summary">{getEventSummary(event)}</span>
                    <span className="event-expand-icon" style={{ color }}>{isExpanded ? "▾" : "▸"}</span>
                  </div>
                  <div className="event-detail-wrapper">
                    <div className="event-detail">
                      {isExpanded && <EventDetail event={event} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
