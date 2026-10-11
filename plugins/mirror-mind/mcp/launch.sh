#!/usr/bin/env bash
# Mirror Mind plugin — MCP server launcher (CV22.DS9.TS2, DS9 decision D5;
# CV22.DS10.US3 plateau 3, decision D5).
#
# The manifest points here instead of at an engine, so the entry point can
# change without editing a plugin inside someone's runtime.
#
# A plugin is copied into Claude Code's own cache, so no relative path from
# this file reaches the Mirror tree. The launcher finds the installed `mirror`
# bin the way the plugin's hook wrappers find `mirror-hook`: MIRROR_BIN (the
# directory holding both, `$(npm prefix -g)/bin`), then the PATH, then the
# global bin directories a GUI launch leaves off it. Node is found the same
# way the wrappers find it, MIRROR_NODE first.
#
# Unlike a hook, a server that cannot start has no turn to protect: it says
# why on stderr, which is the client's log for this server, and exits 1.
# `runtime diagnose` reports a missing `mirror` from the caller's shell.
#
# No flags: `mirror mcp` reads configuration and silences `node:sqlite`'s
# ExperimentalWarning in-process (US3, D3), precisely because no MCP client
# will pass --no-warnings and stderr must stay the client's log.

set -u

ENTRY=""
[ -n "${MIRROR_BIN:-}" ] && [ -x "$MIRROR_BIN/mirror" ] && ENTRY="$MIRROR_BIN/mirror"
[ -n "$ENTRY" ] || ENTRY="$(command -v mirror 2>/dev/null || true)"
for candidate in "$HOME/.nvm/current/bin" /opt/homebrew/bin /usr/local/bin; do
  [ -n "$ENTRY" ] && break
  [ -x "$candidate/mirror" ] && ENTRY="$candidate/mirror"
done

if [ -z "$ENTRY" ]; then
  echo "mirror-mind: \`mirror\` not found on PATH; the MCP server cannot start. Install mirror-mind (npm install -g mirror-mind) or set MIRROR_BIN to its bin directory." >&2
  exit 1
fi

NODE="${MIRROR_NODE:-}"
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  NODE="$(command -v node 2>/dev/null || true)"
fi
for candidate in "$(dirname "$ENTRY")/node" "$HOME/.nvm/current/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -n "$NODE" ] && break
  [ -x "$candidate" ] && NODE="$candidate"
done

if [ -z "$NODE" ]; then
  echo "mirror-mind: node not found on PATH; the MCP server cannot start. Set MIRROR_NODE." >&2
  exit 1
fi

exec "$NODE" "$ENTRY" mcp
