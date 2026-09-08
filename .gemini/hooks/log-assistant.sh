#!/usr/bin/env bash
# Mirror Mind — Gemini CLI AfterAgent hook
#
# Fires when the agent loop ends (final response ready).
# Logs the assistant turn to the memory database.
#
# Gemini hook contract:
#   stdin  — JSON: { session_id, transcript_path, cwd, hook_event_name, timestamp,
#                    prompt, prompt_response, stop_hook_active }
#   stdout — JSON (empty object = no action; we never retry or halt here)
#   stderr — logs only; never parsed

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

INPUT=$(cat)

# Extract the assistant response text and session id.
RESPONSE=$(printf '%s' "$INPUT" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('prompt_response',''))" 2>/dev/null || echo "")
SESSION_ID="${GEMINI_SESSION_ID:-}"
if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID=$(printf '%s' "$INPUT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null || echo "")
fi

if [[ -n "$RESPONSE" && -n "$SESSION_ID" ]]; then
  ${MIRROR} conversation-logger log-assistant \
    "${SESSION_ID}" "${RESPONSE}" --interface gemini_cli 2>/dev/null || true
fi

echo '{}'
