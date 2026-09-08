#!/usr/bin/env bash
# Mirror Mind — Gemini CLI SessionStart hook
#
# Fires on startup, session resume, and /clear.
# Unmutes logging, closes stale orphan conversations, and extracts pending
# memories from any conversations that ended without extraction.
#
# Gemini hook contract:
#   stdin  — JSON: { session_id, transcript_path, cwd, hook_event_name, timestamp, source }
#   stdout — JSON response (empty object = no special action)
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

${MIRROR} conversation-logger session-start >/dev/null 2>&1 || true

echo '{}'
