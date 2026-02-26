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
- **Frontend**: React + Vite + Tailwind CSS (`src/`)
- **Shared types**: `shared/types.ts` and `shared/tokens.ts`
- **Hooks**: Claude Code hook definitions in `hooks/claude-hooks.json`

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

### Bun APIs Used

- `Bun.serve()` for HTTP server with WebSocket upgrade
- `Bun.file()` for reading transcript JSONL files
- `Bun.spawn()` in `dev.ts` for running concurrent processes

### Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";

test("example", () => {
  expect(1).toBe(1);
});
```
