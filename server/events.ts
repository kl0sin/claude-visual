import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import path from "path";
import type {
  ClaudeEvent,
  AgentProcess,
  TokenUsage,
  SessionInfo,
  SessionStats,
  PendingTool,
} from "../shared/types";
import { EMPTY_TOKENS } from "../shared/types";
import type { TranscriptData } from "./transcript";
import { initSchema } from "./db/schema";
import { rowToEvent, tokenRowToUsage } from "./db/types";
import type { DbEvent, DbSession, DbAgent, DbTokenRow } from "./db/types";

export type { ClaudeEvent, AgentProcess, TokenUsage, SessionInfo, SessionStats };

const DB_PATH =
  process.env.CLAUDE_VISUAL_DB ??
  path.join(process.env.HOME ?? "~", ".claude", "claude-visual.db");

export const MAX_EVENTS = parseInt(process.env.MAX_EVENTS ?? "2000", 10);

export class EventStore {
  private db: Database;

  // Hot caches — rebuilt from DB on startup, kept in sync on every write.
  // Used for O(1) lookups in add() and for getSessions() / getStats() outputs.
  private agents: Map<string, AgentProcess> = new Map();
  private sessions: Map<string, SessionInfo> = new Map();

  // Purely transient — no persistence needed across restarts.
  private pendingTools: Map<string, PendingTool[]> = new Map();
  private sideEffects: ClaudeEvent[] = [];
  private idCounter = 0;

  // Prepared statements for the hot path (called on every incoming event)
  private stmtInsertEvent!: ReturnType<Database["prepare"]>;
  private stmtUpsertSession!: ReturnType<Database["prepare"]>;
  private stmtUpsertAgent!: ReturnType<Database["prepare"]>;
  private stmtUpsertTokens!: ReturnType<Database["prepare"]>;

  constructor() {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    // WAL mode: concurrent reads don't block writes; better crash resilience
    this.db.query("PRAGMA journal_mode = WAL").run();
    this.db.query("PRAGMA synchronous = NORMAL").run();
    initSchema(this.db);
    this._prepareStatements();
    this._loadWarmState();
    console.log(`\x1b[36m[DB]\x1b[0m  SQLite: ${DB_PATH}`);
  }

  // ── Prepared statements ──────────────────────────────────────────────────

