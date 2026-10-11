#!/usr/bin/env bash
set -euo pipefail

# CV21.E2.S1 — Mirror Mind Claude plugin smoke test.
# CV22.DS10.US3 plateau 3 — run as an INSTALLED plugin, not an in-repo one.
#
# Proves, against a fully isolated database and a copy of the plugin placed
# where Claude Code would place it (its own cache, nowhere near the tree):
#   1. the plugin manifest passes `claude plugin validate` (when claude is present);
#   2. the plugin lifecycle hooks find `mirror-hook` on the PATH and write to
#      the DB -- the TS5 "hook window", closed by the bin-form wrappers (D5);
#   3. the user-prompt hook logs interface='claude_code';
#   4. the MCP launcher starts the server through the `mirror` bin it finds;
#   5. with `mirror-hook` REMOVED from the PATH, a hook still exits 0, lands
#      one line in <home>/hooks.log, and `mirror runtime diagnose` reports it
#      -- the silent stop is visible where the person looks;
#   6. the production database(s) are byte-for-byte unchanged.
#
# Live skill discovery inside a Claude session is a separate manual route (it
# needs an authenticated Claude session) — see the story test-guide.
#
# The bins on the scratch PATH are THIS checkout's `bin/mirror-hook.js` and
# `bin/mirror.js`, linked the way npm's global bin links them, so what runs is
# the tree under test. The real `npm`-installed layout is proven end to end
# by `smoke_npm_package.sh`.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_SRC="$REPO_ROOT/plugins/mirror-mind"

fail() {
  echo "❌ Smoke test FAILED: $1"
  exit 1
}

