import path from "path";
import { readdir, stat } from "fs/promises";
import type {
  HistoryProject,
  HistorySession,
  HistorySessionDetail,
  TranscriptMessage,
  TranscriptContent,
  TokenUsage,
  SearchMatch,
  SearchResult,
  ProjectStats,
} from "../shared/types";
import { EMPTY_TOKENS } from "../shared/types";
import { resolveModelFamily, computeCost } from "../shared/tokens";

const CLAUDE_DIR = path.join(process.env.HOME || "~", ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
// Resolve relative to this file at runtime
const HOOKS_INSTALL_SCRIPT = path.join(import.meta.dir, "../hooks/install.sh");

/**
 * Naive decode — replaces all `-` with `/` and `--` with `/_`.
 * Incorrect for directory names containing literal hyphens, but used as
 * a fast-path guess and as fallback when filesystem lookup fails.
 */
function naiveDecodeProjectPath(encoded: string): string {
  let decoded = encoded;
  if (decoded.startsWith("-")) {
    decoded = "/" + decoded.slice(1);
  }
  decoded = decoded.replace(/--/g, "/_");
  decoded = decoded.replace(/-/g, "/");
  return decoded;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk `tokens[startIdx..]` greedily against the real filesystem, starting
 * at `basePath`.  Each path component is formed by joining one or more
 * consecutive tokens with literal hyphens until an existing directory is
 * found; the search backtracks when a branch leads nowhere.
 */
async function resolveSegmentTokens(
  tokens: string[],
  startIdx: number,
  basePath: string,
): Promise<string | null> {
  if (startIdx >= tokens.length) return basePath;

  for (let end = startIdx; end < tokens.length; end++) {
    const component = tokens.slice(startIdx, end + 1).join("-");
    const candidate = path.join(basePath, component);
    if (await dirExists(candidate)) {
      const result = await resolveSegmentTokens(tokens, end + 1, candidate);
      if (result !== null) return result;
    }
  }
  return null;
}

/**
 * Decode encoded project directory name back to a filesystem path.
 *
 * Claude Code encodes absolute paths by replacing `/_` → `--` and `/` → `-`.
 * A literal `-` in a directory name is indistinguishable from a `/` separator
 * in the encoded form, so this function verifies candidates against the real
 * filesystem and backtracks when a candidate does not exist.
 *
 * Fast path: if the naively-decoded path exists, return it immediately.
 * Slow path: split on `--` (definite `/_` boundaries), then for each segment
 *            walk the filesystem to find which hyphens are separators vs literals.
 *
 * Falls back to the naive decode if traversal yields no result (e.g. project
 * directory was deleted).
 *
 * Example: -Users-john--Projects-my-app  →  /Users/john/_Projects/my-app
 */
export async function decodeProjectPath(encoded: string): Promise<string> {
  const naive = naiveDecodeProjectPath(encoded);
  if (await dirExists(naive)) return naive;

  // Split on -- (each occurrence is a definite /_ boundary in the original path)
  const parts = encoded.split("--");
  let currentPath = "";
  let segIdx = 0;

  for (const part of parts) {
    if (segIdx === 0) {
      // First segment starts with "-" which represents the leading "/"
      const tokenStr = part.startsWith("-") ? part.slice(1) : part;
      const tokens = tokenStr.split("-").filter(Boolean);
      if (tokens.length === 0) {
        currentPath = "/";
      } else {
        const resolved = await resolveSegmentTokens(tokens, 0, "/");
        if (!resolved) return naive;
        currentPath = resolved;
      }
    } else {
      // Subsequent segments come after "--" which encoded "/_".
      // The underscore is the implicit prefix of the first directory in this segment.
      const tokens = part.split("-").filter(Boolean);
      if (tokens.length > 0) {
        tokens[0] = "_" + tokens[0];
        const resolved = await resolveSegmentTokens(tokens, 0, currentPath);
        if (!resolved) return naive;
        currentPath = resolved;
      }
    }
    segIdx++;
  }

  return currentPath || naive;
}

function projectDisplayName(encoded: string): string {
  const home = process.env.HOME || "";
  let rel = encoded;

  // Strip the encoded home prefix first.
  // Home `/home/user` encodes to `-home-user`, so we apply the same encoding to strip it.
  if (home) {
    const homeEncoded = home.replace(/\/_/g, "--").replace(/\//g, "-");
    if (rel.startsWith(homeEncoded)) {
      rel = rel.slice(homeEncoded.length);
    }
  }

  // `rel` is now the path relative to home in encoded form, e.g.:
  //   `--Projects-claude-visual`  →  ~/_Projects/claude-visual
  //   `-my-project`               →  ~/my-project
  //   `-work-my-project`          →  ~/work/my-project
  //
  // Strategy: find the last `--` (which encodes `/_`), take everything after it,
  // then skip the leading underscore-directory name (up to the first `-`) to get
  // the actual project leaf name — preserving hyphens in the name.
  const lastDouble = rel.lastIndexOf("--");
  if (lastDouble >= 0) {
    const afterUnderscore = rel.slice(lastDouble + 2); // e.g. `Projects-claude-visual`
    const sep = afterUnderscore.indexOf("-");
    if (sep >= 0) {
      const name = afterUnderscore.slice(sep + 1); // `claude-visual`
      if (name) return name;
    }
    return afterUnderscore;
  }

  // No `--` — project is directly under home (or a non-underscore subdir).
  // Take everything after the first `-` (which encoded the `/` separator).
  const first = rel.indexOf("-");
  if (first >= 0) {
    const name = rel.slice(first + 1); // `my-project`
    if (name) return name;
  }

  return rel || encoded;
}

export async function listProjects(): Promise<HistoryProject[]> {
  let entries: string[];
  try {
    entries = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }

  const projects: HistoryProject[] = [];

  for (const entry of entries) {
    const entryPath = path.join(PROJECTS_DIR, entry);
    try {
      const info = await stat(entryPath);
      if (!info.isDirectory()) continue;

      const files = await readdir(entryPath).catch(() => [] as string[]);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
      if (jsonlFiles.length === 0) continue;

      let lastActivity: number | undefined;
      for (const f of jsonlFiles) {
        try {
          const fstat = await stat(path.join(entryPath, f));
          const mtime = fstat.mtime.getTime();
          if (!lastActivity || mtime > lastActivity) lastActivity = mtime;
        } catch {}
      }

      projects.push({
        id: entry,
        name: projectDisplayName(entry),
        fullPath: await decodeProjectPath(entry),
        sessionCount: jsonlFiles.length,
        lastActivity,
      });
    } catch {}
  }

  return projects.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
}

export async function listSessions(projectId: string): Promise<HistorySession[]> {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  let files: string[];
  try {
    files = await readdir(projectDir);
  } catch {
    return [];
  }

  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
  const sessions: HistorySession[] = [];

  for (const file of jsonlFiles) {
    const filePath = path.join(projectDir, file);
    try {
      const fstat = await stat(filePath);
      const sessionId = file.replace(".jsonl", "");

      const bunFile = Bun.file(filePath);
      const text = await bunFile.text();
      const lines = text.split("\n").filter((l) => l.trim());

      let messageCount = 0;
      let userTurns = 0;
      const tokens: TokenUsage = { ...EMPTY_TOKENS };
      let model: string | undefined;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          messageCount++;
          if (entry.type === "user") {
            userTurns++;
          } else if (entry.type === "assistant" && entry.message?.usage) {
            const u = entry.message.usage;
            const input = u.input_tokens || 0;
            const output = u.output_tokens || 0;
            const cc = u.cache_creation_input_tokens || 0;
            const cr = u.cache_read_input_tokens || 0;
            tokens.inputTokens += input;
            tokens.outputTokens += output;
            tokens.cacheCreationTokens += cc;
            tokens.cacheReadTokens += cr;
            tokens.totalTokens += input + output + cc + cr;
            if (entry.message.model) model = entry.message.model;
          }
        } catch {}
      }

      const snippet = extractFirstUserSnippet(lines);

      sessions.push({
        id: sessionId,
        projectId,
        filePath,
        messageCount,
        userTurns,
        tokens,
        model,
        lastModified: fstat.mtime.getTime(),
        snippet,
      });
    } catch {}
  }

  return sessions.sort((a, b) => b.lastModified - a.lastModified);
}

export async function readSession(
  filePath: string,
  limit = 300,
): Promise<HistorySessionDetail | null> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;

    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());

    const allMessages: TranscriptMessage[] = [];
    const totalTokens: TokenUsage = { ...EMPTY_TOKENS };
    let model: string | undefined;
    let messageCount = 0;
    let userTurns = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        messageCount++;

        if (entry.type === "user") {
          userTurns++;
          const content = parseContent(entry.message?.content);
          if (content.length > 0) {
            allMessages.push({ role: "user", content, timestamp: entry.timestamp });
          }
        } else if (entry.type === "assistant") {
          const msgModel = entry.message?.model;
          if (msgModel) model = msgModel;

          let msgTokens: TokenUsage | undefined;
          if (entry.message?.usage) {
            const u = entry.message.usage;
            const input = u.input_tokens || 0;
            const output = u.output_tokens || 0;
            const cc = u.cache_creation_input_tokens || 0;
            const cr = u.cache_read_input_tokens || 0;
            msgTokens = {
              inputTokens: input,
              outputTokens: output,
              cacheCreationTokens: cc,
              cacheReadTokens: cr,
              totalTokens: input + output + cc + cr,
            };
            totalTokens.inputTokens += input;
            totalTokens.outputTokens += output;
            totalTokens.cacheCreationTokens += cc;
            totalTokens.cacheReadTokens += cr;
            totalTokens.totalTokens += input + output + cc + cr;
          }

          const content = parseContent(entry.message?.content);
          if (content.length > 0) {
            allMessages.push({
              role: "assistant",
              content,
              tokens: msgTokens,
              model: msgModel,
              timestamp: entry.timestamp,
            });
          }
        }
      } catch {}
    }

    const fstat = await stat(filePath);
    const projectId = path.basename(path.dirname(filePath));
    const sessionId = path.basename(filePath, ".jsonl");

    const totalMessages = allMessages.length;
    const clampedLimit = limit > 0 ? limit : totalMessages;
    const offset = totalMessages > clampedLimit ? totalMessages - clampedLimit : 0;
    const messages = offset > 0 ? allMessages.slice(offset) : allMessages;

    return {
      session: {
        id: sessionId,
        projectId,
        filePath,
        messageCount,
        userTurns,
        tokens: totalTokens,
        model,
        lastModified: fstat.mtime.getTime(),
      },
      messages,
      totalMessages,
      offset,
    };
  } catch {
    return null;
  }
}

