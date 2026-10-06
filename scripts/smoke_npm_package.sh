#!/usr/bin/env bash
# CV22.DS10.US3 — the install from nothing.
#
# Packs this repository, installs the tarball into a scratch npm prefix, and
# then -- with PATH holding only that prefix's bin and the tools the smoke
# itself needs, HOME pointing at a scratch directory, and no checkout in sight
# -- runs the commands a person runs first: `mirror init`, `mirror seed`,
# `mirror list personas`, `mirror runtime status`, and an open of a database
# that needs migration 017, so migrate-on-open, the bootstrap lock, and the
# pre-write snapshot all run FROM THE PACKAGE LOCATION. Nothing run inside
# this repository can stand in for it: the story's subject is an install with
# no checkout, and every one of these used to assume one.
#
# Isolation, absolute:
#   * a scratch prefix (`npm install -g --prefix`), never the real global root
#   * a scratch HOME, so `~/.config/mirror/env` and `~/.mirror-minds` are the
#     smoke's own and nothing of the Navigator's is read or written
#   * the checkout's `.env` is unreachable: the package has none, and the
#     front door locates its tree from its own entry file
#   * python/python3/uv shadowed with stubs that exit 66, so an interpreter
#     spawn FAILS the smoke rather than passing unnoticed
#
# The real npm, node, sqlite3 paths are captured BEFORE PATH is replaced
# (US2's lesson: the stubs would otherwise shadow the tools the smoke needs).
#
# Plateau 1 shipped the first half (install, init, seed, list, status, the
# migrating open). Plateau 3 adds the four runtimes' payloads against the
# INSTALLED wrappers and `mirror mcp`: the Claude plugin copied out of the
# package as Claude Code copies it, the Gemini wrappers and the Codex wrapper
# run from under `npm root -g` -- below node_modules, where only the loader
# shim can run the TypeScript entry (D15) -- and the MCP server through the
# plugin's launcher and through `mirror mcp` directly.
#
# Usage:  scripts/smoke_npm_package.sh [workdir]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORK="${1:-/tmp/mirror-npm-package-smoke}"
PASS=0
FAIL=0

REAL_NPM="$(command -v npm)"
REAL_NODE="$(command -v node)"
REAL_SQLITE="$(command -v sqlite3 || true)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected '$3', got '$2')"; fi; }
contains() { case "$2" in *"$3"*) ok "$1" ;; *) bad "$1 (missing '$3')"; printf '%s\n' "$2" | sed 's/^/      | /' | head -20 ;; esac; }

cleanup() { [ "${KEEP_SMOKE_WORKDIR:-0}" = "1" ] || rm -rf "$WORK"; }
trap cleanup EXIT

rm -rf "$WORK"
mkdir -p "$WORK/stubs" "$WORK/prefix" "$WORK/home" "$WORK/bin"
chmod 700 "$WORK/home"

# --- the interpreter stubs, and the few real tools the smoke needs --------
for bin in python python3 uv; do
  cat > "$WORK/stubs/$bin" <<STUB
#!/bin/sh
echo "INTERPRETER SPAWNED: $bin \$*" >&2
exit 66
STUB
  chmod +x "$WORK/stubs/$bin"
done
ln -s "$REAL_NODE" "$WORK/bin/node"
[ -n "$REAL_SQLITE" ] && ln -s "$REAL_SQLITE" "$WORK/bin/sqlite3"

# --- 1. pack and install -----------------------------------------------------
say "1. npm pack, then install into a scratch prefix"
TARBALL="$(cd "$ROOT_DIR" && "$REAL_NPM" pack --pack-destination "$WORK" 2>/dev/null | tail -1)"
[ -f "$WORK/$TARBALL" ] && ok "packed $TARBALL" || { bad "npm pack produced nothing"; exit 1; }
if "$REAL_NPM" install -g --prefix "$WORK/prefix" "$WORK/$TARBALL" >"$WORK/install.log" 2>&1; then
  ok "installed into the scratch prefix"
else
  bad "install failed"; cat "$WORK/install.log"; exit 1