# --- production DB guard: enumerate live databases -------------------------
# Isolation is proven by asserting the smoke's UNIQUE test data never appears in
# any production DB. This is robust against ambient writes from a concurrently
# running Mirror session, which a whole-file checksum would misread as a leak.
shopt -s nullglob
PROD_DBS=("$HOME"/.mirror-minds/*/memory.db)

# --- isolated sandbox ------------------------------------------------------
SANDBOX="$(mktemp -d)"
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

REAL_NODE="$(command -v node)"
REAL_SQLITE="$(command -v sqlite3)"

# The plugin, where Claude Code would put it.
PLUGIN_DIR="$SANDBOX/claude-cache/plugins/mirror-mind"
mkdir -p "$(dirname "$PLUGIN_DIR")"
cp -R "$PLUGIN_SRC" "$PLUGIN_DIR"
HOOKS_DIR="$PLUGIN_DIR/hooks"

# A scratch global bin, as npm lays one out: symlinks to the package's bins.
BIN="$SANDBOX/bin"
mkdir -p "$BIN"
ln -s "$REPO_ROOT/bin/mirror-hook.js" "$BIN/mirror-hook"
ln -s "$REPO_ROOT/bin/mirror.js" "$BIN/mirror"
ln -s "$REAL_NODE" "$BIN/node"
ln -s "$REAL_SQLITE" "$BIN/sqlite3"

# A scratch HOME whose config file names the sandbox as the mirror home: the
# wrappers and the entry resolve it from there, as an npm user's would (D3).
# The checkout's .env is still read by the entry (its tree has one), so its
# MIRROR_USER is blanked in the environment, which outranks every file.
export HOME="$SANDBOX/home"
mkdir -p "$HOME/.config/mirror"
printf 'MIRROR_HOME=%s\n' "$SANDBOX/mirror-home" > "$HOME/.config/mirror/env"
export MEMORY_ENV="production"
export MIRROR_USER=""
unset MIRROR_HOME MIRROR_BIN MIRROR_NODE NODE_OPTIONS XDG_CONFIG_HOME 2>/dev/null || true
DB_PATH="$SANDBOX/mirror-home/memory.db"
HOOKS_LOG="$SANDBOX/mirror-home/hooks.log"

echo "Plugin copy : $PLUGIN_DIR"
echo "Isolated DB : $DB_PATH"
echo "node        -> $REAL_NODE"

# --- 0. manifest validation (optional, when claude is installed) -----------
if command -v claude >/dev/null 2>&1; then
  claude plugin validate "$PLUGIN_DIR" >/dev/null || fail "claude plugin validate"
  echo "✓ claude plugin validate passed"
else
  echo "• claude not found — skipping manifest validation"
fi

# --- from here on: only the scratch bin, and the shell's basics -------------
export PATH="$BIN:/usr/bin:/bin"
cd "$SANDBOX"

# --- 1. SessionStart hook --------------------------------------------------
bash "$HOOKS_DIR/session-start.sh" || fail "session-start hook exited non-zero"
echo "✓ session-start hook fired"

# --- 2. UserPromptSubmit (logging) hook ------------------------------------
SESSION_ID="smoke-claude-plugin-$$"
PROMPT="Claude plugin smoke test — $SESSION_ID"
printf '{"session_id":"%s","prompt":"%s"}' "$SESSION_ID" "$PROMPT" \
  | bash "$HOOKS_DIR/log-user-prompt.sh" || fail "log-user-prompt hook exited non-zero"
echo "✓ log-user-prompt hook fired"

# --- 3. SessionEnd hook ----------------------------------------------------
printf '{"session_id":"%s","transcript_path":"%s"}' "$SESSION_ID" "$SANDBOX/none.jsonl" \
  | bash "$HOOKS_DIR/log-session-end.sh" || fail "log-session-end hook exited non-zero"
echo "✓ log-session-end hook fired"

# --- 4. verify the isolated DB --------------------------------------------
[ -f "$DB_PATH" ] || fail "no isolated database was created"
[ ! -f "$HOOKS_LOG" ] || fail "a hook recorded a failure: $(cat "$HOOKS_LOG")"

CONTENT="$(sqlite3 "$DB_PATH" "SELECT content FROM messages WHERE role='user' ORDER BY created_at DESC LIMIT 1;")"
INTERFACE="$(sqlite3 "$DB_PATH" "SELECT interface FROM conversations ORDER BY started_at DESC LIMIT 1;")"
echo "Logged message: $CONTENT"
echo "Interface label: $INTERFACE"

[ "$CONTENT" = "$PROMPT" ] || fail "user message not logged to isolated DB"
[ "$INTERFACE" = "claude_code" ] || fail "interface label is not claude_code"
echo "✓ the installed plugin's hooks reached the configured home through mirror-hook"

# --- 5. the MCP launcher, from the plugin copy ------------------------------
INIT_REPLY="$(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"plugin-smoke","version":"0"}}}' \
  | bash "$PLUGIN_DIR/mcp/launch.sh" 2>"$SANDBOX/mcp.err" | head -1)"
case "$INIT_REPLY" in
  *'"serverInfo"'*'"mirror-mind"'*) echo "✓ the MCP launcher started the server through the mirror bin" ;;
  *) fail "MCP initialize did not answer: $INIT_REPLY $(cat "$SANDBOX/mcp.err")" ;;
esac
[ ! -s "$SANDBOX/mcp.err" ] || fail "the MCP server wrote to stderr: $(cat "$SANDBOX/mcp.err")"

# --- 6. package mode with mirror-hook GONE: not silent ----------------------
# The posture the second panel pass asked for: "never fail the turn" is right
# for the turn and wrong for the product when nobody reads hooks.log. So the
# failure must be visible where the person looks -- `runtime diagnose`.
rm "$BIN/mirror-hook"
printf '{"session_id":"%s","prompt":"after removal"}' "$SESSION_ID" \
  | bash "$HOOKS_DIR/log-user-prompt.sh" || fail "a hook failed the turn when mirror-hook was missing"
[ -f "$HOOKS_LOG" ] || fail "no hooks.log line after mirror-hook went missing"
grep -q "claude:user-prompt: mirror-hook not found on PATH" "$HOOKS_LOG" \
  || fail "hooks.log does not name the missing bin: $(cat "$HOOKS_LOG")"
echo "✓ with mirror-hook gone: turn not failed, one line in hooks.log"

DIAGNOSE="$(mirror runtime diagnose 2>&1 || true)"
case "$DIAGNOSE" in
  *"hook_failures_recorded"*|*"hook failure(s)"*) echo "✓ runtime diagnose reports the hook failure" ;;
  *) fail "runtime diagnose does not report the hook failure:
$DIAGNOSE" ;;
esac
case "$DIAGNOSE" in
  *"after removal"*) fail "diagnose leaked the prompt" ;;
esac

# --- 7. production DB guard: no smoke data leaked --------------------------
# `${arr[@]+...}`: bash 3.2 -- macOS's /bin/bash -- treats an EMPTY array as
# unbound under `set -u`, and with the EXIT trap above the abort exits 0, so a
# machine with no production home skipped this check and still "passed".
for db in ${PROD_DBS[@]+"${PROD_DBS[@]}"}; do
  leaked_msgs="$(sqlite3 "$db" "SELECT count(*) FROM messages WHERE content = '$PROMPT';" 2>/dev/null || echo ERR)"
  leaked_sess="$(sqlite3 "$db" "SELECT count(*) FROM runtime_sessions WHERE session_id = '$SESSION_ID';" 2>/dev/null || echo ERR)"
  { [ "$leaked_msgs" = "0" ] && [ "$leaked_sess" = "0" ]; } \
    || fail "smoke data leaked into production: $db (messages=$leaked_msgs sessions=$leaked_sess)"
done
echo "✓ no smoke data leaked into production (${#PROD_DBS[@]} db checked)"

echo "✅ Smoke test PASSED"
