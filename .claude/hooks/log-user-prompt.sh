#!/bin/bash
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
export PYTHONPATH="$CLAUDE_PROJECT_DIR/src${PYTHONPATH:+:$PYTHONPATH}"

# Save stdin for reuse; it can only be read once.
INPUT=$(cat)

# Record the user message using the explicit session_id from the hook payload.
printf '%s' "$INPUT" | uv run python -c "from memory.cli.conversation_logger import hook_user_prompt; hook_user_prompt()" 2>/dev/null

exit 0