  private _prepareStatements(): void {
    this.stmtInsertEvent = this.db.prepare(`
      INSERT OR REPLACE INTO events
        (id, type, timestamp, session_id, tool_name, agent_type, duration, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtUpsertSession = this.db.prepare(`
      INSERT INTO sessions (id, first_event, last_event, event_count, status, is_processing, cwd)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_event    = excluded.last_event,
        event_count   = excluded.event_count,
        status        = excluded.status,
        is_processing = excluded.is_processing,
        cwd           = COALESCE(excluded.cwd, cwd)
    `);

    this.stmtUpsertAgent = this.db.prepare(`
      INSERT INTO agents (id, type, description, start_time, end_time, status, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type        = excluded.type,
        description = excluded.description,
        end_time    = excluded.end_time,
        status      = excluded.status,
        session_id  = excluded.session_id
    `);

    this.stmtUpsertTokens = this.db.prepare(`
      INSERT INTO session_tokens
        (session_id, model, input_tokens, output_tokens,
         cache_creation_tokens, cache_read_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        model                 = COALESCE(excluded.model, model),
        input_tokens          = input_tokens          + excluded.input_tokens,
        output_tokens         = output_tokens         + excluded.output_tokens,
        cache_creation_tokens = cache_creation_tokens + excluded.cache_creation_tokens,
        cache_read_tokens     = cache_read_tokens     + excluded.cache_read_tokens,
        total_tokens          = total_tokens          + excluded.total_tokens
    `);
  }

  // ── Startup warm-load ────────────────────────────────────────────────────

  private _loadWarmState(): void {
    // Restore ID counter from the highest evt_N in the DB
    const maxRow = this.db
      .query(`SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS n
              FROM events WHERE id LIKE 'evt_%'`)
      .get() as { n: number | null };
    this.idCounter = maxRow?.n ?? 0;

    // Rebuild sessions map
    for (const r of this.db.query("SELECT * FROM sessions").all() as DbSession[]) {
      this.sessions.set(r.id, {
        id: r.id,
        firstEvent: r.first_event,
        lastEvent: r.last_event,
        eventCount: r.event_count,
        status: r.status as "active" | "ended",
        isProcessing: r.is_processing === 1,
        cwd: r.cwd ?? undefined,
      });
    }

    // Rebuild agents map
    for (const r of this.db.query("SELECT * FROM agents").all() as DbAgent[]) {
      this.agents.set(r.id, {
        id: r.id,
        type: r.type,
        description: r.description ?? undefined,
        startTime: r.start_time,
        endTime: r.end_time ?? undefined,
        status: r.status as "active" | "completed",
        sessionId: r.session_id ?? undefined,
      });
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  add(raw: Record<string, any>): ClaudeEvent {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid event: expected an object");
    }

    const eventType: string = raw.event_type ?? raw.type ?? "unknown";
    const sessionId: string | undefined = raw.session_id || undefined;
    const agentType: string | undefined =
      raw.agent_type || raw.subagent_type || raw.tool_input?.subagent_type || undefined;

    const event: ClaudeEvent = {
      id: `evt_${++this.idCounter}`,
      type: eventType,
      timestamp: Date.now(),
      data: raw,
      toolName: raw.tool_name,
      agentType,
      sessionId,
    };

    // ── Session tracking ──────────────────────────────────────────────────
    if (sessionId) {
      const existing = this.sessions.get(sessionId);
      if (existing) {
        existing.lastEvent = event.timestamp;
        existing.eventCount++;
        if (eventType === "SessionEnd") {
          existing.status = "ended";
          existing.isProcessing = false;
        } else if (eventType === "UserPromptSubmit") {
          existing.isProcessing = true;
        } else if (eventType === "Stop") {
          existing.isProcessing = false;
        }
        if (!existing.cwd && typeof raw.cwd === "string") {
          existing.cwd = raw.cwd;
        }
        this._persistSession(existing);
      } else {
        const s: SessionInfo = {
          id: sessionId,
          firstEvent: event.timestamp,
          lastEvent: event.timestamp,
          eventCount: 1,
          status: eventType === "SessionEnd" ? "ended" : "active",
          isProcessing: eventType === "UserPromptSubmit",
          cwd: typeof raw.cwd === "string" ? raw.cwd : undefined,
        };
        this.sessions.set(sessionId, s);
        this._persistSession(s);
      }
    } else if (eventType === "SessionEnd") {
      // Assign to most recent active session
      let latest: SessionInfo | null = null;
      for (const s of this.sessions.values()) {
        if (s.status === "active" && (!latest || s.lastEvent > latest.lastEvent)) {
          latest = s;
        }
      }
      if (latest) {
        latest.status = "ended";
        latest.isProcessing = false;
        latest.lastEvent = event.timestamp;
        latest.eventCount++;
        event.sessionId = latest.id;
        this._persistSession(latest);
      }
    }

    // ── Agent lifecycle ───────────────────────────────────────────────────
    if (eventType === "SubagentStart") {
      const agentId: string = raw.agent_id ?? `agent_${this.idCounter}`;
      const description: string | undefined =
        raw.description ?? raw.tool_input?.description ?? undefined;
      const agent: AgentProcess = {
        id: agentId,
        type: agentType ?? "unknown",
        description,
        startTime: event.timestamp,
        status: "active",
        sessionId: event.sessionId,
      };
      this.agents.set(agentId, agent);
      this._persistAgent(agent);

    } else if (eventType === "SubagentStop") {
      const agentId: string | undefined = raw.agent_id;
      const agent = agentId ? this.agents.get(agentId) : undefined;

      if (agent) {
        agent.endTime = event.timestamp;
        agent.status = "completed";
        if (agent.type === "unknown" && agentType) agent.type = agentType;
        if (!agent.description && raw.description) agent.description = raw.description;
        event.duration = agent.endTime - agent.startTime;
        this._persistAgent(agent);
      } else if (agentId) {
        const newAgent: AgentProcess = {
          id: agentId,
          type: agentType ?? "unknown",
          description: raw.description ?? undefined,
          startTime: event.timestamp,
          endTime: event.timestamp,
          status: "completed",
          sessionId: event.sessionId,
        };
        this.agents.set(agentId, newAgent);
        this._persistAgent(newAgent);
      }

      // Ensure every SubagentStop has a visible SubagentStart in the same session
      const sid = event.sessionId;
      if (sid) {
        const hasStart = !!(
          this.db
            .query(
              "SELECT 1 FROM events WHERE type = 'SubagentStart' AND session_id = ? LIMIT 1"
            )
            .get(sid)
        );
        if (!hasStart) this._adoptOrSynthSubagentStart(event, sid);
      }

    } else if (eventType === "SessionEnd" && sessionId) {
      // Complete any active agents that were started in this session.
      // Covers agents emitted by the SessionStart hook (agent_type "session") which
      // never receive a SubagentStop because nothing above them issues one.
      for (const agent of this.agents.values()) {
        if (agent.sessionId === sessionId && agent.status === "active") {
          agent.endTime = event.timestamp;
          agent.status = "completed";
          event.duration = agent.endTime - agent.startTime;
          this._persistAgent(agent);
        }
      }
    }

    // ── Pending tool tracking (transient) ────────────────────────────────
    const pendingKey = event.sessionId ?? "";
    if (eventType === "PreToolUse" && raw.tool_name) {
      const pending = this.pendingTools.get(pendingKey) ?? [];
      pending.push({ tool: raw.tool_name as string, since: event.timestamp });
      this.pendingTools.set(pendingKey, pending);
    } else if (
      (eventType === "PostToolUse" || eventType === "PostToolUseFailure") &&
      raw.tool_name
    ) {
      const pending = this.pendingTools.get(pendingKey);
      if (pending) {
        const idx = pending.findIndex((p) => p.tool === raw.tool_name);
        if (idx >= 0) {
          event.duration = event.timestamp - pending[idx]!.since;
          pending.splice(idx, 1);
        }
        if (pending.length === 0) this.pendingTools.delete(pendingKey);
      }
    } else if (eventType === "Stop" || eventType === "SessionEnd") {
      this.pendingTools.delete(pendingKey);
    }

    // ── Persist event ────────────────────────────────────────────────────
    this._persistEvent(event);

    return event;
  }

  addTranscriptData(data: TranscriptData, sessionId?: string): void {
    const sid = sessionId ?? "__global__";
    const u = data.tokens;
    this.stmtUpsertTokens.run(
      sid,
      data.model ?? null,
      u.inputTokens,
      u.outputTokens,
      u.cacheCreationTokens,
      u.cacheReadTokens,
      u.totalTokens,
    );
  }

  /** Returns up to MAX_EVENTS most recent events (optionally filtered by session). */
  getAll(sessionId?: string): ClaudeEvent[] {
    const rows = (
      sessionId
        ? this.db
            .query(
              `SELECT * FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT ${MAX_EVENTS}`
            )
            .all(sessionId)
        : this.db
            .query(`SELECT * FROM events ORDER BY timestamp DESC LIMIT ${MAX_EVENTS}`)
            .all()
    ) as DbEvent[];
    // Reverse so chronological order is preserved in the returned array
    return rows.reverse().map((r) => rowToEvent(r));
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.lastEvent - a.lastEvent
    );
  }

  getStats(sessionId?: string): SessionStats {
    // All aggregation runs in SQLite — efficient even for large databases.

    const typeCountRows = (
      sessionId
        ? this.db
            .query(
              "SELECT type, COUNT(*) as cnt FROM events WHERE session_id = ? GROUP BY type"
            )
            .all(sessionId)
        : this.db
            .query("SELECT type, COUNT(*) as cnt FROM events GROUP BY type")
            .all()
    ) as Array<{ type: string; cnt: number }>;

    const toolCountRows = (
      sessionId
        ? this.db
            .query(
              "SELECT tool_name, COUNT(*) as cnt FROM events WHERE session_id = ? AND tool_name IS NOT NULL GROUP BY tool_name"
            )
            .all(sessionId)
        : this.db
            .query(
              "SELECT tool_name, COUNT(*) as cnt FROM events WHERE tool_name IS NOT NULL GROUP BY tool_name"
            )
            .all()
    ) as Array<{ tool_name: string; cnt: number }>;

    const toolFailRows = (
      sessionId
        ? this.db
            .query(
              "SELECT tool_name, COUNT(*) as cnt FROM events WHERE session_id = ? AND type = 'PostToolUseFailure' AND tool_name IS NOT NULL GROUP BY tool_name"
            )
            .all(sessionId)
        : this.db
            .query(
              "SELECT tool_name, COUNT(*) as cnt FROM events WHERE type = 'PostToolUseFailure' AND tool_name IS NOT NULL GROUP BY tool_name"
            )
            .all()
    ) as Array<{ tool_name: string; cnt: number }>;

    const agentCountRows = (
      sessionId
        ? this.db
            .query(
              "SELECT agent_type, COUNT(*) as cnt FROM events WHERE session_id = ? AND agent_type IS NOT NULL GROUP BY agent_type"
            )
            .all(sessionId)
        : this.db
            .query(
              "SELECT agent_type, COUNT(*) as cnt FROM events WHERE agent_type IS NOT NULL GROUP BY agent_type"
            )
            .all()
    ) as Array<{ agent_type: string; cnt: number }>;

    const totalRow = (
      sessionId
        ? this.db
            .query("SELECT COUNT(*) as total FROM events WHERE session_id = ?")
            .get(sessionId)
        : this.db.query("SELECT COUNT(*) as total FROM events").get()
    ) as { total: number } | null;

    const tsRow = (
      sessionId
        ? this.db
            .query(
              "SELECT MIN(timestamp) as first, MAX(timestamp) as last FROM events WHERE session_id = ?"
            )
            .get(sessionId)
        : this.db
            .query(
              "SELECT MIN(timestamp) as first, MAX(timestamp) as last FROM events"
            )
            .get()
    ) as { first: number | null; last: number | null } | null;

    // ── Build result maps ─────────────────────────────────────────────────

    const eventTypeCounts: Record<string, number> = {};
    for (const r of typeCountRows) eventTypeCounts[r.type] = r.cnt;

    const toolCounts: Record<string, number> = {};
    for (const r of toolCountRows) toolCounts[r.tool_name] = r.cnt;

    const toolFailCounts: Record<string, number> = {};
    for (const r of toolFailRows) toolFailCounts[r.tool_name] = r.cnt;

    const agentCounts: Record<string, number> = {};
    for (const r of agentCountRows) agentCounts[r.agent_type] = r.cnt;

    // ── Tokens ───────────────────────────────────────────────────────────

    let tokens: TokenUsage;
    if (sessionId) {
      const r = this.db
        .query("SELECT * FROM session_tokens WHERE session_id = ?")
        .get(sessionId) as DbTokenRow | null;
      tokens = r ? tokenRowToUsage(r) : { ...EMPTY_TOKENS };
    } else {
      const r = this.db
        .query(`
          SELECT
            SUM(input_tokens)          AS i,
            SUM(output_tokens)         AS o,
            SUM(cache_creation_tokens) AS cc,
            SUM(cache_read_tokens)     AS cr,
            SUM(total_tokens)          AS t
          FROM session_tokens
          WHERE session_id != '__global__'
            OR session_id IS NULL
        `)
        .get() as { i: number | null; o: number | null; cc: number | null; cr: number | null; t: number | null } | null;
      // Also include __global__ bucket
      const g = this.db
        .query("SELECT * FROM session_tokens WHERE session_id = '__global__'")
        .get() as DbTokenRow | null;
      tokens = {
        inputTokens: (r?.i ?? 0) + (g?.input_tokens ?? 0),
        outputTokens: (r?.o ?? 0) + (g?.output_tokens ?? 0),
        cacheCreationTokens: (r?.cc ?? 0) + (g?.cache_creation_tokens ?? 0),
        cacheReadTokens: (r?.cr ?? 0) + (g?.cache_read_tokens ?? 0),
        totalTokens: (r?.t ?? 0) + (g?.total_tokens ?? 0),
      };
    }

    // ── Model ─────────────────────────────────────────────────────────────

    const modelRow = (
      sessionId
        ? this.db
            .query(
              "SELECT model FROM session_tokens WHERE session_id = ? AND model IS NOT NULL"
            )
            .get(sessionId)
        : this.db
            .query(
              "SELECT model FROM session_tokens WHERE model IS NOT NULL ORDER BY rowid DESC LIMIT 1"
            )
            .get()
    ) as { model: string } | null;

    // ── Agents + pending tools ────────────────────────────────────────────

    const agents = sessionId
      ? Array.from(this.agents.values()).filter((a) => a.sessionId === sessionId)
      : Array.from(this.agents.values());

    const pendingTools = sessionId
      ? (this.pendingTools.get(sessionId) ?? [])
      : Array.from(this.pendingTools.values()).flat();

    return {
      totalEvents: totalRow?.total ?? 0,
      maxEvents: MAX_EVENTS,
      toolCounts,
      toolFailCounts,
      agentCounts,
      eventTypeCounts,
      activeAgents: agents,
      tokens,
      pendingTools,
      model: modelRow?.model,
      firstEvent: tsRow?.first ?? undefined,
      lastEvent: tsRow?.last ?? undefined,
    };
  }

  /**
   * Merges `patch` into the stored JSON data of event `id`.
   * Returns the updated ClaudeEvent, or null if the event doesn't exist.
   */
  patchEventData(id: string, patch: Record<string, any>): ClaudeEvent | null {
    const row = this.db
      .query("SELECT * FROM events WHERE id = ?")
      .get(id) as import("./db/types").DbEvent | null;
    if (!row) return null;

    const merged = { ...JSON.parse(row.data), ...patch };
    this.db
      .query("UPDATE events SET data = ? WHERE id = ?")
      .run(JSON.stringify(merged), id);

    const event = rowToEvent(row);
    event.data = merged;
    return event;
  }

  drainSideEffects(): ClaudeEvent[] {
    const result = this.sideEffects;
    this.sideEffects = [];
    return result;
  }

  clear(): void {
    this.db.transaction(() => {
      this.db.query("DELETE FROM events").run();
      this.db.query("DELETE FROM sessions").run();
      this.db.query("DELETE FROM session_tokens").run();
      this.db.query("DELETE FROM agents").run();
    })();
    this.agents.clear();
    this.sessions.clear();
    this.pendingTools.clear();
    this.idCounter = 0;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _persistEvent(event: ClaudeEvent): void {
    this.stmtInsertEvent.run(
      event.id,
      event.type,
      event.timestamp,
      event.sessionId ?? null,
      event.toolName ?? null,
      event.agentType ?? null,
      event.duration ?? null,
      JSON.stringify(event.data),
    );
  }

  private _persistSession(s: SessionInfo): void {
    this.stmtUpsertSession.run(
      s.id,
      s.firstEvent,
      s.lastEvent,
      s.eventCount,
      s.status,
      s.isProcessing ? 1 : 0,
      s.cwd ?? null,
    );
  }

  private _persistAgent(a: AgentProcess): void {
    this.stmtUpsertAgent.run(
      a.id,
      a.type,
      a.description ?? null,
      a.startTime,
      a.endTime ?? null,
      a.status,
      a.sessionId ?? null,
    );
  }

  /**
   * When a SubagentStop arrives without a matching SubagentStart in the session,
   * try to adopt an orphaned SubagentStart from another session, or synthesise one.
   * The corrected/new event is pushed to sideEffects for broadcast.
   */
  private _adoptOrSynthSubagentStart(stopEvent: ClaudeEvent, sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const sessionFirstTs = session?.firstEvent ?? stopEvent.timestamp;

    // Look for an unmatched SubagentStart from any other session within a generous window
    const orphanRow = this.db
      .query(`
        SELECT * FROM events
        WHERE type = 'SubagentStart'
          AND (session_id IS NULL OR session_id != ?)
          AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp DESC
        LIMIT 1
      `)
      .get(sessionId, sessionFirstTs - 5_000, stopEvent.timestamp + 30_000) as DbEvent | null;

    if (orphanRow) {
      const orphan = rowToEvent(orphanRow);
      orphan.sessionId = sessionId;
      stopEvent.duration = stopEvent.timestamp - orphan.timestamp;
      this.db
        .query("UPDATE events SET session_id = ? WHERE id = ?")
        .run(sessionId, orphanRow.id);
      this.sideEffects.push({ ...orphan });
      return;
    }

    // No orphan — synthesise
    const synth: ClaudeEvent = {
      id: `evt_${++this.idCounter}`,
      type: "SubagentStart",
      timestamp: sessionFirstTs,
      data: { event_type: "SubagentStart", session_id: sessionId },
      sessionId,
      agentType: stopEvent.agentType,
    };
    this._persistEvent(synth);
    stopEvent.duration = stopEvent.timestamp - synth.timestamp;
    this.sideEffects.push(synth);
  }
}
