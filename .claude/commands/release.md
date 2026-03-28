Release a new version: $ARGUMENTS

The argument is the new version number (e.g. `0.5.0`). Do NOT include a `v` prefix — just the bare semver number.

## Steps

### 1. Validate

- Verify the argument is a valid semver number (e.g. `0.5.0`). Abort if missing or malformed.
- Run `git tag` and verify that `v<VERSION>` does not already exist. Abort if it does.
- Run `git status` and verify the working tree is clean. Abort if there are uncommitted changes.

### 2. Update version in all files

Update the version number in **every** file listed below. Use the Edit tool for each change.

| File | What to change |
|------|---------------|
| `package.json` | Set `"version": "<VERSION>"` field (add it after `"name"` if missing) |
| `src-tauri/tauri.conf.json` | Update `"version"` value |
| `src-tauri/Cargo.toml` | Update `version` value |
| `src/hooks/useUpdateCheck.ts` | Update `CURRENT_VERSION` constant |
| `src/components/Header.tsx` | Update `v0.X.Y` in the header subtitle span |
| `landing/src/components/Hero.tsx` | Update `v0.X.Y` in the hero eyebrow |
| `landing/src/components/Download.tsx` | Update `VERSION` constant |
| `server/index.ts` | Update `version` in the JSON response |

### 3. Install packages

Run `bun install` so that `bun.lock` reflects the new version from `package.json`.

### 4. Generate release notes

1. Find the most recent existing git tag: `git describe --tags --abbrev=0`
2. Get the commit log since that tag: `git log <previous_tag>..HEAD --oneline`
3. For each commit, read the actual diff (`git show <hash> --stat` and `git show <hash>` for key files) to understand the technical details of what changed.
4. Create `releases/v<VERSION>.md` with a summary organized into these sections (omit empty sections):
   - `## New Features` — new user-facing functionality
   - `## Bug Fixes` — bug fixes
   - `## Improvements` — enhancements to existing features
   - `## Internal / Maintenance` — refactoring, deps, CI, docs
5. Write **technical descriptions** that include implementation details. Each item should be a bullet with **bold title** and a description that covers:
   - What changed and why
   - Key technical details (files modified, APIs used, architecture decisions)
   - Impact on the system (e.g. "reduces hook timeout from ~120s to 1s")

   Example of good technical description:
   > **Hook timeout protection** (`hooks/claude-hooks.json`): Added `--connect-timeout 1` to all curl invocations in hook commands. Previously, curl used the default ~120s connection timeout, causing Claude Code to hang when the Claude Visual server was not running. Now curl fails fast on connection refused, and `; exit 0` ensures the hook always returns success.

   Example of bad (too vague) description:
   > **Fixed hook errors**: Hooks no longer error when server is down.

### 5. Commit and tag

1. Stage all changed files: `git add package.json bun.lock src-tauri/tauri.conf.json src-tauri/Cargo.toml src/hooks/useUpdateCheck.ts src/components/Header.tsx landing/src/components/Hero.tsx landing/src/components/Download.tsx server/index.ts releases/`
2. Create commit with message: `v<VERSION>`
3. Create annotated git tag: `git tag -a v<VERSION> -m "v<VERSION>"`
4. Report success and remind the user to `git push && git push --tags` when ready to publish.
