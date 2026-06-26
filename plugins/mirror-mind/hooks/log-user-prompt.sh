#!/bin/bash
# Mirror Mind plugin — UserPromptSubmit (logging).
# Record the user message using the session_id from the hook payload on stdin.
#
# Plugin contract (CV21): `memory` is installed and importable, so there is no
# repo `src` on PYTHONPATH and no cwd assumption.
INPUT=$(cat)
printf '%s' "$INPUT" \
  | python3 -c "from memory.cli.conversation_logger import hook_user_prompt; hook_user_prompt()" \
    >/dev/null 2>&1
exit 0
