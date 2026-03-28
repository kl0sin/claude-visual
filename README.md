# Claude Visual

![Claude Visual](./assets/claude-visual.jpg)

Real-time neural monitor for Claude Code agent activity. Tracks events, tool usage, subagent processes, and token consumption with cost estimation — all through a cyberpunk-themed dashboard. Available as a web app or native desktop application (macOS, Windows, Linux) via Tauri.

![Claude Visual Dashboard](https://img.shields.io/badge/status-active-00f0ff?style=flat-square) ![Bun](https://img.shields.io/badge/runtime-Bun-f472b6?style=flat-square) ![Tauri](https://img.shields.io/badge/desktop-Tauri%202-ffc131?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)

## Features

- **Live Event Feed** — real-time stream of all Claude Code hook events (tool calls, prompts, notifications, stops)
- **Token Tracking** — reads token usage directly from session transcripts with per-session breakdown (input, output, cache read, cache write)
- **Cost Estimation** — calculates estimated cost per token type (input, output, cache read, cache write) with built-in pricing for Claude Opus 4, Sonnet 4, and Haiku 4; defaults to Sonnet when model is unknown
- **History Browser** — browse and inspect past Claude Code sessions and their full transcripts
- **Agent Processes** — tracks subagent lifecycle (start/stop, duration, type) with active/completed states
- **Tool Statistics** — visualizes tool usage frequency across sessions
- **Session Management** — filter dashboard by individual Claude Code sessions
- **In-app Hook Installation** — install Claude Code hooks directly from the dashboard UI without touching the terminal
- **WebSocket Updates** — instant UI updates via WebSocket connection to the backend
- **Native Desktop App** — cross-platform desktop builds via Tauri 2 with bundled sidecar server

## Architecture

```text
~/.claude/settings.json          Claude Code hooks (fire on every event)
        │
        ▼
  POST /api/events               Bun + Hono server (port 3200)
        │
        ├── EventStore            SQLite event storage (~/.claude/claude-visual.db)
        ├── TranscriptTokenReader Reads token usage from .jsonl transcripts
        │
        ▼
   WebSocket /ws                  Broadcasts to connected clients
        │
        ▼
   React Dashboard                Vite + React + Tailwind CSS
        │
        └── (optional) Tauri      Native window wrapping the frontend
                │                  with bundled sidecar server binary
                └── Sidecar        Compiled Bun server, auto-started
                                   on launch, killed on window close
```

## Quick Start (Web)

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- Claude Code CLI with hooks support

### 1. Install dependencies

```bash
bun install
```

### 2. Start the monitor

```bash
bun run dev
```

This starts both the backend server (port 3200) and Vite dev server concurrently.

### 3. Use Claude Code

Open the dashboard in your browser. If Claude Code hooks are not yet installed, a banner will appear — click **INSTALL HOOKS** and the app will configure everything automatically. Then start any Claude Code session and events will appear in real-time.

## Desktop App (Tauri)

### Prerequisites

- Everything from the web setup above
- [Rust](https://rustup.rs) toolchain (stable)
- Platform-specific dependencies:
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libfuse2`
  - **macOS / Windows**: no extra dependencies

### Development

```bash
bun run tauri:dev
```

Opens a native Tauri window pointing at the Vite dev server. The Hono backend is started automatically by `dev.ts` — the Rust sidecar is only spawned in release builds.

### Production Build

```bash
bun run tauri:build
```

This compiles the Bun server into a standalone sidecar binary, builds the frontend with Vite, and bundles everything into a platform-native installer (`.dmg` on macOS, `.msi`/`.exe` on Windows, `.deb` on Linux).

### How the Desktop App Works

In production, the Tauri app:

1. **Spawns the sidecar** — the Bun server compiled to a standalone binary, handling the REST API and WebSocket on port 3200
2. **Loads the frontend** — pre-built React app served from the bundled `dist/` directory
3. **Cleans up on exit** — kills the sidecar process when the main window is closed

## Production Build (Web Only)

```bash
bun run build
bun run start
```

Builds the frontend with Vite, then serves everything from the Bun server on port 3200.

## How It Works

Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) fire shell commands on every event (tool use, prompt submit, agent start/stop, etc.). Each hook pipes the full event JSON to the monitor's REST API.

Token usage is **not** included in hook payloads — instead, every hook event includes a `transcript_path` pointing to the session's JSONL transcript file. The server reads new entries from the transcript on each event, extracting `message.usage` data from assistant responses.

## Project Structure

```text
server/
  index.ts              Hono server, WebSocket, REST API
  events.ts             EventStore — SQLite-backed event, session & agent tracking
  transcript.ts         TranscriptTokenReader — reads tokens from .jsonl files
shared/
  types.ts              Shared TypeScript interfaces
  tokens.ts             Token extraction utilities
landing/
  src/                  Landing page source (React + Tailwind)
  vite.config.ts        Configured with base: /claude-visual/ for GitHub Pages
src/
  App.tsx               Main React component
  hooks/
    useWebSocket.ts     WebSocket connection & state management
  components/
    Header.tsx          Top bar with global stats
    EventFeed.tsx       Live event stream
    TokenPanel.tsx      Token consumption & cost breakdown
    AgentTimeline.tsx   Subagent process tracking
    HistoryBrowser.tsx  Past session & transcript explorer
    HookInstallBanner.tsx In-app hook installation prompt
    ToolStats.tsx       Tool usage frequency
    StatsPanel.tsx      Session statistics
    SessionSelector.tsx Session filter dropdown
src-tauri/
  src/
    main.rs             Rust entry point
    lib.rs              Tauri app setup — sidecar lifecycle management
  tauri.conf.json       Tauri configuration (window, CSP, sidecar, bundle)
  capabilities/         Permission definitions (shell:execute, shell:kill)
  icons/                App icons for all platforms (macOS, Windows, Linux, iOS, Android)
  Cargo.toml            Rust dependencies
hooks/
  claude-hooks.json     Hook definitions template
  install.sh            Installer script
.github/
  workflows/
    release.yml         CI/CD — multi-platform Tauri builds on tag push
    deploy-landing.yml  Deploys landing/ to GitHub Pages on push to main
```

## CI/CD

### Desktop Releases

Pushing a `v*` tag triggers multi-platform Tauri builds:

| Platform | Installer format | Runner |
| --- | --- | --- |
| Linux x86_64 | `.AppImage` | ubuntu-22.04 |
| Windows x86_64 | `.msi` / `.exe` | windows-latest |
| macOS ARM (Apple Silicon) | `.dmg` | macos-latest |
| macOS Intel | `.dmg` | macos-latest |

Artifacts are uploaded to a draft GitHub Release.

### Landing Page

Pushing to `main` (with changes in `landing/`) automatically builds and deploys the landing page to GitHub Pages at `https://kl0sin.github.io/claude-visual/`.

## Docker & Container Usage

When Claude Code runs inside a Docker container (e.g., via [cleat](https://github.com/cleatdev/cleat)), the hooks need to reach the Claude Visual server on the host machine.

### With cleat

Cleat does not support custom environment variables out of the box. You need to edit `bin/cleat` in two places:

1. **Add to the `CLAUDE_ENV` array** (used by `docker exec`):
   ```bash
   CLAUDE_ENV=(-e HOME=/home/coder -e PATH="..." -e CLAUDE_VISUAL_URL=http://host.docker.internal:3200)
   ```

2. **Add to the `docker run` command** (in `cmd_run()` function):
   ```bash
   -e "CLAUDE_VISUAL_URL=http://host.docker.internal:3200"
   ```

### With Docker Compose

```yaml
services:
  claude:
    environment:
      - CLAUDE_VISUAL_URL=http://host.docker.internal:3200
```

### With docker run

```bash
docker run -e CLAUDE_VISUAL_URL=http://host.docker.internal:3200 ...
```

> **Note:** `host.docker.internal` resolves to the host machine from inside Docker containers on macOS and Windows. On Linux, you may need to add `--add-host=host.docker.internal:host-gateway` to your `docker run` command.

### Hooks without the server

The hooks are designed to work silently when Claude Visual is not running. Each hook uses `--connect-timeout 1` so curl fails fast if the server is unreachable, and all hooks exit with code 0 regardless — no errors will appear in Claude Code.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3200` | Server & WebSocket port |
| `NODE_ENV` | — | Set to `production` for static file serving |
| `CLAUDE_VISUAL_URL` | `http://localhost:3200` | Server URL used by hooks — set this when Claude Code runs in a container or sandbox |
| `CLAUDE_VISUAL_DB` | `~/.claude/claude-visual.db` | Path to the SQLite database file |
| `CLAUDE_VISUAL_TOKEN` | — | Optional authentication token for the API |
| `MAX_EVENTS` | `2000` | Maximum number of events stored in the database |
| `DEBUG_TOKENS` | — | Set to `1` to log token extraction to console |

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Start backend + Vite dev server |
| `bun run dev:server` | Backend only (watch mode) |
| `bun run dev:client` | Vite dev server only |
| `bun run build` | Production frontend build |
| `bun run start` | Production server (serves `dist/`) |
| `bun run tauri:dev` | Tauri desktop app in dev mode |
| `bun run tauri:build` | Full desktop app build with sidecar |
| `bun run tauri:sidecar` | Compile server to standalone sidecar binary |

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Backend**: [Hono](https://hono.dev)
- **Frontend**: [React 19](https://react.dev) + [Vite 7](https://vite.dev) + [Tailwind CSS v4](https://tailwindcss.com)
- **Desktop**: [Tauri 2](https://tauri.app) (Rust + WebView)
- **Transport**: WebSocket (native Bun)
- **CI/CD**: GitHub Actions + `tauri-apps/tauri-action`

## License

MIT
