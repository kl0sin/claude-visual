# Claude Visual — TODO

Priorities set after the 2026-02-28 session. Implement in order.

---

## 🐛 Bugs / Tech Debt

- [ ] **`decodeProjectPath` ambiguity** — `-` encodes both `/` and a hyphen in a directory name. The current heuristic works for typical cases (`_Projects/my-app`) but may fail for projects in regular subdirectories (`~/work/my-app`). Proper fix: filesystem lookup (`access()`) to verify which decoded path actually exists.

- [ ] **Synthetic SubagentStart out-of-order** — the synthetic event gets a `session.firstEvent` timestamp but is pushed to the end of `this.events[]`, so in the live view it may appear below events that happened earlier. A snapshot after reconnect sorts correctly — but the first delivery may be out-of-order.

- [ ] **No indication of event truncation** — the server keeps a max of 2000 events in memory (`EventStore`). When the limit is reached, old events are dropped with no indication in the UI. Worth showing a banner/badge "history truncated".

---

## 🎨 UX / UI

- [ ] **Diff view for Edit/Write** — in the `PreToolUse` detail view for Edit, show a proper diff (`old_string` vs `new_string`) with syntax highlighting instead of raw strings.

- [ ] **Token cost → $** — the Token Panel shows token counts but without conversion to dollars. Add simple multipliers (input / output / cache_read / cache_creation) — configurable or with defaults for claude-sonnet/opus/haiku.

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

- [ ] **Event persistence (SQLite)** — replace the in-memory `EventStore` with a SQLite database via `bun:sqlite`. Benefits: unlimited live session history, survives server restarts, query support for events, foundation for historical statistics. **Unlocks: Historical statistics, Replay mode.**

- [ ] **Hook `SessionStart` → emit `SubagentStart`** — the current SubagentStart/Stop parity problem stems from SubagentStart firing only once at session start. Add emission of an additional `SubagentStart` event in the `SessionStart` hook — every session will have a guaranteed start visible immediately.

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
