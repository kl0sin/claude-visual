import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ServerWebSocket } from "bun";
import { EventStore } from "./events";
import { TranscriptTokenReader } from "./transcript";
import { listProjects, listSessions, readSession, searchTranscripts, getHookStatus, installHooks, getProjectStats } from "./history";

const app = new Hono();
const eventStore = new EventStore();
const transcriptReader = new TranscriptTokenReader();
const clients = new Set<ServerWebSocket<unknown>>();

// Per-transcriptPath debounce timers for delayed transcript re-reads on Stop/SessionEnd.
// Prevents accumulation of fire-and-forget setTimeouts under high load.
const catchUpTimers = new Map<string, ReturnType<typeof setTimeout>>();

const isProduction = process.env.NODE_ENV === "production";

// Optional auth token — set CLAUDE_VISUAL_TOKEN env var to enable
const AUTH_TOKEN = process.env.CLAUDE_VISUAL_TOKEN || undefined;

// CORS: when AUTH_TOKEN is set allow any origin (token provides the security);
// otherwise use the existing local-only policy in production.
app.use(
  "/*",
  cors(
    AUTH_TOKEN
      ? { origin: "*", allowHeaders: ["Authorization", "Content-Type"] }
      : isProduction
        ? { origin: [`http://localhost:${process.env.PORT || 3200}`] }
        : { origin: "*" }
  )
);

// Auth middleware — skip /api/health and /api/info so connectivity can be tested
app.use("/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (!AUTH_TOKEN || path === "/api/health" || path === "/api/info") {
    return next();
  }
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (token !== AUTH_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

// Server info — no auth required (used by clients to probe a remote server)
app.get("/api/info", (c) => {
  return c.json({ name: "Claude Visual", version: "0.2.0", auth: !!AUTH_TOKEN });
});

// Receive events from Claude Code hooks
app.post("/api/events", async (c) => {
  try {
    const raw = await c.req.json();

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return c.json({ ok: false, error: "Expected a JSON object" }, 400);
    }

    const event = eventStore.add(raw);

    // Drain side-effects BEFORE any await so concurrent requests cannot steal
    // synthetic/adopted SubagentStart events produced by a different request.
    const sideEffects = eventStore.drainSideEffects();

    // Read token usage + model from transcript file (hooks don't include token data directly)
    const transcriptPath = raw.transcript_path;

    // Emit a synthetic event (Thinking / Output) and broadcast it immediately.
    // Pass as a raw-event-shaped object so eventStore.add() stores data correctly —
    // spreading data fields at the top level ensures event.data.thinking_text etc. survive a DB round-trip.
    const broadcastSynthetic = (type: string, data: Record<string, unknown>) => {
      const rawSynthetic: Record<string, unknown> = {
        event_type: type,
        session_id: event.sessionId,
        ...data,
      };
      const se = eventStore.add(rawSynthetic);
      const msg = JSON.stringify({ type: "event", data: se, stats: eventStore.getStats(), sessions: eventStore.getSessions() });
      for (const ws of clients) {
        try { ws.send(msg); } catch { clients.delete(ws); }
      }
    };

    const broadcastStats = () => {
      const msg = JSON.stringify({
        type: "stats",
        stats: eventStore.getStats(),
        sessions: eventStore.getSessions(),
      });
      for (const ws of clients) {
        try { ws.send(msg); } catch { clients.delete(ws); }
      }
    };

    if (transcriptPath && typeof transcriptPath === "string") {
      const newData = await transcriptReader.readNewData(transcriptPath);
      if (newData) {
        eventStore.addTranscriptData(newData, event.sessionId);

        // Emit Thinking synthetic event when new thinking content is detected
        if (newData.latestThinking) {
          broadcastSynthetic("Thinking", { thinking_text: newData.latestThinking });
        }

        // Emit Output synthetic event when new response text is detected
        if (newData.latestResponse) {
          broadcastSynthetic("Output", { output_text: newData.latestResponse });
        }
      }
    }

    // On Stop/SessionEnd, schedule a single debounced re-read to catch final transcript
    // entries that may not have been flushed when the hook fired.
    // Per-path debounce prevents timer accumulation under high load.
    if (
      (event.type === "Stop" || event.type === "SessionEnd") &&
      transcriptPath &&
      typeof transcriptPath === "string"
    ) {
      const sessionId = event.sessionId;
      const existing = catchUpTimers.get(transcriptPath);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(async () => {
        catchUpTimers.delete(transcriptPath);
        const extra = await transcriptReader.readNewData(transcriptPath);
        if (extra) {
          eventStore.addTranscriptData(extra, sessionId);
          if (extra.latestThinking) broadcastSynthetic("Thinking", { thinking_text: extra.latestThinking });
          if (extra.latestResponse) broadcastSynthetic("Output", { output_text: extra.latestResponse });
          broadcastStats();
        }
      }, 3000);
      catchUpTimers.set(transcriptPath, timer);
    }

    // Broadcast retroactively-fixed events (adopted/synthetic SubagentStart) first
    // so clients receive the start before the stop.
    if (sideEffects.length > 0) {
      const patchMsg = JSON.stringify({ type: "eventPatch", events: sideEffects });
      for (const ws of clients) {
        try { ws.send(patchMsg); } catch { clients.delete(ws); }
      }
    }

    const message = JSON.stringify({
      type: "event",
      data: event,
      stats: eventStore.getStats(),
      sessions: eventStore.getSessions(),
    });
    for (const ws of clients) {
      try {
        ws.send(message);
      } catch {
        clients.delete(ws);
      }
    }

    return c.json({ ok: true, id: event.id });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }
});