fi
PKG="$WORK/prefix/lib/node_modules/mirror-mind"
[ -f "$PKG/package.json" ] && ok "the package sits at <prefix>/lib/node_modules/mirror-mind" || bad "package not found at $PKG"
[ -f "$PKG/ts/src/frontDoor/cli.ts" ] && ok "the front door has the same path as in the checkout" || bad "front door missing"
[ -d "$PKG/templates/identity" ] && ok "templates/identity shipped" || bad "templates missing"
[ ! -f "$PKG/.env" ] && ok "no .env in the package" || bad "the package carries a .env"
[ -z "$(find "$PKG" -name '*.py' -o -name 'pyproject.toml' -o -name 'uv.lock' | head -1)" ] && ok "no Python in the installed tree" || bad "Python found in the installed tree"

# --- from here on: no checkout, no real HOME, interpreters shadowed ---------
export PATH="$WORK/stubs:$WORK/prefix/bin:$WORK/bin:/usr/bin:/bin"
export HOME="$WORK/home"
unset MIRROR_HOME MIRROR_USER MEMORY_DIR DB_PATH MEMORY_ENV NODE_OPTIONS XDG_CONFIG_HOME
cd "$WORK/home"

say "2. mirror is on the PATH, from the install, with nothing else set"
check "command -v mirror" "$(command -v mirror)" "$WORK/prefix/bin/mirror"
BARE="$(mirror 2>&1 || true)"
contains "bare mirror, no user yet: the orientation, not the usage dump" "$BARE" "No user configured yet."
contains "the orientation names init" "$BARE" "Run: mirror init <your-name>"
contains "the orientation names the config file" "$BARE" "Configuration will live at: $HOME/.config/mirror/env"
VERSION_OUT="$(mirror runtime version 2>"$WORK/version.err" || true)"
contains "runtime version answers" "$VERSION_OUT" "Version: "
check "runtime version writes nothing to stderr (no ExperimentalWarning, no .env needed)" "$(wc -c <"$WORK/version.err" | tr -d ' ')" "0"

say "3. mirror init from an empty home"
contains "the package carries the operating instructions (D13)" "$(head -1 "$PKG/AGENTS.md")" "Mirror Mind"
[ ! -f "$PKG/CLAUDE.md" ] && ok "and not the repository's project context" || bad "CLAUDE.md shipped"
INIT_OUT="$(mirror init smokeuser 2>"$WORK/init.err")"; INIT_CODE=$?
check "init exit code" "$INIT_CODE" "0"
contains "init created the modern home" "$INIT_OUT" "Created user home: $HOME/.mirror-minds/smokeuser"
CONFIG="$HOME/.config/mirror/env"
[ -f "$CONFIG" ] && ok "config file written at $CONFIG" || bad "no config file at $CONFIG"
check "config file holds MIRROR_USER" "$(cat "$CONFIG")" "MIRROR_USER=smokeuser"
# GNU stat first: on BSD `stat -c` fails and the `-f '%Lp'` form answers; on GNU
# `stat -f` is FILESYSTEM status, exits 0, and would answer the wrong thing.
mode_of() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
check "config file is 0600" "$(mode_of "$CONFIG")" "600"
check "config directory is 0700" "$(mode_of "$HOME/.config/mirror")" "700"
contains "init says where the key goes" "$INIT_OUT" "OPENROUTER_API_KEY"
[ -f "$HOME/.mirror-minds/smokeuser/identity/self/soul.yaml" ] && ok "identity templates copied" || bad "identity not copied"

BARE_AFTER="$(mirror 2>&1 || true)"
contains "bare mirror, user configured: the usage" "$BARE_AFTER" "Usage: mirror <command> [args]"

say "4. mirror seed, resolving the user from the config file alone"
set +e
SEED_OUT="$(mirror seed 2>"$WORK/seed.err")"; SEED_CODE=$?
set -e
[ -f "$HOME/.mirror-minds/smokeuser/memory.db" ] && ok "memory.db created in the user's home" || bad "no memory.db"
contains "seed created the 19 template entries" "$SEED_OUT" "Result: 19 created"
# Known finding (US3 F1), named here so the day it is fixed this line fails
# and gets updated: the shipped `ego/constraints.yaml` template is empty on
# purpose, and seed reports empty content as an error, so a fresh seed exits 1
# with exactly that one error on every machine, checkout or package alike.
contains "seed's only error is the known empty ego/constraints template (F1)" "$SEED_OUT" "Errors: 1
  - ego/constraints: empty content"
