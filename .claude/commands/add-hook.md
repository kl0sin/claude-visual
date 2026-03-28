Add a new Claude Code hook event type: $ARGUMENTS

Steps:
1. Add the hook entry to `hooks/claude-hooks.json` following the existing pattern exactly:
   ```json
   "EventName": [
     {
       "hooks": [
         {
           "type": "command",
           "command": "INPUT=$(cat) && printf '%s' \"$INPUT\" | jq -c '. + {event_type: \"EventName\", session_id: (.session_id // env.CLAUDE_SESSION_ID)}' | curl -s --connect-timeout 1 -X POST -H 'Content-Type: application/json' -d @- ${CLAUDE_VISUAL_URL:-http://localhost:3200}/api/events > /dev/null 2>&1 ; exit 0"
         }
       ]
     }
   ]
   ```
   Key details: `--connect-timeout 1` ensures fast failure when server is down, `${CLAUDE_VISUAL_URL:-...}` supports remote/container setups, `; exit 0` prevents hook errors in Claude Code.
2. Add a color entry to `EVENT_COLORS` in `src/types.ts` — pick a color from the cyberpunk palette.
3. Add an icon entry to `EVENT_ICONS` in `src/types.ts` — use a unicode symbol consistent with existing ones.
4. If the event has special lifecycle behavior (like SubagentStart/Stop pairs), update `server/events.ts` `EventStore.add()` to handle it.
5. Update the Hook Event Types table in `CLAUDE.md`.
6. Run `bunx tsc --noEmit` to verify no type errors were introduced.
