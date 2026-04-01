Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Project Overview

Claude Visual is a real-time monitoring dashboard for Claude Code agent activity. It uses Claude Code hooks to capture events and displays them in a cyberpunk-themed UI.

### Architecture

- **Backend**: Hono server on Bun (`server/index.ts`) with WebSocket support
- **Frontend**: React 19 + Vite 7 + Tailwind CSS v4 (`src/`)
- **Shared types**: `shared/types.ts` and `shared/tokens.ts`
- **Hooks**: Claude Code hook definitions in `hooks/claude-hooks.json`
- **Dev launcher**: `dev.ts` — uses `Bun.spawn()` to run server + Vite concurrently

### Key Scripts

- `bun run dev` — starts both server and Vite dev server (via `dev.ts`)
- `bun run dev:server` — server only with watch mode
- `bun run dev:client` — Vite dev server only
- `bun run build` — production build (Vite)
- `bun run start` — production server (serves static files from `dist/`)

### Important Details

- Token data is NOT in hook event payloads. It's read from session transcript JSONL files via `transcript_path` field in each hook event. See `server/transcript.ts`.
- Hooks must use pass-through jq pattern (`. + {event_type: "..."}`) to preserve all fields. Never use destructive `{field: .field}` pattern.
- The server runs on port 3200 (configurable via `PORT` env var).
- WebSocket endpoint: `/ws`. REST API: `/api/events`, `/api/stats`, `/api/sessions`, `/api/clear`.
- Frontend connects to WebSocket at `ws://<hostname>:3200/ws`.
- In dev mode, Vite (port 5173) proxies `/api` and `/ws` to the backend (port 3200) — see `vite.config.ts`.

### Bun APIs Used

- `Bun.serve()` for HTTP server with WebSocket upgrade
- `Bun.file()` for reading transcript JSONL files
- `Bun.spawn()` in `dev.ts` for running concurrent processes

### Tailwind CSS v4

This project uses **Tailwind v4** with the new `@tailwindcss/vite` plugin. Key differences from v3:
- Import via `@import "tailwindcss"` (not `@tailwind base/components/utilities`)
- Theme tokens defined in `@theme {}` block in `src/index.css` (not `tailwind.config.js`)
- No `tailwind.config.js` file — all config is CSS-native

### Cyberpunk Theme Palette

All theme colors are defined as CSS custom properties in `src/index.css` `@theme {}` block. Use these — don't introduce new colors:

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-cyber-cyan` | `#00f0ff` | Primary accent, glows, links |
| `--color-cyber-magenta` | `#ff2d95` | Secondary accent, tool events |
| `--color-cyber-yellow` | `#f0ff00` | Session events, warnings |
| `--color-cyber-green` | `#00ff9f` | Success, cache, completed |
| `--color-cyber-orange` | `#ff6b00` | Alerts, compact events |
| `--color-cyber-red` | `#ff0040` | Errors, failures |
| `--color-cyber-purple` | `#8b5cf6` | Stop events, misc |
| `--color-cyber-bg` | `#0a0e17` | Page background |
| `--color-cyber-panel` | `#0d1525` | Panel background |
| `--color-cyber-border` | `#1a2744` | Default borders |
| `--color-cyber-text` | `#8892a8` | Body text |
| `--color-cyber-text-bright` | `#c8d0e0` | Emphasized text |

### Hook Event Types

Events tracked from Claude Code hooks (defined in `hooks/claude-hooks.json`):

| Event | Description |
|-------|-------------|
| `SessionStart` | Session begins or resumes |
| `SessionEnd` | Session terminates |
| `UserPromptSubmit` | User submits a prompt, before Claude processes it |
| `InstructionsLoaded` | CLAUDE.md or `.claude/rules/*.md` file loaded into context |
| `PreToolUse` | Before tool invocation (can block it) |
| `PostToolUse` | After successful tool invocation |
| `PostToolUseFailure` | Tool execution failed |
| `PermissionRequest` | Permission dialog appears |
| `PermissionDenied` | Auto mode classifier denied a tool |
| `SubagentStart` | Subagent spawned |
| `SubagentStop` | Subagent finished |
| `TaskCreated` | Task created via `TaskCreate` |
| `TaskCompleted` | Task marked as completed |
| `Stop` | Claude finishes responding |
| `StopFailure` | Turn ends due to an API error |
| `Notification` | System notification |
| `TeammateIdle` | Agent team teammate about to go idle |
| `ConfigChange` | Configuration file changes during session |
| `CwdChanged` | Working directory changes (e.g., after `cd`) |
| `FileChanged` | Watched file changes on disk |
| `PreCompact` | Before context compaction |
| `PostCompact` | After context compaction completes |
| `Elicitation` | MCP server requests user input during a tool call |
| `ElicitationResult` | User responds to an MCP elicitation |
| `WorktreeCreate` | Worktree created via `--worktree` or `isolation: "worktree"` |
| `WorktreeRemove` | Worktree removed at session exit or subagent finish |