/** Mirror of frontend isSystemInstruction — skips injected context */
function isSystemText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith("---\n") || t.startsWith("---\r\n")) return true;
  if (/^<[a-z][a-z-]+[\s>]/.test(t)) return true;
  if (t.startsWith("# ") && t.length > 500) return true;
  const lines = t.split("\n").filter((l) => l.trim());
  if (lines.length <= 3 && t.endsWith(":") && t.includes("`")) return true;
  return false;
}

/** Extract first real user-typed message text from parsed JSONL lines */
function extractFirstUserSnippet(lines: string[]): string | undefined {
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type !== "user") continue;
      const content = parseContent(entry.message?.content);
      if (content.some((c) => c.type === "tool_result")) continue;
      const textBlock = content.find((c): c is { type: "text"; text: string } => c.type === "text");
      if (!textBlock) continue;
      const text = textBlock.text.trim();
      if (!text || isSystemText(text)) continue;
      return text.slice(0, 160).replace(/\s+/g, " ");
    } catch {}
  }
  return undefined;
}

function parseContent(raw: unknown): TranscriptContent[] {
  if (!raw) return [];

  if (typeof raw === "string") {
    return raw.trim() ? [{ type: "text", text: raw }] : [];
  }

  if (Array.isArray(raw)) {
    const result: TranscriptContent[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      if (it.type === "thinking" && typeof it.thinking === "string" && it.thinking.trim()) {
        result.push({ type: "thinking", thinking: it.thinking });
      } else if (it.type === "redacted_thinking" && typeof it.data === "string") {
        result.push({ type: "redacted_thinking", data: it.data });
      } else if (it.type === "text" && typeof it.text === "string" && it.text.trim()) {
        result.push({ type: "text", text: it.text });
      } else if (it.type === "tool_use") {
        result.push({
          type: "tool_use",
          id: String(it.id || ""),
          name: String(it.name || ""),
          input: (it.input as Record<string, unknown>) || {},
        });
      } else if (it.type === "tool_result") {
        result.push({
          type: "tool_result",
          tool_use_id: String(it.tool_use_id || ""),
          content: it.content,
          is_error: Boolean(it.is_error),
        });
      }
    }
    return result;
  }

  return [];
}

