# Claude Visual — TODO

Priorities set after the 2026-02-28 session. Implement in order.

---

## 🐛 Bugs / Tech Debt

- [x] **`decodeProjectPath` ambiguity** — fixed: function is now async and uses a recursive filesystem traversal (`stat` + backtracking DFS) to resolve which `-` characters are path separators vs literal hyphens. Naive decode is kept as a fast path (when the path exists) and as a fallback (when the project dir is gone). Tests added in `server/history.test.ts`.

- [x] **Synthetic SubagentStart out-of-order** — fixed: `drainSideEffects()` is now called synchronously right after `add()` (before the `await transcriptReader.readNewData()`) so concurrent requests can no longer steal each other's synthetic events. The `event` handler in `useWebSocket.ts` also sorts when a newly arrived event has an earlier timestamp than the previous tail, providing a defensive second layer.

- [x] **No indication of event truncation** — fixed: `EventFeed` now shows a cyber-yellow banner "HISTORY TRUNCATED — showing latest 2,000 events" when `globalStats.totalEvents > 2000`. Derived entirely from existing `totalEvents` in `SessionStats` — no backend changes needed.

---

## 🎨 UX / UI

- [x] **Diff view for Edit/Write** — in the `PreToolUse` detail view for Edit, show a proper diff (`old_string` vs `new_string`) with syntax highlighting instead of raw strings.

- [x] **Token cost → $** — the Token Panel shows token counts but without conversion to dollars. Add simple multipliers (input / output / cache_read / cache_creation) — configurable or with defaults for claude-sonnet/opus/haiku.

- [x] **History Browser — full-text search** — grep across JSONL transcripts. With many sessions/projects there is no way to find a specific conversation. Fixed: `searchTranscripts()` scans all JSONL files, endpoint `/api/history/search?q=&project=`, `SearchResultsPanel` with snippet highlighting. Clicking a result loads the full transcript (`limit=999999`) and scrolls to the matched message (centered, with cyan left-border highlight). `messageIndex` tracked per match so the virtualizer always lands on the correct row.

- [x] **Transcript streaming in History** — fixed: backend `readSession` now accepts a `limit` param (default 300), returning only the most-recent N messages plus `totalMessages`/`offset` metadata. Frontend `TranscriptPanel` uses `useVirtualizer` from `@tanstack/react-virtual` to render only visible items (dynamic `measureElement` re-measures on expand/collapse). A yellow banner shows "Showing last N of M messages" with a [LOAD ALL] button when the session is truncated. Scrolls to the most-recent message on open.

- [x] **AgentTimeline** — fixed: each active agent card now shows the last 5 `PreToolUse → PostToolUse` pairs as inline action bars with duration. Running tools get a scanning animation + live elapsed time; completed tools get a proportional static bar; failed tools show red. Falls back to the scanning progress bar when no tool events exist. Accepts `events: ClaudeEvent[]` prop; tool pairing computed via `computeToolActions()` (FIFO matching, same logic as server).

- [x] **Raw prompt toggle** — fixed: `UserPromptSubmit` detail now has a `RAW` toggle button (visible only when `<system-reminder>` blocks are present). Default shows the cleaned prompt; `RAW` mode reveals the full original content in a scrollable `pre` block. Toggle state is local per event (separate `PromptDetail` component with `useState`).

---

## ✨ New Features

- [x] **Alerts / desktop notifications** — fixed: `useNotifications` hook watches all events and fires Web Notifications API + in-app toasts for: `PostToolUseFailure` (tool failures), `PermissionRequest`, `SessionEnd`. Threshold alerts for cost (`$N`) and session duration (`N` minutes). `AlertSettingsModal` (button ALERTS in Header) lets user toggle each trigger, request browser notification permission, and set numeric thresholds. Settings persist via `localStorage`. `ToastContainer` renders stacked toasts (bottom-right, auto-dismiss 5s, cyberpunk-styled). Initial snapshot events are silently skipped — only new live events trigger notifications.

- [ ] **Session export** — download button for JSON/CSV of events from the selected session. Useful for external analysis or reporting.

- [x] **Historical statistics** — in History Browser: token and session count charts over time, most frequently used tools per project, average session cost. Fixed: `getProjectStats()` w `server/history.ts` agreguje dane z metadanych sesji (dwa przebiegi: tokeny/koszty/model + skan JSONL dla narzędzi). Endpoint `/api/history/stats?project=`. Komponent `HistoricalStatsPanel` z KPI cards (sesje, tokeny, koszt, avg/sesja), sparkline 30 dni, model breakdown z barami, top 10 tools. Panel pojawia się w prawym obszarze gdy projekt wybrany bez sesji; przycisk STATS/TRANSCRIPT w nagłówku pozwala przełączyć widok gdy sesja jest otwarta.

- [ ] **Replay mode** — replay a live session at ×1/×5/×10 speed (throttled EventStream), useful for step-by-step analysis of exactly what happened.

- [x] **Multi-instance / remote** — fixed: `useServerConfig` hook manages a list of server instances (local + user-added remote) persisted in `localStorage`. Derives `wsUrl`, `apiBase`, `authHeaders` from the active server. `ServerConfigModal` (button in Header showing active server name) lists saved servers with TEST/CONNECT/remove buttons and an Add Server form (name, URL, optional auth token). Server-side: `CLAUDE_VISUAL_TOKEN` env var enables Bearer token auth on all API routes + `?token=` query param for WebSocket; CORS widened to `*` when auth is active. `GET /api/info` and `GET /api/health` remain public. All fetch calls across `useWebSocket`, `HistoryBrowser`, `HistoricalStatsPanel`, `HookInstallBanner`, `App` thread the dynamic `apiBase`/`authHeaders`. Switching server resets WebSocket state and reconnects to the new instance.

---

## 🏗️ Architecture

- [x] **Event persistence (SQLite)** — replace the in-memory `EventStore` with a SQLite database via `bun:sqlite`. Benefits: unlimited live session history, survives server restarts, query support for events, foundation for historical statistics. **Unlocks: Historical statistics, Replay mode.**

- [x] **Hook `SessionStart` → emit `SubagentStart`** — fixed: `SessionStart` hook now sends a second `SubagentStart` event (agent_type `"session"`) immediately after, so every session appears as an active agent from the moment it starts — no retroactive synthesis needed. `SessionEnd` now also completes any `active` agents in that session so root-session agents close cleanly (they never receive a `SubagentStop`). **Requires re-running `bash hooks/install.sh`.**

---

## Suggested implementation order

1. Diff view for Edit/Write — big quick win, no architectural changes required
2. Token cost → $
3. SQLite persistence — foundation for subsequent features
4. Alerts / notifications
5. Historical statistics
6. History full-text search
7. Session export
8. Replay mode
9. Transcript streaming
10. Multi-instance
11. Bugfixes (decode ambiguity, out-of-order synthetic events, event truncation notice)
