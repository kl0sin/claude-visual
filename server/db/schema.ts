import { Database } from "bun:sqlite";

/**
 * Creates all tables and indexes if they don't already exist.
 * Run once at startup before preparing statements.
 */
export function initSchema(db: Database): void {
  db.transaction(() => {
    db.query(
      `
      CREATE TABLE IF NOT EXISTS events (
        id          TEXT    PRIMARY KEY,
        type        TEXT    NOT NULL,
        timestamp   INTEGER NOT NULL,
        session_id  TEXT,
        tool_name   TEXT,
        agent_type  TEXT,
        duration    INTEGER,
        data        TEXT    NOT NULL
      )
    `,
    ).run();
    db.query("CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)").run();
    db.query("CREATE INDEX IF NOT EXISTS idx_events_ts     ON events(timestamp)").run();
    db.query("CREATE INDEX IF NOT EXISTS idx_events_type   ON events(type)").run();
    db.query(
      "CREATE INDEX IF NOT EXISTS idx_events_tool ON events(tool_name) WHERE tool_name IS NOT NULL",
    ).run();

    db.query(
      `
      CREATE TABLE IF NOT EXISTS sessions (
        id            TEXT    PRIMARY KEY,
        first_event   INTEGER NOT NULL,
        last_event    INTEGER NOT NULL,
        event_count   INTEGER NOT NULL DEFAULT 0,
        status        TEXT    NOT NULL DEFAULT 'active',
        is_processing INTEGER NOT NULL DEFAULT 0,
        cwd           TEXT
      )
    `,
    ).run();
    // Migrations: add columns to existing databases that predate them
    try {
      db.query("ALTER TABLE sessions ADD COLUMN cwd TEXT").run();
    } catch { /* already exists */ }
    try {
      db.query("ALTER TABLE sessions ADD COLUMN stop_reason TEXT").run();
    } catch { /* already exists */ }

    db.query(
      `
      CREATE TABLE IF NOT EXISTS session_tokens (
        session_id              TEXT    PRIMARY KEY,
        model                   TEXT,
        input_tokens            INTEGER NOT NULL DEFAULT 0,
        output_tokens           INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens   INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens       INTEGER NOT NULL DEFAULT 0,
        total_tokens            INTEGER NOT NULL DEFAULT 0
      )
    `,
    ).run();

    db.query(
      `
      CREATE TABLE IF NOT EXISTS agents (
        id          TEXT    PRIMARY KEY,
        type        TEXT    NOT NULL,
        description TEXT,
        start_time  INTEGER NOT NULL,
        end_time    INTEGER,
        status      TEXT    NOT NULL DEFAULT 'active',
        session_id  TEXT
      )
    `,
    ).run();
  })();
}