function extractSnippet(
  text: string,
  matchIndex: number,
  queryLen: number,
  role: "user" | "assistant",
  messageIndex: number,
): SearchMatch {
  const HALF = 100;
  const start = Math.max(0, matchIndex - HALF);
  const end = Math.min(text.length, matchIndex + queryLen + HALF);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const snippet = prefix + text.slice(start, end) + suffix;
  return {
    role,
    snippet,
    matchOffset: matchIndex - start + prefix.length,
    matchLength: queryLen,
    messageIndex,
  };
}

export async function searchTranscripts(
  query: string,
  projectId?: string,
  maxMatchesPerSession = 3,
  maxSessions = 50,
): Promise<SearchResult[]> {
  const queryLow = query.toLowerCase();
  const allProjects = await listProjects();
  const targetProjects = projectId ? allProjects.filter((p) => p.id === projectId) : allProjects;

  const results: SearchResult[] = [];

  for (const project of targetProjects) {
    const projectDir = path.join(PROJECTS_DIR, project.id);
    let files: string[];
    try {
      files = await readdir(projectDir);
    } catch {
      continue;
    }

    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    for (const file of jsonlFiles) {
      const filePath = path.join(projectDir, file);
      let text: string;
      try {
        text = await Bun.file(filePath).text();
      } catch {
        continue;
      }

      const lines = text.split("\n").filter((l) => l.trim());
      const matches: SearchMatch[] = [];
      let msgIdx = 0;

      outer: for (const line of lines) {
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        const role: "user" | "assistant" | undefined =
          entry.type === "user" ? "user" : entry.type === "assistant" ? "assistant" : undefined;
        if (!role) continue;

        // Use parseContent() — same function as readSession() — to decide whether
        // this entry would be pushed to allMessages and what index it would get.
        // Skipping here (instead of after msgIdx++) keeps msgIdx in sync with allMessages.
        const parsedContent = parseContent((entry as any).message?.content);
        if (parsedContent.length === 0) continue;

        const curIdx = msgIdx++;

        // Only search text blocks for better signal
        const textBlocks = parsedContent
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text);

        for (const blockText of textBlocks) {
          const idx = blockText.toLowerCase().indexOf(queryLow);
          if (idx === -1) continue;
          matches.push(extractSnippet(blockText, idx, query.length, role, curIdx));
          if (matches.length >= maxMatchesPerSession) break outer;
        }
      }

      if (matches.length === 0) continue;

      // Build a lightweight HistorySession
      let fstat: Awaited<ReturnType<typeof stat>>;
      try {
        fstat = await stat(filePath);
      } catch {
        continue;
      }

      const sessionId = file.replace(".jsonl", "");
      let messageCount = 0;
      let userTurns = 0;
      const tokens: TokenUsage = { ...EMPTY_TOKENS };
      let model: string | undefined;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          messageCount++;
          if (entry.type === "user") {
            userTurns++;
          } else if (entry.type === "assistant" && entry.message?.usage) {
            const u = entry.message.usage;
            const input = u.input_tokens || 0;
            const output = u.output_tokens || 0;
            const cc = u.cache_creation_input_tokens || 0;
            const cr = u.cache_read_input_tokens || 0;
            tokens.inputTokens += input;
            tokens.outputTokens += output;
            tokens.cacheCreationTokens += cc;
            tokens.cacheReadTokens += cr;
            tokens.totalTokens += input + output + cc + cr;
            if (entry.message.model) model = entry.message.model;
          }
        } catch {}
      }

      const session: HistorySession = {
        id: sessionId,
        projectId: project.id,
        filePath,
        messageCount,
        userTurns,
        tokens,
        model,
        lastModified: fstat.mtime.getTime(),
      };

      results.push({
        session,
        projectId: project.id,
        projectName: project.name,
        matches,
      });

      if (results.length >= maxSessions) break;
    }

    if (results.length >= maxSessions) break;
  }

  return results.sort((a, b) => b.session.lastModified - a.session.lastModified);
}

