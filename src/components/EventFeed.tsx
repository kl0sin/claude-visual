import { useEffect, useRef } from "react";
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

function getEventSummary(event: ClaudeEvent): string {
  const d = event.data;

  switch (event.type) {
    case "PreToolUse":
      if (event.toolName === "Bash") return d.tool_input?.command?.slice(0, 80) || "executing...";
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
      return prompt.slice(0, 60) || "prompt submitted";
    }

    case "Stop":
      return "Response complete";

    case "TaskCompleted":
      return d.description || "task done";

    case "Notification":
      return d.message?.slice(0, 60) || "notification";

    default:
      return JSON.stringify(d).slice(0, 60);
  }
}

export function EventFeed({ events }: EventFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

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

            return (
              <div key={event.id} className="event-row" style={{ "--event-color": color } as React.CSSProperties}>
                <span className="event-time">{formatTime(event.timestamp)}</span>
                <span className="event-icon" style={{ color }}>{icon}</span>
                <span className="event-type" style={{ color }}>[{event.type}]</span>
                {event.toolName && (
                  <span className="event-tool">{event.toolName}</span>
                )}
                <span className="event-summary">{getEventSummary(event)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
