import { useEffect, useRef, useState, useCallback } from "react";
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
function DetailField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="detail-field">
      <span className="detail-field-label">{label}</span>
      <span className="detail-field-value">{value}</span>
    </div>
  );
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

    case "PostToolUse":
      return `${event.toolName || "tool"} → success`;

    case "PostToolUseFailure":
      return `${event.toolName || "tool"} → FAILED`;

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

export function EventFeed({ events }: EventFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (!el || !autoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [events]);

  const handleScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    autoScrollRef.current = atBottom;
  };

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="panel event-feed">
      <div className="panel-header">
        <span className="panel-icon">▹</span>
        EVENT STREAM
        <span className="panel-count">{events.length}</span>
      </div>
      <div className="event-feed-list" ref={feedRef} onScroll={handleScroll}>
        {events.length === 0 ? (
          <div className="event-empty">
            <span className="blink">▊</span> Awaiting neural signals...
          </div>
        ) : (
          events.map((event) => {
            const color = EVENT_COLORS[event.type] || "#8892a8";
            const icon = EVENT_ICONS[event.type] || "·";
            const isExpanded = expandedId === event.id;

            return (
              <div key={event.id} className={`event-item${isExpanded ? " expanded" : ""}`} style={{ "--event-color": color } as React.CSSProperties}>
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
                {isExpanded && (
                  <div className="event-detail">
                    <EventDetail event={event} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
