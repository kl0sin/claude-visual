#!/bin/bash
# ═══════════════════════════════════════════════════════
# CLAUDE VISUAL — Hook Installer
# Installs monitoring hooks into Claude Code settings
# ═══════════════════════════════════════════════════════

set -e

CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_FILE="$SCRIPT_DIR/claude-hooks.json"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ${MAGENTA}CLAUDE VISUAL${CYAN} — Hook Installer     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# Check dependencies
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed.${NC}"
    echo -e "Install with: ${YELLOW}brew install jq${NC}"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl is required but not installed.${NC}"
    exit 1
fi

# Check hooks file exists
if [ ! -f "$HOOKS_FILE" ]; then
    echo -e "${RED}Error: claude-hooks.json not found at $HOOKS_FILE${NC}"
    exit 1
fi

# Create settings dir if needed
mkdir -p "$HOME/.claude"

# Backup existing settings
if [ -f "$SETTINGS_FILE" ]; then
    BACKUP="$SETTINGS_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$SETTINGS_FILE" "$BACKUP"
    echo -e "${YELLOW}▸ Backed up existing settings to:${NC}"
    echo -e "  $BACKUP"
    echo ""

    # Merge hooks into existing settings
    HOOKS_CONTENT=$(cat "$HOOKS_FILE")
    EXISTING=$(cat "$SETTINGS_FILE")

    echo "$EXISTING" | jq --argjson hooks "$(echo "$HOOKS_CONTENT" | jq '.hooks')" '.hooks = ((.hooks // {}) + $hooks)' > "$SETTINGS_FILE"
    echo -e "${GREEN}▸ Merged hooks into existing settings${NC}"
else
    # Create new settings file with hooks
    cp "$HOOKS_FILE" "$SETTINGS_FILE"
    echo -e "${GREEN}▸ Created new settings file with hooks${NC}"
fi

echo ""
echo -e "${GREEN}✓ Installation complete!${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo -e "  1. Start the monitor:  ${YELLOW}bun run dev${NC}"
echo -e "  2. Open dashboard:     ${YELLOW}http://localhost:5173${NC}"
echo -e "  3. Use Claude Code — events will appear in real-time"
echo ""
echo -e "${MAGENTA}To uninstall, restore the backup:${NC}"
if [ -n "$BACKUP" ]; then
    echo -e "  ${YELLOW}cp \"$BACKUP\" \"$SETTINGS_FILE\"${NC}"
fi
echo ""
