import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ServerWebSocket } from "bun";
import { EventStore } from "./events";
import { TranscriptTokenReader } from "./transcript";
import { listProjects, listSessions, readSession, getHookStatus, installHooks } from "./history";

const app = new Hono();
const eventStore = new EventStore();
const transcriptReader = new TranscriptTokenReader();
const clients = new Set<ServerWebSocket<unknown>>();

const isProduction = process.env.NODE_ENV === "production";

app.use(
  "/*",
  cors(
    isProduction
      ? { origin: [`http://localhost:${process.env.PORT || 3200}`] }
      : { origin: "*" }
  )
);

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

    const broadcastEventPatch = (patched: ReturnType<typeof eventStore.patchEventData>) => {
      if (!patched) return;
      const msg = JSON.stringify({ type: "eventPatch", events: [patched] });
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
        // Attach response text to Stop events so the frontend can display it
        if (event.type === "Stop" && newData.latestResponse) {
          broadcastEventPatch(eventStore.patchEventData(event.id, { response_text: newData.latestResponse }));
        }
      }
    }

    // On Stop/SessionEnd, schedule delayed re-reads to catch final transcript entries
    // that may not have been flushed when the hook fired
    if (
      (event.type === "Stop" || event.type === "SessionEnd") &&
      transcriptPath &&
      typeof transcriptPath === "string"
    ) {
      const eventId = event.id;
      const sessionId = event.sessionId;
      const catchUp = async () => {
        const extra = await transcriptReader.readNewData(transcriptPath);
        if (extra) {
          eventStore.addTranscriptData(extra, sessionId);
          if (event.type === "Stop" && extra.latestResponse) {
            broadcastEventPatch(eventStore.patchEventData(eventId, { response_text: extra.latestResponse }));
          }
          broadcastStats();
        }
      };
      setTimeout(catchUp, 1000);
      setTimeout(catchUp, 3000);
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

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
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
      ws.send(snapshot);
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