check "seed exit code is 1 because of F1 alone" "$SEED_CODE" "1"
check "seed writes nothing to stderr" "$(wc -c <"$WORK/seed.err" | tr -d ' ')" "0"
LIST_OUT="$(mirror list personas 2>"$WORK/list.err")"
PERSONAS="$(printf '%s\n' "$LIST_OUT" | grep -c '^  [a-z]' || true)"
[ "$PERSONAS" -ge 12 ] && ok "list personas shows $PERSONAS personas" || bad "list personas shows $PERSONAS personas (expected 12 or more)"
check "list personas writes nothing to stderr" "$(wc -c <"$WORK/list.err" | tr -d ' ')" "0"

say "5. mirror runtime status from the package"
STATUS_OUT="$(mirror runtime status 2>&1 || true)"
contains "status names the version" "$STATUS_OUT" "Version: "
contains "status names the home" "$STATUS_OUT" "Mirror home: $HOME/.mirror-minds/smokeuser"
contains "status sees the database" "$STATUS_OUT" "Database exists: yes"
# Plateau 4 (§E) makes status print `Install kind: package (mirror-mind@<version>)`;
# the assertion joins this smoke there.

say "6. a database that needs migration 017, opened through the installed package"
if [ -z "$REAL_SQLITE" ]; then
  printf '  \033[33m-\033[0m sqlite3 unavailable; the migrating open is skipped\n'
else
  DEMO="$WORK/demo-memory.db"
  (cd "$ROOT_DIR" && PATH="$WORK/bin:/usr/bin:/bin" "$REAL_NODE" --no-warnings ts/smoke/generate_demo_memory_db.ts --out "$DEMO" >/dev/null)
  mkdir -p "$HOME/.mirror-minds/legacy" && chmod 700 "$HOME/.mirror-minds/legacy"
  cp "$DEMO" "$HOME/.mirror-minds/legacy/memory.db"
  sqlite3 "$HOME/.mirror-minds/legacy/memory.db" \
    "DROP INDEX IF EXISTS idx_identity_parent_journey; ALTER TABLE identity DROP COLUMN parent_journey; DELETE FROM _migrations WHERE id='017_journey_parent_column';"
  check "precondition: 017 pending" "$(sqlite3 "$HOME/.mirror-minds/legacy/memory.db" "SELECT count(*) FROM _migrations WHERE id='017_journey_parent_column'")" "0"
  OPEN_OUT="$(MIRROR_USER=legacy mirror journeys 2>"$WORK/open.err")"; OPEN_CODE=$?
  check "the front door served the legacy database (exit 0)" "$OPEN_CODE" "0"
  check "017 applied on open" "$(sqlite3 "$HOME/.mirror-minds/legacy/memory.db" "SELECT count(*) FROM _migrations WHERE id='017_journey_parent_column'")" "1"
  [ -f "$HOME/.mirror-minds/legacy/backups/frontdoor-pre-migration-backup.db" ] && ok "pre-migration snapshot landed in the mirror home" || bad "no pre-migration snapshot"
  grep -q migrate_on_open "$HOME/.mirror-minds/legacy/front-door.log" 2>/dev/null && ok "front-door log records migrate_on_open" || bad "front-door log lacks migrate_on_open"
fi

# --- the four runtimes, against the installed package -------------------------
# Each hook resolves the home from the config file `init` wrote (MIRROR_USER=
# smokeuser): the environment carries no Mirror variable, and the package has
# no .env to read. Every row below lands in smokeuser's memory.db.
SMOKE_DB="$HOME/.mirror-minds/smokeuser/memory.db"
HOOKS_LOG="$HOME/.mirror-minds/smokeuser/hooks.log"
rows() { [ -n "$REAL_SQLITE" ] && sqlite3 "$SMOKE_DB" "$1" || echo "n/a"; }

