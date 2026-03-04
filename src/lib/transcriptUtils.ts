import type { TranscriptContent, TranscriptMessage } from "../types";

// ── Formatters ───────────────────────────────────────────────

export function formatTokenCount(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortParentPath(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  parts.pop();
  if (parts.length > 3) return "…/" + parts.slice(-2).join("/");
  return "/" + parts.join("/");
}

export function shortModel(model?: string): string {
  if (!model) return "";
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model.split("-")[0] ?? model;
}

export function computeDuration(startTs?: string, endTs?: string): string | null {
  if (!startTs || !endTs) return null;
  const ms = new Date(endTs).getTime() - new Date(startTs).getTime();
  if (ms <= 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

// ── System instruction detection ─────────────────────────────

export const SYSTEM_TAG_RE = /^<[a-z][a-z-]+[\s>]/;
export const INVISIBLE_CHARS_RE = /[\u00a0\u200b\u200c\u200d\u2060\ufeff]/g;

export function getFirstText(content: TranscriptContent[]): string {
  const t = content.find(
    (c): c is { type: "text"; text: string } => c.type === "text",
  );
  return t?.text ?? "";
}

/** Tool results sent back to Claude — not the user's own words */
export function isProcessMessage(
  role: "user" | "assistant",
  content: TranscriptContent[],
): boolean {
  if (role !== "user") return false;
  return content.some((c) => c.type === "tool_result");
}

export function isSystemInstruction(
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

export function parseInstructionName(text: string): string {
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

/** Checks for any real printable content (handles &nbsp; and other whitespace-like chars) */
export function hasVisibleContent(s: string): boolean {
  return /\S/.test(s.replace(INVISIBLE_CHARS_RE, ""));
}

// ── Conversation turn grouping ───────────────────────────────

export interface ConversationTurn {
  input: TranscriptMessage;
  steps: TranscriptMessage[];
  output: TranscriptMessage | null;
  inputOriginalIdx: number;
  stepOriginalIndices: number[];
  outputOriginalIdx: number;
}

export function groupIntoTurns(messages: TranscriptMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  const promptIdxs: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (
      m != null &&
      m.role === "user" &&
      !isSystemInstruction(m.role, m.content) &&
      !isProcessMessage(m.role, m.content)
    ) {
      promptIdxs.push(i);
    }
  }

  for (let t = 0; t < promptIdxs.length; t++) {
    const start = promptIdxs[t];
    if (start == null) continue;
    const end =
      t + 1 < promptIdxs.length ? (promptIdxs[t + 1] ?? messages.length) : messages.length;
    const input = messages[start];
    if (input == null) continue;

    const betweenEntries: Array<{ msg: TranscriptMessage; origIdx: number }> =
      [];
    for (let i = start + 1; i < end; i++) {
      const m = messages[i];
      if (m != null && !isSystemInstruction(m.role, m.content)) {
        betweenEntries.push({ msg: m, origIdx: i });
      }
    }

    // Last assistant message WITH text content is the output.
    // Tool-use-only assistant messages are intermediate steps (still processing).
    let outputEntry: { msg: TranscriptMessage; origIdx: number } | null = null;
    for (let i = betweenEntries.length - 1; i >= 0; i--) {
      const entry = betweenEntries[i];
      if (entry != null && entry.msg.role === "assistant") {
        const hasText = entry.msg.content.some((c) => c.type === "text");
        if (hasText) {
          outputEntry = entry;
          break;
        }
      }
    }

    const stepEntries = betweenEntries.filter((e) => e !== outputEntry);

    turns.push({
      input,
      steps: stepEntries.map((e) => e.msg),
      output: outputEntry != null ? outputEntry.msg : null,
      inputOriginalIdx: start,
      stepOriginalIndices: stepEntries.map((e) => e.origIdx),
      outputOriginalIdx: outputEntry != null ? outputEntry.origIdx : -1,
    });
  }

  return turns;
}

// ── Tool result helpers ──────────────────────────────────────

/** Extract full text from tool result content. */
export function getResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        typeof c === "object" && c !== null && "text" in c
          ? (c as { text: string }).text
          : JSON.stringify(c),
      )
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(content, null, 2);
}

/** Extract a short single-line preview from tool result content. */
export function resultPreview(content: unknown): string {
  return getResultText(content).slice(0, 80).replace(/\n/g, " ");
}

/** Extract the most useful single parameter to display for a tool call. */
export function getToolKeyParam(name: string, input: Record<string, unknown>): string {
  // File-path based tools — show just the filename
  const filePath = input.file_path ?? input.path ?? input.notebook_path;
  if (typeof filePath === "string") {
    return filePath.split("/").pop() ?? filePath;
  }
  // Bash / shell — show command
  if (typeof input.command === "string") {
    return input.command.slice(0, 60).replace(/\n/g, " ");
  }
  // Search tools — show pattern
  if (typeof input.pattern === "string") {
    return input.pattern.slice(0, 60);
  }
  // Web tools — show URL
  if (typeof input.url === "string") {
    return input.url.slice(0, 60);
  }
  // Generic — first string value
  for (const v of Object.values(input)) {
    if (typeof v === "string" && v.trim()) return v.slice(0, 60).replace(/\n/g, " ");
  }
  return name;
}