export async function getHookStatus(): Promise<{ installed: boolean }> {
  try {
    const file = Bun.file(SETTINGS_FILE);
    if (!(await file.exists())) return { installed: false };

    const text = await file.text();
    const settings = JSON.parse(text);
    const hooksStr = JSON.stringify(settings.hooks || {});
    const installed = hooksStr.includes("localhost:3200/api/events");
    return { installed };
  } catch {
    return { installed: false };
  }
}

export async function installHooks(): Promise<{ ok: boolean; error?: string }> {
  try {
    const proc = Bun.spawn(["bash", HOOKS_INSTALL_SCRIPT], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { ok: false, error: stderr };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ── HISTORICAL STATISTICS ────────────────────────────────────

async function countToolsFromFile(filePath: string, counts: Map<string, number>): Promise<void> {
  let text: string;
  try {
    text = await Bun.file(filePath).text();
  } catch {
    return;
  }

  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.includes('"tool_use"')) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const content = (entry as any).message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use" && typeof block.name === "string") {
        counts.set(block.name, (counts.get(block.name) || 0) + 1);
      }
    }
  }
}

function toDateString(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function getProjectStats(projectId: string): Promise<ProjectStats | null> {
  const sessions = await listSessions(projectId);
  if (sessions.length === 0) return null;

  const totalTokens: TokenUsage = { ...EMPTY_TOKENS };
  let totalCost = 0;

  const modelMap = new Map<string, { sessions: number; cost: number }>();
  const dayMap = new Map<string, { count: number; tokens: number; cost: number }>();

  // Pass 1 — aggregate from session metadata
  for (const s of sessions) {
    const cost = computeCost(s.tokens, s.model);

    totalCost += cost;
    totalTokens.inputTokens += s.tokens.inputTokens;
    totalTokens.outputTokens += s.tokens.outputTokens;
    totalTokens.cacheCreationTokens += s.tokens.cacheCreationTokens;
    totalTokens.cacheReadTokens += s.tokens.cacheReadTokens;
    totalTokens.totalTokens += s.tokens.totalTokens;

    if (s.model) {
      const modelKey = resolveModelFamily(s.model);
      const modelEntry = modelMap.get(modelKey) || { sessions: 0, cost: 0 };
      modelEntry.sessions++;
      modelEntry.cost += cost;
      modelMap.set(modelKey, modelEntry);
    }

    const day = toDateString(s.lastModified);
    const dayEntry = dayMap.get(day) || { count: 0, tokens: 0, cost: 0 };
    dayEntry.count++;
    dayEntry.tokens += s.tokens.totalTokens;
    dayEntry.cost += cost;
    dayMap.set(day, dayEntry);
  }

  // Pass 2 — scan JSONL for tool counts
  const toolCountMap = new Map<string, number>();
  for (const s of sessions) {
    await countToolsFromFile(s.filePath, toolCountMap);
  }

  // Build sessionsByDay: 30 days from today-29 to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sessionsByDay = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today.getTime() - (29 - i) * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = dayMap.get(dateStr);
    return {
      date: dateStr,
      count: entry?.count || 0,
      tokens: entry?.tokens || 0,
      cost: entry?.cost || 0,
    };
  });

  const modelBreakdown = Array.from(modelMap.entries())
    .map(([model, v]) => ({ model, sessions: v.sessions, cost: v.cost }))
    .sort((a, b) => b.cost - a.cost);

  const toolCounts = Array.from(toolCountMap.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const n = sessions.length;
  return {
    projectId,
    totalSessions: n,
    totalTokens,
    totalCost,
    avgCostPerSession: n > 0 ? totalCost / n : 0,
    avgTokensPerSession: n > 0 ? totalTokens.totalTokens / n : 0,
    modelBreakdown,
    sessionsByDay,
    toolCounts,
  };
}
