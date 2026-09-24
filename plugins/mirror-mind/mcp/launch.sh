#!/bin/bash
# Mirror Mind plugin — MCP server launcher (CV22.DS9.TS2, DS9 decision D5).
#
# The manifest points here instead of at an engine, so the entry point can
# change without editing a plugin inside someone's runtime.
#
# CV22.DS10.TS5 removed the MIRROR_TS_MCP gate and the Python branch it chose
# between. The gate existed so DS9's cutover could be reverted to the Python
# server without editing an installed plugin; there is no Python server to
# revert to any more, and a gate that can only select a missing engine is worse
# than no gate -- it turns a stale value in someone's .env into a dead server.
#
# `runtime diagnose` reports any leftover MIRROR_TS_* variable as inert.
#
# US3 replaces this file with the npm entry point the manifest can name
# directly.

set -u

# Resolve the repository from THIS FILE, never from the cwd. An MCP client
# spawns the server from whatever directory the session is in, and CV21's
# plugin contract forbids a repo-cwd assumption.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd -P)"
ENV_FILE="$REPO_ROOT/.env"

# --env-file-if-exists: a fresh clone without .env still starts, and variables
# already in the client's environment outrank the file. NODE_OPTIONS is
# deliberately not set -- main.ts suppresses node:sqlite's ExperimentalWarning
# in-process precisely because no MCP client will pass --no-warnings.
exec node --env-file-if-exists="$ENV_FILE" "$REPO_ROOT/ts/src/mcp/main.ts"