say "8. the Claude plugin, copied out of the package, through mirror-hook on the PATH"
CLAUDE_PLUGIN="$WORK/claude-cache/plugins/mirror-mind"
mkdir -p "$(dirname "$CLAUDE_PLUGIN")" && cp -R "$PKG/plugins/mirror-mind" "$CLAUDE_PLUGIN"
check "command -v mirror-hook" "$(command -v mirror-hook)" "$WORK/prefix/bin/mirror-hook"
bash "$CLAUDE_PLUGIN/hooks/session-start.sh" </dev/null >"$WORK/claude-start.out" 2>"$WORK/claude.err" && ok "plugin session-start exited 0" || bad "plugin session-start failed"
printf '{"session_id":"npm-claude","prompt":"Hello from the installed plugin"}' \
  | bash "$CLAUDE_PLUGIN/hooks/log-user-prompt.sh" >/dev/null 2>>"$WORK/claude.err" && ok "plugin log-user-prompt exited 0" || bad "plugin log-user-prompt failed"
printf '{"session_id":"npm-claude","prompt":"anything"}' \
  | bash "$CLAUDE_PLUGIN/hooks/mirror-inject.sh" >"$WORK/claude-inject.out" 2>>"$WORK/claude.err" && ok "plugin mirror-inject exited 0" || bad "plugin mirror-inject failed"
printf '{"session_id":"npm-claude","transcript_path":"%s"}' "$WORK/none.jsonl" \
  | bash "$CLAUDE_PLUGIN/hooks/log-session-end.sh" >/dev/null 2>>"$WORK/claude.err" && ok "plugin log-session-end exited 0" || bad "plugin log-session-end failed"
check "the plugin's hooks wrote nothing to stderr" "$(wc -c <"$WORK/claude.err" | tr -d ' ')" "0"
# D13: the session opened in a project that is not this tree, so SessionStart
# hands Claude Code the Operating Instructions from the installed package.
contains "plugin session-start delivers the Operating Instructions as context (D13)" "$(cat "$WORK/claude-start.out")" '"hookEventName":"SessionStart","additionalContext":"'
contains "and they are the package's AGENTS.md" "$(cat "$WORK/claude-start.out")" "$(head -1 "$PKG/AGENTS.md")"
[ -n "$REAL_SQLITE" ] && check "the user turn reached smokeuser's database as claude_code" \
  "$(rows "SELECT c.interface || '|' || m.content FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.content = 'Hello from the installed plugin'")" \
  "claude_code|Hello from the installed plugin"

say "9. the Gemini CLI wrappers, run from under npm root -g"
GEMINI_HOOKS="$PKG/.gemini/hooks"
GEMINI_ENV="GEMINI_PROJECT_DIR=$WORK/home GEMINI_SESSION_ID="
env $GEMINI_ENV bash "$GEMINI_HOOKS/session-start.sh" </dev/null >"$WORK/gemini-start.out" 2>"$WORK/gemini.err" && ok "gemini session-start exited 0" || bad "gemini session-start failed"
contains "gemini session-start delivers the Operating Instructions as context (D13)" "$(cat "$WORK/gemini-start.out")" '"hookEventName":"SessionStart","additionalContext":"'
printf '{"session_id":"npm-gemini","hook_event_name":"BeforeAgent","prompt":"Hello from the installed Gemini wrappers"}' \
  | env $GEMINI_ENV bash "$GEMINI_HOOKS/log-user.sh" >"$WORK/gemini-user.out" 2>>"$WORK/gemini.err" && ok "gemini log-user exited 0" || bad "gemini log-user failed"
printf '{"session_id":"npm-gemini","hook_event_name":"AfterAgent","prompt":"Hello from the installed Gemini wrappers","prompt_response":"Answered from the package","stop_hook_active":false}' \
  | env $GEMINI_ENV bash "$GEMINI_HOOKS/log-assistant.sh" >"$WORK/gemini-assistant.out" 2>>"$WORK/gemini.err" && ok "gemini log-assistant exited 0" || bad "gemini log-assistant failed"
check "gemini AfterAgent answers the empty hook object" "$(cat "$WORK/gemini-assistant.out")" "{}"
printf '{"session_id":"npm-gemini","hook_event_name":"SessionEnd"}' \
  | env $GEMINI_ENV bash "$GEMINI_HOOKS/session-end.sh" >/dev/null 2>>"$WORK/gemini.err" && ok "gemini session-end exited 0" || bad "gemini session-end failed"