Event colors and icons are mapped in `src/types.ts` (`EVENT_COLORS`, `EVENT_ICONS`).

### Component Conventions

- Components live in `src/components/` — one component per file, named export matching filename.
- Props defined as interface above the component (e.g., `interface HeaderProps`).
- Styling uses CSS classes from `src/index.css` — not inline styles (except dynamic `--var` props via `style`).
- Panel components follow the pattern: `.panel` wrapper → `.panel-header` → content area.
- Agent/tool colors use `Record<string, string>` lookup maps defined at module top.

### State Management

- All frontend state flows through `src/hooks/useWebSocket.ts` — single hook, no external state library.
- Server state is in-memory via `EventStore` class (`server/events.ts`) — max 2000 events.
- WebSocket messages follow the `WSMessage` union type in `shared/types.ts`.

### Server Modules

| Module | Purpose |
|--------|---------|
| `server/index.ts` | Hono app, HTTP routes, WebSocket upgrade + broadcast |
| `server/events.ts` | `EventStore` — SQLite-backed event/session/agent tracking |
| `server/transcript.ts` | `TranscriptTokenReader` — reads token diff from JSONL files |
| `server/history.ts` | History browser — lists past Claude Code projects/sessions |
| `server/db/schema.ts` | SQLite table definitions + migration |
| `server/db/types.ts` | DB row interfaces + type converters |

### SQLite Database

The server uses **Bun's built-in SQLite** (`bun:sqlite`) — no separate sqlite3 package needed.

- Import: `import { Database } from "bun:sqlite"`
- DB path: `~/.claude/claude-visual.db` (configurable via `CLAUDE_VISUAL_DB` env var)
- Schema: 4 tables — `events`, `sessions`, `agents`, `session_tokens`
- `EventStore` in `server/events.ts` uses prepared statements for all hot-path queries
- Max 2,000 events stored — oldest are evicted on insert
- `__global__` is a reserved `session_id` bucket for events without a session

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3200` | HTTP server + WebSocket port |
| `NODE_ENV` | — | Set to `production` for static file serving from `dist/` |
| `CLAUDE_VISUAL_DB` | `~/.claude/claude-visual.db` | SQLite database path |
| `CLAUDE_VISUAL_URL` | `http://localhost:3200` | Server URL used by hooks (set when Claude Code runs in a container/sandbox) |
| `DEBUG_TOKENS` | — | Set to `1` to enable token extraction debug logging |

### Tauri Desktop Integration

- `src-tauri/` — Tauri 2.x config and Rust source
- Server runs as a **sidecar binary** in production (compiled with `bun build --compile`)
- Sidecar binary: `src-tauri/binaries/server-<rust-triple>` (e.g. `server-x86_64-unknown-linux-gnu`)
- Build sidecar: `bun run tauri:sidecar`
- Desktop dev (requires WSLg on WSL2): `bun run tauri:dev`
- Desktop build + bundle: `bun run tauri:build`
- `API_BASE` in `src/hooks/useWebSocket.ts` handles Tauri vs web URL routing
- `src-tauri/src/lib.rs` manages sidecar lifecycle (spawn on app start, kill on close)
- System libs required: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

### Key Architectural Rules

1. **Token data is NOT in hook payloads** — always read from JSONL via `transcript_path`
2. **Hook jq must be pass-through**: `. + {event_type: "..."}` — never destructive `{field: .field}`
3. **All frontend state via `useWebSocket` hook** — no additional state management
4. **No new colors** — only use `--color-cyber-*` tokens defined in `src/index.css`
5. **SQLite is source of truth** — in-memory maps (`sessions`, `agents`) are warm caches rebuilt on startup
6. **Always drain side effects**: after `EventStore.add()` call `drainSideEffects()` before broadcasting

### Testing

Use `bun test` to run tests. Tests use Bun's native test framework.

```ts
import { test, expect } from "bun:test";

test("example", () => {
  expect(1).toBe(1);
});
```

Test files: `server/history.test.ts`, `server/transcript.test.ts`, `shared/tokens.test.ts`

### Debugging

- **Server not receiving events**: Check that Claude Code hooks are installed (`~/.claude/settings.json` should reference `hooks/claude-hooks.json`). Run `bash hooks/install.sh` to install.
- **WebSocket disconnects**: Frontend auto-reconnects every 2s. Check that server is running on port 3200.
- **Token counts zero**: Token data comes from transcript JSONL files. Verify `transcript_path` exists in hook event payloads. Check `server/transcript.ts` logic. Set `DEBUG_TOKENS=1` for detailed logging.
- **Type errors**: Run `bunx tsc --noEmit` for full type check. Strict mode is enabled.
- **Events not showing**: Check the session filter in the UI — "ALL" shows everything, individual session tabs filter.
- **Database issues**: Check `~/.claude/claude-visual.db` exists and is writable. Use `CLAUDE_VISUAL_DB` env var to override path.
