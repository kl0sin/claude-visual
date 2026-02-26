Install Claude Visual hooks into the user's Claude Code configuration.

1. Check that `jq` and `curl` are available on the system.
2. Run `bash hooks/install.sh` to merge hooks into `~/.claude/settings.json`.
3. Verify installation by checking that `~/.claude/settings.json` contains the hook entries.
4. Report which hook events were installed.