# Gemini's stderr is "logs only; never parsed": the Mirror Mode status line
# from `mirror load` lands there by design. What must not is a warning or an error.
if grep -qiE "warning|error" "$WORK/gemini.err"; then bad "the gemini wrappers wrote a warning or error to stderr: $(cat "$WORK/gemini.err")"; else ok "the gemini wrappers wrote no warning or error to stderr"; fi
[ -n "$REAL_SQLITE" ] && check "both Gemini turns reached the database as gemini_cli" \
  "$(rows "SELECT group_concat(c.interface || '|' || m.role, ',') FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.content IN ('Hello from the installed Gemini wrappers','Answered from the package') ORDER BY m.created_at")" \
  "gemini_cli|user,gemini_cli|assistant"

say "10. the Codex wrapper, run from under npm root -g, around a stand-in codex"
CODEX_SESSION="019d3b75-0462-7762-ac7c-4852a85ce725"
cat > "$WORK/bin/codex" <<STUB
#!/bin/sh
dir="\$HOME/.codex/sessions/2026/10/06"
mkdir -p "\$dir"
cat > "\$dir/rollout-2026-10-06T10-00-00-$CODEX_SESSION.jsonl" <<EOF
{"timestamp":"2026-10-06T10:00:00.000Z","type":"session_meta","payload":{"id":"$CODEX_SESSION","timestamp":"2026-10-06T10:00:00.000Z","cwd":"\$PWD"}}
{"timestamp":"2026-10-06T10:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"Hello from the installed Codex wrapper"}}
{"timestamp":"2026-10-06T10:00:02.000Z","type":"event_msg","payload":{"type":"agent_message","message":"Codex answered from the package"}}
EOF
exit 0
STUB
chmod +x "$WORK/bin/codex"
mkdir -p "$WORK/project"
(cd "$WORK/project" && bash "$PKG/scripts/codex-mirror.sh" >/dev/null 2>"$WORK/codex.err") && ok "codex-mirror.sh exited with codex's 0" || bad "codex-mirror.sh failed: $(cat "$WORK/codex.err")"
[ -n "$REAL_SQLITE" ] && check "both Codex turns reached the database as codex" \
  "$(rows "SELECT group_concat(c.interface || '|' || m.role, ',') FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.content IN ('Hello from the installed Codex wrapper','Codex answered from the package') ORDER BY m.created_at")" \
  "codex|user,codex|assistant"

say "11. the MCP server, through the plugin's launcher and through mirror mcp"
MCP_INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"npm-smoke","version":"0"}}}'
LAUNCH_REPLY="$(printf '%s\n' "$MCP_INIT" | bash "$CLAUDE_PLUGIN/mcp/launch.sh" 2>"$WORK/mcp-launch.err" | head -1)"
contains "the installed plugin's launcher started the server" "$LAUNCH_REPLY" '"name": "mirror-mind"'
check "the launcher's server wrote nothing to stderr" "$(wc -c <"$WORK/mcp-launch.err" | tr -d ' ')" "0"
DIRECT_REPLY="$(printf '%s\n' "$MCP_INIT" | mirror mcp 2>"$WORK/mcp-direct.err" | head -1)"
contains "mirror mcp answers initialize" "$DIRECT_REPLY" '"name": "mirror-mind"'
check "mirror mcp wrote nothing to stderr" "$(wc -c <"$WORK/mcp-direct.err" | tr -d ' ')" "0"

say "12. no hook recorded a failure"
if [ -f "$HOOKS_LOG" ]; then bad "hooks.log exists: $(cat "$HOOKS_LOG")"; else ok "no hooks.log in smokeuser's home"; fi

say "13. nothing reached for an interpreter"
if grep -rq "INTERPRETER SPAWNED" "$WORK"/*.err 2>/dev/null; then
  bad "an interpreter was spawned"; grep -rh "INTERPRETER SPAWNED" "$WORK"/*.err
else
  ok "no python, python3, or uv process was spawned"
fi

say "Result"
printf '  passed: %d   failed: %d\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
