import path from "path";
import { readdir, stat } from "fs/promises";
import type {
  HistoryProject,
  HistorySession,
  HistorySessionDetail,
  TranscriptMessage,
  TranscriptContent,
  TokenUsage,
} from "../shared/types";
import { EMPTY_TOKENS } from "../shared/types";

const CLAUDE_DIR = path.join(process.env.HOME || "~", ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
// Resolve relative to this file at runtime
const HOOKS_INSTALL_SCRIPT = path.join(import.meta.dir, "../hooks/install.sh");

/**
 * Decode encoded project directory name back to a display path.
 * Claude Code encodes project paths by replacing / and _ with -,
 * with double-dash (--) representing /_ sequences.
 *
 * Example: -Users-john--Projects-my-app
 *       → /Users/john/_Projects/my-app
 */
function decodeProjectPath(encoded: string): string {
  let decoded = encoded;
  if (decoded.startsWith("-")) {
    decoded = "/" + decoded.slice(1);
  }
  decoded = decoded.replace(/--/g, "/_");
  decoded = decoded.replace(/-/g, "/");
  return decoded;
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
        fullPath: decodeProjectPath(entry),
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

      sessions.push({
        id: sessionId,
        projectId,
        filePath,
        messageCount,
        userTurns,
        tokens,
        model,
        lastModified: fstat.mtime.getTime(),
      });
    } catch {}
  }

  return sessions.sort((a, b) => b.lastModified - a.lastModified);
}

export async function readSession(filePath: string): Promise<HistorySessionDetail | null> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;

    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());

    const messages: TranscriptMessage[] = [];
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
            messages.push({ role: "user", content });
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
            messages.push({ role: "assistant", content, tokens: msgTokens, model: msgModel });
          }
        }
      } catch {}
    }

    const fstat = await stat(filePath);
    const projectId = path.basename(path.dirname(filePath));
    const sessionId = path.basename(filePath, ".jsonl");

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
    };
  } catch {
    return null;
  }
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
      if (it.type === "text" && typeof it.text === "string" && it.text.trim()) {
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
