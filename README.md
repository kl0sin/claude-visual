# Claude Visual

![Claude Visual](./assets/claude-visual.jpg)

Real-time neural monitor for Claude Code agent activity. Tracks events, tool usage, subagent processes, and token consumption with cost estimation — all through a cyberpunk-themed dashboard.

![Claude Visual Dashboard](https://img.shields.io/badge/status-active-00f0ff?style=flat-square) ![Bun](https://img.shields.io/badge/runtime-Bun-f472b6?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)

## Features

- **Live Event Feed** — real-time stream of all Claude Code hook events (tool calls, prompts, notifications, stops)
- **Token Tracking** — reads token usage directly from session transcripts with per-session breakdown (input, output, cache read, cache write)
- **Cost Estimation** — calculates estimated cost based on Claude Opus 4 pricing ($15/MTok input, $75/MTok output, $18.75/MTok cache write, $1.50/MTok cache read)
- **Agent Processes** — tracks subagent lifecycle (start/stop, duration, type) with active/completed states
- **Tool Statistics** — visualizes tool usage frequency across sessions
- **Session Management** — filter dashboard by individual Claude Code sessions
- **WebSocket Updates** — instant UI updates via WebSocket connection to the backend

## Architecture

```text
~/.claude/settings.json          Claude Code hooks (fire on every event)
        │
        ▼
  POST /api/events               Bun + Hono server (port 3200)
        │
        ├── EventStore            In-memory event storage (last 2000 events)
        ├── TranscriptTokenReader Reads token usage from .jsonl transcripts
        │
        ▼
   WebSocket /ws                  Broadcasts to connected clients
        │
        ▼
   React Dashboard                Vite + React + Tailwind CSS
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- Claude Code CLI with hooks support

### 1. Install dependencies

```bash
bun install
```

### 2. Install Claude Code hooks

```bash
bash hooks/install.sh
```

This merges monitoring hooks into `~/.claude/settings.json`. A backup of your existing settings is created automatically.

### 3. Start the monitor

```bash
bun run dev
```

This starts both the backend server (port 3200) and Vite dev server concurrently.

### 4. Use Claude Code

Open any Claude Code session — events will appear in the dashboard in real-time.

## Production Build

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
  index.ts           Hono server, WebSocket, REST API
  events.ts          EventStore — in-memory event & agent tracking
  transcript.ts      TranscriptTokenReader — reads tokens from .jsonl files
shared/
  types.ts           Shared TypeScript interfaces
  tokens.ts          Token extraction utilities
src/
  App.tsx            Main React component
  hooks/
    useWebSocket.ts  WebSocket connection & state management
  components/
    Header.tsx       Top bar with global stats
    EventFeed.tsx    Live event stream
    TokenPanel.tsx   Token consumption & cost breakdown
    AgentTimeline.tsx  Subagent process tracking
    ToolStats.tsx    Tool usage frequency
    StatsPanel.tsx   Session statistics
    SessionSelector.tsx  Session filter dropdown
hooks/
  claude-hooks.json  Hook definitions template
  install.sh         Installer script
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3200` | Server & WebSocket port |
| `NODE_ENV` | — | Set to `production` for static file serving |
| `DEBUG_TOKENS` | — | Set to `1` to log token extraction to console |

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Backend**: [Hono](https://hono.dev)
- **Frontend**: [React](https://react.dev) + [Vite](https://vite.dev) + [Tailwind CSS](https://tailwindcss.com)
- **Transport**: WebSocket (native Bun)

## License

MIT
