import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MD_COMPONENTS } from "../lib/mdComponents";
import type { ClaudeEvent, PendingTool } from "../types";
import { EVENT_COLORS, EVENT_ICONS } from "../types";

interface EventFeedProps {
  events: ClaudeEvent[];
  truncated?: boolean;
  isProcessing?: boolean;
  pendingTools?: PendingTool[];
}

const PROCESSING_MESSAGES = [
  "Vibing...",
  "Thinking...",
  "Neural pathways firing...",
  "Generating...",
  "Analyzing...",
  "Reasoning...",
  "Computing...",
  "On it...",
  "Contemplating...",
  "Processing...",
];

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
            {"\n"}
            {"  ".repeat(indent + 1)}
            <JsonValue value={item} indent={indent + 1} />
            {i < value.length - 1 && <span className="json-punct">,</span>}
          </span>
        ))}
        {"\n"}
        {"  ".repeat(indent)}
        <span className="json-bracket">]</span>
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
            {"\n"}
            {"  ".repeat(indent + 1)}
            <span className="json-key">"{k}"</span>
            <span className="json-punct">: </span>
            <JsonValue value={v} indent={indent + 1} />
            {i < entries.length - 1 && <span className="json-punct">,</span>}
          </span>
        ))}
        {"\n"}
        {"  ".repeat(indent)}
        <span className="json-bracket">{"}"}</span>
      </span>
    );
  }

  return <span>{String(value)}</span>;
}

/** Labeled key-value field */
function DetailField({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: "error";
}) {
  if (!value) return null;
  return (
    <div className={`detail-field${variant === "error" ? " detail-field-error" : ""}`}>
      <span
        className={`detail-field-label${variant === "error" ? " detail-field-label-error" : ""}`}
      >
        {label}
      </span>
      <span className="detail-field-value">{value}</span>
    </div>
  );
}

/** Scrollable code-block for multi-line output (Bash stdout, Grep results, etc.) */
function OutputBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  const formatted = value.replace(/\\n/g, "\n").replace(/\\t/g, "\t");

  // Try to parse as JSON for syntax-highlighted rendering
  let parsed: unknown = undefined;
  const trimmed = formatted.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      /* not JSON */
    }
  }

  return (
    <div className="detail-output-block">
      <span className="detail-field-label">{label}</span>
      {parsed !== undefined ? (
        <pre className="detail-output-pre event-detail-json">
          <JsonValue value={parsed} />
        </pre>
      ) : (
        <pre className="detail-output-pre">{formatted}</pre>
      )}
    </div>
  );
}

function truncate(s: string | undefined | null, max: number): string {
  if (!s) return "";
  if (typeof s !== "string") s = String(s);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ── Diff engine ──────────────────────────────────────────────────────────────

type DiffLine =
  | { type: "ctx"; text: string; oldLine: number; newLine: number }
  | { type: "del"; text: string; oldLine: number }
  | { type: "add"; text: string; newLine: number };

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  // Fallback for very large diffs — show all deletions then all additions
  if (m * n > 40000) {
    return [
      ...oldLines.map((text, i) => ({ type: "del" as const, text, oldLine: i + 1 })),
      ...newLines.map((text, i) => ({ type: "add" as const, text, newLine: i + 1 })),
    ];
  }

  // LCS table (suffix form)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      // Indices are bounded by loop constraints — non-null assertions are safe
      dp[i]![j]! =
        oldLines[i] === newLines[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0,
    j = 0,
    oldLine = 1,
    newLine = 1;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i]! === newLines[j]!) {
      result.push({ type: "ctx", text: oldLines[i]!, oldLine: oldLine++, newLine: newLine++ });
      i++;
      j++;
    } else if (j < n && (i >= m || dp[i + 1]![j]! >= dp[i]![j + 1]!)) {
      result.push({ type: "add", text: newLines[j]!, newLine: newLine++ });
      j++;
    } else {
      result.push({ type: "del", text: oldLines[i]!, oldLine: oldLine++ });
      i++;
    }
  }
  return result;
}

const DIFF_CONTEXT = 3;

