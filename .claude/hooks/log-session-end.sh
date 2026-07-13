#!/bin/bash
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
uv run python -m memory conversation-logger session-end 2>/dev/null
uv run python -m memory backup --silent 2>/dev/null
exit 0
