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

- [ ] **History Browser — full-text search** — grep across JSONL transcripts. With many sessions/projects there is no way to find a specific conversation.

- [ ] **Transcript streaming in History** — the entire JSONL file is loaded at once (`readSession`). For large sessions (>500 messages) this is slow and memory-hungry. Worth streaming lines and virtualizing the message list.

- [ ] **AgentTimeline** — the component exists but is underexposed. Consider integrating with Event Stream — visually grouping `PreToolUse → PostToolUse` as a single "action" with a duration bar.

- [ ] **Raw prompt toggle** — `UserPromptSubmit` detail strips `<system-reminder>` tags, which is fine, but it's worth adding a "show raw prompt" button for debugging.

---

## ✨ New Features

- [ ] **Alerts / desktop notifications** — notifications (Web Notifications API or Tauri) for: `PostToolUseFailure`, session running >X minutes, token/cost threshold exceeded. Configurable thresholds.

- [ ] **Session export** — download button for JSON/CSV of events from the selected session. Useful for external analysis or reporting.

- [ ] **Historical statistics** — in History Browser: token and session count charts over time, most frequently used tools per project, average session cost.

- [ ] **Replay mode** — replay a live session at ×1/×5/×10 speed (throttled EventStream), useful for step-by-step analysis of exactly what happened.

- [ ] **Multi-instance / remote** — the dashboard currently assumes a single local server (`localhost:3200`). Support connecting to a remote instance (URL + optional token auth).

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