// Get all events (optionally filtered by session)
app.get("/api/events", (c) => {
  const sessionId = c.req.query("session") || undefined;
  return c.json(eventStore.getAll(sessionId));
});

// Get session stats (optionally filtered by session)
app.get("/api/stats", (c) => {
  const sessionId = c.req.query("session") || undefined;
  return c.json(eventStore.getStats(sessionId));
});

// List all sessions
app.get("/api/sessions", (c) => {
  return c.json(eventStore.getSessions());
});

// Clear all events
app.post("/api/clear", (c) => {
  eventStore.clear();
  transcriptReader.clear();
  const message = JSON.stringify({ type: "clear" });
  for (const ws of clients) {
    try {
      ws.send(message);
    } catch {
      clients.delete(ws);
    }
  }
  return c.json({ ok: true });
});

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "online", clients: clients.size });
});

// ── HISTORY BROWSER ────────────────────────────────────────

app.get("/api/history/projects", async (c) => {
  const projects = await listProjects();
  return c.json(projects);
});

app.get("/api/history/sessions", async (c) => {
  const projectId = c.req.query("project");
  if (!projectId) return c.json({ error: "Missing project parameter" }, 400);
  const sessions = await listSessions(projectId);
  return c.json(sessions);
});

app.get("/api/history/session", async (c) => {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "Missing path parameter" }, 400);
  const limitParam = Number(c.req.query("limit") || "300");
  const limit = isNaN(limitParam) || limitParam <= 0 ? 300 : limitParam;
  const detail = await readSession(filePath, limit);
  if (!detail) return c.json({ error: "Session not found" }, 404);
  return c.json(detail);
});

app.get("/api/history/stats", async (c) => {
  const projectId = c.req.query("project");
  if (!projectId) return c.json({ error: "project required" }, 400);
  const stats = await getProjectStats(projectId);
  if (!stats) return c.json({ error: "not found" }, 404);
  return c.json(stats);
});

app.get("/api/history/search", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const projectId = c.req.query("project") || undefined;
  if (q.length < 2) return c.json([]);
  const results = await searchTranscripts(q, projectId);
  return c.json(results);
});

// ── HOOKS STATUS / INSTALL ─────────────────────────────────

app.get("/api/hooks/status", async (c) => {
  const status = await getHookStatus();
  return c.json(status);
});

app.post("/api/hooks/install", async (c) => {
  const result = await installHooks();
  return c.json(result);
});

const PORT = Number(process.env.PORT) || 3200;

Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      // Optional token auth via query param (headers unavailable during WS upgrade)
      if (AUTH_TOKEN) {
        const token = url.searchParams.get("token") ?? "";
        if (token !== AUTH_TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }
      }
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // In production, serve static files from dist/
    if (isProduction && !url.pathname.startsWith("/api")) {
      const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(`./dist${filePath}`);
      if (await file.exists()) {
        return new Response(file);
      }
      // SPA fallback
      return new Response(Bun.file("./dist/index.html"));
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      // Send current state on connect
      const snapshot = JSON.stringify({
        type: "snapshot",
        events: eventStore.getAll(),
        stats: eventStore.getStats(),
        sessions: eventStore.getSessions(),
      });
      try { ws.send(snapshot); } catch { clients.delete(ws); return; }
      console.log(`\x1b[36m[NEURAL LINK]\x1b[0m Client connected (${clients.size} active)`);
    },
    close(ws) {
      clients.delete(ws);
      console.log(`\x1b[35m[NEURAL LINK]\x1b[0m Client disconnected (${clients.size} active)`);
    },
    message(_ws, _msg) {
      // Future: handle client commands
    },
  },
});

console.log(`
\x1b[36m╔══════════════════════════════════════════╗
║                                          ║
║   ▄████▄  ██▓    ▄▄▄      █    ██ ▓█████ ║
║  ▒██▀ ▀█ ▓██▒   ▒████▄    ██  ▓██▒▓█   ▀ ║
║  ▒▓█    ▄▒██░   ▒██  ▀█▄ ▓██  ▒██░▒███   ║
║  ▒▓▓▄ ▄██▒██░   ░██▄▄▄▄██▓▓█  ░██░▒▓█  ▄ ║
║  ▒ ▓███▀ ░██████▒▓█   ▓██▒▒█████▓ ░▒████▒║
║                                          ║
║  \x1b[35mVISUAL NEURAL MONITOR\x1b[36m                    ║
║                                          ║
╚══════════════════════════════════════════╝\x1b[0m

\x1b[36m▸ Server:\x1b[0m  http://localhost:${PORT}
\x1b[35m▸ WebSocket:\x1b[0m ws://localhost:${PORT}/ws
\x1b[33m▸ API:\x1b[0m      http://localhost:${PORT}/api/events
`);
