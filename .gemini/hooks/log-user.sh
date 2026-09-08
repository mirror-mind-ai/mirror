#!/usr/bin/env bash
# Mirror Mind — Gemini CLI BeforeAgent hook
#
# Fires after the user submits a prompt, before model planning.
# Logs the user turn and, when Mirror Mode is active, injects identity context
# as additionalContext so the model sees it before responding.
#
# Gemini hook contract:
#   stdin  — JSON: { session_id, transcript_path, cwd, hook_event_name, timestamp, prompt }
#   stdout — JSON: { hookSpecificOutput: { additionalContext: "..." } } or {}
#   stderr — logs only; never parsed
#
# Gemini may provide the session ID either as $GEMINI_SESSION_ID or in stdin.
# Prefer the environment variable when present; fall back to stdin for safety.

set -euo pipefail

cd "${GEMINI_PROJECT_DIR}" 2>/dev/null || cd "$(dirname "$0")/../.." || exit 0

# Every Mirror command below enters the TypeScript front door
# (ts/src/frontDoor/cli.ts), the same entry the Pi extension and the skills
# use, so routing.ts decides which engine answers, each family's revert
# control (MIRROR_TS_*=0) reaches live sessions, and front-door.log records
# the route. Unported commands fall back to Python inside the front door.
# `--env-file-if-exists` keeps a missing .env from turning a hook into a hard
# failure (RS009 CR059).
MIRROR="node --no-warnings --env-file-if-exists=.env ts/src/frontDoor/cli.ts"

# Read stdin once; it can only be consumed once.
INPUT=$(cat)

# Extract the prompt text and session id.
PROMPT=$(printf '%s' "$INPUT" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('prompt',''))" 2>/dev/null || echo "")
SESSION_ID="${GEMINI_SESSION_ID:-}"
if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID=$(printf '%s' "$INPUT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null || echo "")
fi

# Skip skill invocations — they are commands, not conversational messages.
if [[ "$PROMPT" == /* ]]; then
  echo '{}'
  exit 0
fi

# Log the user turn (async-style: errors go to stderr, never block the turn).
if [[ -n "$PROMPT" && -n "$SESSION_ID" ]]; then
  ${MIRROR} conversation-logger log-user \
    "${SESSION_ID}" "${PROMPT}" --interface gemini_cli 2>/dev/null || true
fi

# Mirror Mode context injection.
# mirror load --context-only returns the identity block when Mirror Mode is
# active for this session, or exits silently when it is not.
CONTEXT=$(${MIRROR} mirror load \
  --context-only \
  --query "${PROMPT}" \
  --session-id "${SESSION_ID}" 2>/dev/null || echo "")

if [[ -n "$CONTEXT" ]]; then
  # Return the identity block as additionalContext for this turn.
  python3 -c "
import json, sys
context = sys.argv[1]
print(json.dumps({'hookSpecificOutput': {'additionalContext': context}}))
" "$CONTEXT"
else
  echo '{}'
fi
