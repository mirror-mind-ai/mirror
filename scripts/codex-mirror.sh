#!/usr/bin/env bash
# Run Codex with Mirror Mind logging around it.
#
# Codex has no hook system, so this wraps the `codex` command: session start
# before it, and after it the JSONL Codex wrote is imported, the session is
# closed, and a silent backup is taken.
#
# Every Mirror call goes through a generated hook wrapper under
# scripts/codex-hooks/, the way every other runtime's hooks do (CV22.DS10.TS5
# handoff review, finding N3). The wrappers resolve Node explicitly, never fail
# the session, and record anything they could not do in <mirror home>/hooks.log.
# This script used to call the front door itself, as a command held in a string
# that a checkout path with a space split in two -- silently.
set -euo pipefail

HOOKS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/codex-hooks"

# The marker's mtime is how the session this run wrote is told from older ones.
MARKER="$(mktemp)"
trap 'rm -f "$MARKER"' EXIT

cd "${CODEX_PROJECT_DIR:-$PWD}"

# 1. Session start.
bash "$HOOKS/session-start.sh" </dev/null >/dev/null 2>&1 || true

# 2. Codex itself, until the user exits. `set -e` is off around it so the
# wrap-up below still runs when Codex exits non-zero -- after an MCP startup
# failure, for example -- and its exit code is still the script's.
set +e
codex "$@"
EXIT_CODE=$?
set -e

# 3. The JSONL Codex wrote after the marker for this directory, if any:
# ~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl.
SESSION_JSONL="$(find ~/.codex/sessions -name "*.jsonl" -newer "$MARKER" \
  -exec grep -l "\"cwd\":\"$PWD\"" {} + 2>/dev/null | sort | tail -1 || true)"
SESSION_ID=""
if [[ -n "$SESSION_JSONL" ]]; then
  SESSION_ID="$(basename "$SESSION_JSONL" .jsonl \
    | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1 || true)"
fi

# 4. Import and close the session when there is one, then the silent backup.
bash "$HOOKS/session-end.sh" "$SESSION_JSONL" "$SESSION_ID" </dev/null >/dev/null 2>&1 || true

exit "$EXIT_CODE"
