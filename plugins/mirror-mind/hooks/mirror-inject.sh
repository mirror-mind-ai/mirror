#!/bin/bash
# Mirror Mind plugin — UserPromptSubmit (Mirror Mode injection).
#
# Runs synchronously on UserPromptSubmit. When the user invokes /mm:mirror it
# loads identity context and injects it (via stdout) before the response. It
# also reinjects context when Mirror Mode is active but context was lost.
#
# Plugin contract (CV21): `memory` is installed and importable, so `python3 -m
# memory` resolves without a repo cwd. Only the injected context is written to
# stdout; all command chatter is suppressed.

INPUT=$(cat)

PROMPT=$(printf '%s' "$INPUT" | python3 -m memory.hooks.extract_prompt 2>/dev/null)
SESSION_ID=$(printf '%s' "$INPUT" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get("session_id", ""))' 2>/dev/null)

# Case 1: explicit /mm:mirror invocation.
if printf '%s' "$PROMPT" | grep -qE "^/mm:mirror"; then
    QUERY=$(printf '%s' "$PROMPT" | sed 's|^/mm:mirror[[:space:]]*||')

    # --context-only avoids creating a new conversation session; the model does that.
    ARGS=(mirror load --context-only --query "$QUERY")
    [ -n "$SESSION_ID" ] && ARGS+=(--session-id "$SESSION_ID")
    CONTEXT=$(python3 -m memory "${ARGS[@]}" 2>/dev/null)

    if [ -n "$CONTEXT" ]; then
        echo "$CONTEXT"
    fi
    exit 0
fi

# Case 2: Mirror Mode is active by automatic routing and context is not injected yet.
STATE_ARGS=()
[ -n "$SESSION_ID" ] && STATE_ARGS+=(--session-id "$SESSION_ID")
NEEDS_INJECT=$(python3 -m memory.hooks.mirror_state "${STATE_ARGS[@]}" needs-inject 2>/dev/null)

if [ "$NEEDS_INJECT" = "true" ]; then
    PERSONA=$(python3 -m memory.hooks.mirror_state "${STATE_ARGS[@]}" get persona 2>/dev/null)
    JOURNEY=$(python3 -m memory.hooks.mirror_state "${STATE_ARGS[@]}" get journey 2>/dev/null)

    ARGS=(mirror load --context-only --query "$PROMPT")
    [ -n "$SESSION_ID" ] && ARGS+=(--session-id "$SESSION_ID")
    [ -n "$PERSONA" ] && ARGS+=(--persona "$PERSONA")
    [ -n "$JOURNEY" ] && ARGS+=(--journey "$JOURNEY")

    CONTEXT=$(python3 -m memory "${ARGS[@]}" 2>/dev/null)

    if [ -n "$CONTEXT" ]; then
        echo "$CONTEXT"
        python3 -m memory.hooks.mirror_state "${STATE_ARGS[@]}" mark-injected 2>/dev/null
    fi
fi

exit 0
