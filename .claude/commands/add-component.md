Add a new dashboard component: $ARGUMENTS

Follow project conventions:
1. Create `src/components/<ComponentName>.tsx` with:
   - Named export matching the filename
   - Props interface defined above the component
   - Use CSS classes from `src/index.css` for styling (`.panel`, `.panel-header` pattern for panels)
   - Use theme colors from `--color-cyber-*` CSS variables — see the palette in CLAUDE.md
2. Add CSS styles in `src/index.css` under a new section comment:
   ```css
   /* -- COMPONENT NAME ---------------------------------------- */
   ```
3. Import and render the component in `src/App.tsx` in the appropriate layout column (left/center/right).
4. If the component needs data from the server, use the existing `useWebSocket` hook props — do NOT add new state management.
5. If new data types are needed, add them to `shared/types.ts` and re-export from `src/types.ts`.
6. Run `bunx tsc --noEmit` to verify no type errors.
