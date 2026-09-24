#!/usr/bin/env bash
set -euo pipefail

# Record marker for JSONL detection
MARKER=$(mktemp)
trap 'rm -f "$MARKER"' EXIT

cd "${CODEX_PROJECT_DIR:-$PWD}"

# 1. Session start
# We redirect to /dev/null to keep the output clean for Codex if needed,
# though here it's just a wrapper.
# Every Mirror call below enters the TypeScript front door (CV22.DS10.TS5):
# same routing, same front-door log, no interpreter.
MIRROR="node --no-warnings --env-file-if-exists=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/.env $(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/ts/src/frontDoor/cli.ts"

${MIRROR} conversation-logger session-start >/dev/null 2>&1 || true

# 2. Run Codex (blocks until user exits)
# Temporarily disable `set -e` so Mirror Mind can still run wrapper cleanup
# when Codex exits non-zero, for example after an MCP startup failure.
set +e
codex "$@"
EXIT_CODE=$?
set -e

# 3. Find JSONL written after our marker (for this cwd)
# Codex writes sessions to ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
# We search for files newer than our MARKER that contain our current PWD in session_meta.
SESSION_JSONL=$(find ~/.codex/sessions -name "*.jsonl" -newer "$MARKER" \
  -exec grep -l "\"cwd\":\"$PWD\"" {} + 2>/dev/null | sort | tail -1 || true)

# 4. Backfill + session end
if [[ -n "$SESSION_JSONL" ]]; then
  # Extract session ID from filename: rollout-YYYY-MM-DDTHH-mm-ss-<uuid>.jsonl
  SESSION_ID=$(basename "$SESSION_JSONL" .jsonl | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1)
  
  if [[ -n "$SESSION_ID" ]]; then
    ${MIRROR} conversation-logger backfill-codex-session \
      "$SESSION_JSONL" --interface codex >/dev/null 2>&1 || true

    ${MIRROR} conversation-logger session-end-pi \
      "${SESSION_ID}" >/dev/null 2>&1 || true
  fi
fi

# 5. Backup (silent)
${MIRROR} backup --silent >/dev/null 2>&1 || true

exit $EXIT_CODE
