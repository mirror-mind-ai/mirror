#!/usr/bin/env bash
# Mirror Mind — Gemini CLI SessionEnd hook
#
# Fires when the CLI exits or the session is cleared.
# Closes the conversation record (deferred extraction, like Pi) and runs backup.
#
# ⚠️  BEST-EFFORT: Gemini CLI exits without waiting for this hook to complete.
# All work here must be fast and resilient to termination. Extraction is
# deferred to the next SessionStart (same model as Pi).
#
# Gemini hook contract:
#   stdin  — JSON: { session_id, transcript_path, cwd, hook_event_name, timestamp, reason }
#   stdout — JSON (systemMessage shown to user if present; flow-control fields ignored)
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
SESSION_ID="${GEMINI_SESSION_ID:-}"
if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID=$(printf '%s' "$INPUT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null || echo "")
fi

if [[ -n "$SESSION_ID" ]]; then
  ${MIRROR} conversation-logger session-end-pi "${SESSION_ID}" 2>/dev/null || true
fi
${MIRROR} backup --silent 2>/dev/null || true

echo '{}'