function DiffView({ oldText, newText }: { oldText?: string; newText?: string }) {
  // Write tool: no old_string — show entire content as additions
  if (!oldText && newText) {
    const lines = newText.split("\n");
    return (
      <div className="diff-view">
        <div className="diff-hunk">
          {lines.map((text, i) => (
            <div key={i} className="diff-line diff-line-add">
              <span className="diff-gutter">+</span>
              <span className="diff-linenum">{i + 1}</span>
              <span className="diff-text">{text || " "}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!oldText || !newText) return null;

  const lines = computeDiff(oldText, newText);

  // Determine which line indices to show (near a change)
  const visible = new Set<number>();
  lines.forEach((line, i) => {
    if (line.type !== "ctx") {
      for (
        let k = Math.max(0, i - DIFF_CONTEXT);
        k <= Math.min(lines.length - 1, i + DIFF_CONTEXT);
        k++
      ) {
        visible.add(k);
      }
    }
  });

  const rendered: React.ReactNode[] = [];
  let prevVisible = true;
  lines.forEach((line, i) => {
    if (!visible.has(i)) {
      if (prevVisible) {
        rendered.push(
          <div key={`sep-${i}`} className="diff-separator">
            ···
          </div>,
        );
      }
      prevVisible = false;
      return;
    }
    prevVisible = true;
    if (line.type === "ctx") {
      rendered.push(
        <div key={i} className="diff-line diff-line-ctx">
          <span className="diff-gutter"> </span>
          <span className="diff-linenum">{line.oldLine}</span>
          <span className="diff-text">{line.text || " "}</span>
        </div>,
      );
    } else if (line.type === "del") {
      rendered.push(
        <div key={i} className="diff-line diff-line-del">
          <span className="diff-gutter">−</span>
          <span className="diff-linenum">{line.oldLine}</span>
          <span className="diff-text">{line.text || " "}</span>
        </div>,
      );
    } else {
      rendered.push(
        <div key={i} className="diff-line diff-line-add">
          <span className="diff-gutter">+</span>
          <span className="diff-linenum">{line.newLine}</span>
          <span className="diff-text">{line.text || " "}</span>
        </div>,
      );
    }
  });

  if (rendered.length === 0) return null;

  return (
    <div className="diff-view">
      <div className="diff-hunk">{rendered}</div>
    </div>
  );
}

function formatDuration(ms?: number): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Extracts plain text from a Stop event's `message` field.
 * Handles both a plain string and a structured message object
 * ({ role: "assistant", content: [{type:"text", text:"..."},...] }).
 */
function extractResponseText(d: Record<string, any>): string {
  // Server-injected field (read from transcript JSONL after Stop fires)
  if (typeof d.response_text === "string" && d.response_text.trim()) return d.response_text.trim();
  // Fallback: structured message object in hook payload (future-proof)
  const content = d.message?.content;
  if (Array.isArray(content)) {
    const text = content
      .filter((b: any) => b.type === "text")
      .map((b: any) => (b.text as string) || "")
      .join("\n\n")
      .trim();
    if (text) return text;
  }
  if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  return "";
}

/** Expandable raw/clean toggle for UserPromptSubmit */
function PromptDetail({ event }: { event: ClaudeEvent }) {
  const d = event.data;
  const raw = (d.prompt || d.message || "") as string;
  const cleaned = raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
  const hasSystemReminder = raw.trim() !== cleaned;
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="event-detail-structured prompt-detail">
      <div className="prompt-header">
        <span className="detail-field-label">PROMPT</span>
        {hasSystemReminder && (
          <button
            className={`prompt-raw-toggle${showRaw ? " active" : ""}`}
            onClick={() => setShowRaw((v) => !v)}
            title={
              showRaw ? "Show cleaned prompt" : "Show raw prompt including system-reminder blocks"
            }
          >
            {showRaw ? "CLEAN" : "RAW"}
          </button>
        )}
      </div>
      {showRaw ? (
        <pre className="prompt-raw-content">{raw.trim()}</pre>
      ) : (
        <span className="detail-field-value">{cleaned || "(empty)"}</span>
      )}
    </div>
  );
}

/** Renders structured detail view for known event types, JSON for the rest */
/** Extract plain text from a tool response — handles string, {type,text}, [{type,text},...] */
function extractTextFromToolResponse(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const unwrap = (item: unknown): string => {
    if (typeof item === "string") return item;
    if (typeof item === "object" && item !== null && "text" in item)
      return String((item as Record<string, unknown>).text ?? "");
    return "";
  };
  if (Array.isArray(raw)) return raw.map(unwrap).filter(Boolean).join("\n");
  return unwrap(raw);
}

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
      if (
        (event.toolName === "Read" || event.toolName === "Write" || event.toolName === "Edit") &&
        input?.file_path
      ) {
        const hasDiff = input.old_string != null || input.new_string != null;
        return (
          <div className="event-detail-structured">
            <DetailField label="FILE" value={input.file_path} />
            {hasDiff ? (
              <DiffView oldText={input.old_string} newText={input.new_string} />
            ) : (
              input.content && <DiffView newText={input.content} />
            )}
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
      return (
        <pre className="event-detail-json">
          <JsonValue value={input || d} />
        </pre>
      );

    case "UserPromptSubmit":
      return <PromptDetail event={event} />;

    case "Notification":
      return (
        <div className="event-detail-structured">
          <DetailField label="MESSAGE" value={d.message || ""} />
        </div>
      );

    case "SubagentStart":
      return (
        <div className="event-detail-structured">
          <DetailField
            label="TYPE"
            value={d.agent_type || d.subagent_type || d.tool_input?.subagent_type || "unknown"}
          />
          {(d.description || d.tool_input?.description) && (
            <DetailField label="TASK" value={d.description || d.tool_input?.description} />
          )}
          {d.tool_input?.prompt && (
            <DetailField label="PROMPT" value={truncate(d.tool_input.prompt, 500)} />
          )}
        </div>
      );

    case "SubagentStop":
      return (
        <div className="event-detail-structured">
          <DetailField label="TYPE" value={d.agent_type || d.subagent_type || "unknown"} />
          {d.description && <DetailField label="TASK" value={d.description} />}
          {event.duration != null && (
            <DetailField label="DURATION" value={formatDuration(event.duration)!} />
          )}
        </div>
      );

    case "Stop": {
      const responseText = extractResponseText(d);
      return (
        <div className="event-detail-structured">
          {d.stop_reason && <DetailField label="REASON" value={d.stop_reason} />}
          {responseText ? (
            <OutputBlock label="RESPONSE" value={truncate(responseText, 4000)} />
          ) : (
            !d.stop_reason && <DetailField label="STATUS" value="Response generation complete" />
          )}
        </div>
      );
    }

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
      const response =
        typeof d.tool_response === "string"
          ? d.tool_response
          : d.tool_response != null
            ? JSON.stringify(d.tool_response, null, 2)
            : "";
      if (event.toolName === "Bash") {
        return (
          <div className="event-detail-structured">
            {d.tool_input?.command && <DetailField label="COMMAND" value={d.tool_input.command} />}
            {response && <OutputBlock label="OUTPUT" value={truncate(response, 2000)} />}
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      if (event.toolName === "Edit") {
        return (
          <div className="event-detail-structured">
            {d.tool_input?.file_path && <DetailField label="FILE" value={d.tool_input.file_path} />}
            <DiffView oldText={d.tool_input?.old_string} newText={d.tool_input?.new_string} />
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      if (event.toolName === "Write") {
        return (
          <div className="event-detail-structured">
            {d.tool_input?.file_path && <DetailField label="FILE" value={d.tool_input.file_path} />}
            {d.tool_input?.content && <DiffView newText={d.tool_input.content} />}
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      if (event.toolName === "Read") {
        const content = extractTextFromToolResponse(d.tool_response);
        return (
          <div className="event-detail-structured">
            {d.tool_input?.file_path && <DetailField label="FILE" value={d.tool_input.file_path} />}
            {content && <OutputBlock label="CONTENT" value={truncate(content, 4000)} />}
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      if (event.toolName === "Grep" || event.toolName === "Glob") {
        const results = extractTextFromToolResponse(d.tool_response);
        return (
          <div className="event-detail-structured">
            {d.tool_input?.pattern && <DetailField label="PATTERN" value={d.tool_input.pattern} />}
            {d.tool_input?.path && <DetailField label="PATH" value={d.tool_input.path} />}
            {results && <OutputBlock label="RESULTS" value={truncate(results, 4000)} />}
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      if (event.toolName === "Task") {
        return (
          <div className="event-detail-structured">
            {d.tool_input?.description && (
              <DetailField label="TASK" value={d.tool_input.description} />
            )}
            {response && <OutputBlock label="RESULT" value={truncate(response, 2000)} />}
            {dur && <DetailField label="DURATION" value={dur} />}
          </div>
        );
      }
      return (
        <div className="event-detail-structured">
          {response ? (
            <OutputBlock label="OUTPUT" value={truncate(response, 2000)} />
          ) : (
            <pre className="event-detail-json">
              <JsonValue value={d} />
            </pre>
          )}
          {dur && <DetailField label="DURATION" value={dur} />}
        </div>
      );
    }

    case "PostToolUseFailure": {
      const errResponse =
        typeof d.tool_response === "string"
          ? d.tool_response
          : d.error ||
            (d.tool_response != null ? JSON.stringify(d.tool_response) : "Unknown error");
      const contextLabel =
        event.toolName === "Bash"
          ? "COMMAND"
          : event.toolName === "Read" || event.toolName === "Write" || event.toolName === "Edit"
            ? "FILE"
            : event.toolName === "Grep" || event.toolName === "Glob"
              ? "PATTERN"
              : null;
      const contextValue =
        contextLabel === "COMMAND"
          ? d.tool_input?.command
          : contextLabel === "FILE"
            ? d.tool_input?.file_path
            : contextLabel === "PATTERN"
              ? d.tool_input?.pattern
              : null;
      return (
        <div className="event-detail-structured event-detail-error">
          {contextLabel && contextValue && (
            <DetailField label={contextLabel} value={contextValue} />
          )}
          <DetailField label="ERROR" value={truncate(errResponse, 2000)} variant="error" />
          {event.duration != null && (
            <DetailField label="DURATION" value={formatDuration(event.duration)!} />
          )}
        </div>
      );
    }

    case "Thinking": {
      const text = (d.thinking_text as string) || "";
      return (
        <div className="event-inline-md thinking-inline md-content">
          <ReactMarkdown components={MD_COMPONENTS} remarkPlugins={[remarkGfm]}>
            {text}
          </ReactMarkdown>
        </div>
      );
    }

    case "Output": {
      const text = (d.output_text as string) || "";
      return (
        <div className="event-inline-md output-inline md-content">
          <ReactMarkdown components={MD_COMPONENTS} remarkPlugins={[remarkGfm]}>
            {text}
          </ReactMarkdown>
        </div>
      );
    }

    default:
      return (
        <pre className="event-detail-json">
          <JsonValue value={d} />
        </pre>
      );
  }
}

function getEventSummary(event: ClaudeEvent): string {
  const d = event.data;

  switch (event.type) {
    case "PreToolUse":
      if (event.toolName === "Bash") return d.tool_input?.command || "executing...";
      if (event.toolName === "Read")
        return d.tool_input?.file_path?.split("/").pop() || "reading...";
      if (event.toolName === "Write")
        return d.tool_input?.file_path?.split("/").pop() || "writing...";
      if (event.toolName === "Edit")
        return d.tool_input?.file_path?.split("/").pop() || "editing...";
      if (event.toolName === "Glob") return d.tool_input?.pattern || "searching...";
      if (event.toolName === "Grep") return d.tool_input?.pattern || "searching...";
      if (event.toolName === "Task") return d.tool_input?.description || "spawning agent...";
      return event.toolName || "unknown tool";

    case "PostToolUse": {
      const dur =
        event.duration != null
          ? ` (${event.duration < 1000 ? `${event.duration}ms` : `${(event.duration / 1000).toFixed(2)}s`})`
          : "";
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

    case "Stop": {
      const responseText = extractResponseText(d);
      if (responseText) return truncate(responseText, 120);
      return d.stop_reason ? `Stop: ${d.stop_reason}` : "Response complete";
    }

    case "TaskCompleted":
      return d.description || "task done";

    case "Notification":
      return d.message || "notification";

    case "Thinking": {
      const text = (d.thinking_text as string) || "";
      return truncate(text.replace(/\n/g, " "), 120) || "thinking...";
    }

    case "Output": {
      const text = (d.output_text as string) || "";
      return truncate(text.replace(/\n/g, " "), 120) || "output...";
    }

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
  Thinking: "THINK",
  Output: "OUTPUT",
};

function EventDetailModal({ event, onClose }: { event: ClaudeEvent; onClose: () => void }) {
  const color = EVENT_COLORS[event.type] || "#8892a8";
  const icon = EVENT_ICONS[event.type] || "·";
  const label = EVENT_TYPE_LABELS[event.type] ?? event.type;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="event-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>
        <div
          className="event-modal-header"
          style={{ "--event-color": color } as React.CSSProperties}
        >
          <span className="event-modal-icon" style={{ color }}>
            {icon}
          </span>
          <span className="event-modal-type" style={{ color }}>
            [{label}]
          </span>
          {event.toolName && (
            <span className="event-tool" data-tooltip={event.toolName}>
              {event.toolName}
            </span>
          )}
          <span className="event-modal-time">{formatTime(event.timestamp)}</span>
          <button className="event-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="event-modal-body">
          <EventDetail event={event} />
        </div>
      </div>
    </div>
  );
}

export function EventFeed({ events, truncated, isProcessing, pendingTools }: EventFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const [pillsScroll, setPillsScroll] = useState({ left: false, right: false });
  const [processingMsgIdx, setProcessingMsgIdx] = useState(0);
  const [modalEvent, setModalEvent] = useState<ClaudeEvent | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("cv-filter-types");
      return stored ? new Set<string>(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return localStorage.getItem("cv-search-query") || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      if (filterTypes.size > 0)
        localStorage.setItem("cv-filter-types", JSON.stringify([...filterTypes]));
      else localStorage.removeItem("cv-filter-types");
    } catch {}
  }, [filterTypes]);

  useEffect(() => {
    try {
      if (searchQuery) localStorage.setItem("cv-search-query", searchQuery);
      else localStorage.removeItem("cv-search-query");
    } catch {}
  }, [searchQuery]);

  useEffect(() => {
    if (!isProcessing) return;
    const id = setInterval(() => {
      setProcessingMsgIdx((i) => (i + 1) % PROCESSING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, [isProcessing]);

  const openModal = useCallback((event: ClaudeEvent) => {
    setModalEvent(event);
  }, []);

  const toggleFilter = useCallback((type: string) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const syncScrollState = useCallback(() => {
    const el = pillsRef.current;
    if (!el) return;
    setPillsScroll({
      left: el.scrollLeft > 0,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  // Sync scroll buttons when pills container is resized or pills change
  useEffect(() => {
    const el = pillsRef.current;
    if (!el) return;
    el.addEventListener("scroll", syncScrollState, { passive: true });
    const ro = new ResizeObserver(syncScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncScrollState);
      ro.disconnect();
    };
  }, [syncScrollState]);

  // Collect active event types with counts for filter pills
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.type, (counts.get(e.type) || 0) + 1);
    return counts;
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = events;
    if (filterTypes.size > 0) {
      result = result.filter((e) => filterTypes.has(e.type));
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
  }, [events, filterTypes, searchQuery]);

  const virtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 26,
    overscan: 20,
  });

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
    <div className="panel event-feed" role="region" aria-label="Event Stream">
      <div className="panel-header">
        <span className="panel-icon" aria-hidden="true">
          ▹
        </span>
        EVENT STREAM
        <span className="panel-count">
          {filteredEvents.length}
          {filteredEvents.length !== events.length ? `/${events.length}` : ""}
        </span>
      </div>
      {truncated && (
        <div className="feed-truncation-banner">
          <span>⚠</span>
          <span>HISTORY TRUNCATED — showing latest 2,000 events</span>
        </div>
      )}
      <div className="event-filter-bar">
        <div className="event-filter-pills-wrapper">
          {pillsScroll.left && (
            <button
              className="pills-scroll-btn pills-scroll-btn-left"
              aria-label="Scroll filters left"
              onClick={() => pillsRef.current?.scrollBy({ left: -120, behavior: "smooth" })}
            >
              ‹
            </button>
          )}
          <div className="event-filter-pills" ref={pillsRef}>
            <button
              className={`event-filter-pill${filterTypes.size === 0 ? " active" : ""}`}
              style={{ "--pill-color": "#c8d0e0" } as React.CSSProperties}
              aria-pressed={filterTypes.size === 0}
              onClick={() => setFilterTypes(new Set())}
            >
              ALL
            </button>
            {Array.from(typeCounts.entries()).map(([type, count]) => {
              const color = EVENT_COLORS[type] || "#8892a8";
              const label = EVENT_TYPE_LABELS[type] || type.toUpperCase();
              const isActive = filterTypes.has(type);
              return (
                <button
                  key={type}
                  className={`event-filter-pill${isActive ? " active" : ""}`}
                  style={{ "--pill-color": color } as React.CSSProperties}
                  aria-pressed={isActive}
                  onClick={() => toggleFilter(type)}
                >
                  {label}
                  <span className="event-filter-pill-count">{count}</span>
                </button>
              );
            })}
          </div>
          {pillsScroll.right && (
            <button
              className="pills-scroll-btn pills-scroll-btn-right"
              aria-label="Scroll filters right"
              onClick={() => pillsRef.current?.scrollBy({ left: 120, behavior: "smooth" })}
            >
              ›
            </button>
          )}
        </div>
        <div className="event-search-wrapper">
          <input
            className="event-search-input"
            type="text"
            placeholder="Search..."
            aria-label="Search events"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="event-search-clear"
              aria-label="Clear search"
              onClick={() => setSearchQuery("")}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div
        className="event-feed-list"
        ref={feedRef}
        onScroll={handleScroll}
        role="list"
        aria-label="Events"
      >
        {filteredEvents.length === 0 ? (
          <div className="event-empty">
            <span className="blink">▊</span>{" "}
            {events.length === 0 ? "Awaiting neural signals..." : "No matching events"}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const event = filteredEvents[virtualRow.index]!;
              const color = EVENT_COLORS[event.type] || "#8892a8";
              const icon = EVENT_ICONS[event.type] || "·";
              const hasDetail = event.type !== "SessionStart" && event.type !== "SessionEnd";

              return (
                <div
                  key={event.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  role="listitem"
                  className="event-item"
                  style={
                    {
                      "--event-color": color,
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    } as React.CSSProperties
                  }
                >
                  <div
                    className={`event-row${hasDetail ? " clickable" : ""}`}
                    role={hasDetail ? "button" : undefined}
                    tabIndex={hasDetail ? 0 : undefined}
                    onClick={() => hasDetail && openModal(event)}
                    onKeyDown={(e) => {
                      if (hasDetail && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        openModal(event);
                      }
                    }}
                  >
                    <span className="event-time">{formatTime(event.timestamp)}</span>
                    <span className="event-icon" aria-hidden="true" style={{ color }}>
                      {icon}
                    </span>
                    <span className="event-type" style={{ color }}>
                      [{event.type}]
                    </span>
                    {event.toolName && (
                      <span className="event-tool" data-tooltip={event.toolName}>
                        {event.toolName}
                      </span>
                    )}
                    <span className="event-summary" data-tooltip={getEventSummary(event)}>
                      {getEventSummary(event)}
                    </span>
                    {hasDetail && (
                      <span className="event-expand-icon" aria-hidden="true" style={{ color }}>
                        ›
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalEvent && <EventDetailModal event={modalEvent} onClose={() => setModalEvent(null)} />}

      {isProcessing && (
        <div className="feed-processing-banner" role="status" aria-live="polite">
          <span className="feed-processing-dot" aria-hidden="true" />
          <span className="feed-processing-text" key={processingMsgIdx}>
            {pendingTools && pendingTools.length > 0
              ? `Running ${pendingTools[0]!.tool}...`
              : PROCESSING_MESSAGES[processingMsgIdx % PROCESSING_MESSAGES.length]}
          </span>
        </div>
      )}
    </div>
  );
}
