#!/bin/bash
# Mirror Mind plugin — MCP server launcher (CV22.DS9.TS2, DS9 decision D5).
#
# The manifest points here instead of at an engine, so the engine can be
# reverted without editing an installed plugin. A revert that requires editing
# a plugin inside someone's runtime is not one they can perform under pressure.
#
# MIRROR_TS_MCP=0  -> the Python server (the pre-CV22.DS9 behavior, unchanged)
# anything else    -> the TypeScript server
#
# The gate parses exactly as the front door's `MIRROR_TS_*` gates do
# (ts/src/frontDoor/routing.ts): only "0" reverts.
#
# DS10 deletes this file: npm gives the manifest a real entry point, and the
# Python server it falls back to no longer exists.

set -u

# Resolve the repository from THIS FILE, never from the cwd. An MCP client
# spawns the server from whatever directory the session is in, and CV21's plugin
# contract forbids a repo-cwd assumption. This is the same trick Python's
# config.py uses to find .env: walk from __file__, not from where you were run.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

# The gate is also honored from .env, because that is where the user already
# keeps every other MIRROR_TS_* revert — the front door reads them after node
# loads the file, but this script decides before node exists. Parsed with grep,
# never sourced: sourcing .env would execute whatever it contains, and it holds
# the OpenRouter key.
gate_from_env_file() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E '^[[:space:]]*MIRROR_TS_MCP[[:space:]]*=' "$ENV_FILE" \
    | tail -n 1 \
    | sed -E 's/^[[:space:]]*MIRROR_TS_MCP[[:space:]]*=[[:space:]]*//; s/[[:space:]]*$//' \
    | tr -d '"'"'"
}

# Process environment wins over the file — Node's --env-file precedence and
# Python's os.environ.setdefault behave the same way, so all three agree.
GATE="${MIRROR_TS_MCP-}"
if [ -z "$GATE" ]; then
  GATE="$(gate_from_env_file)"
fi

if [ "$GATE" = "0" ]; then
  # exec, not spawn: no intermediary process to orphan, no signals to forward,
  # and the PID the client holds is the server's.
  #
  # This restores CV21's contract exactly as the manifest had it — which assumes
  # `memory` is installed and importable. Where it is not, this fails with
  # ModuleNotFoundError, and that is the status quo being reverted to, not a
  # regression introduced here.
  exec python3 -m memory mcp
fi

# --env-file-if-exists: a fresh clone without .env still starts, and variables
# already in the client's environment outrank the file. NODE_OPTIONS is
# deliberately not set — main.ts suppresses node:sqlite's ExperimentalWarning
# in-process precisely because no MCP client will pass --no-warnings.
exec node --env-file-if-exists="$ENV_FILE" "$REPO_ROOT/ts/src/mcp/main.ts"
