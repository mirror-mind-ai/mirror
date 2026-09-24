#!/usr/bin/env bash
set -euo pipefail

# CV21.E2.S1 — Mirror Mind Claude plugin smoke test.
#
# Proves, against a fully isolated database, that:
#   1. the plugin manifest passes `claude plugin validate` (when claude is present);
#   2. the plugin lifecycle hooks fire, resolve their Node entry, and write to
#      the DB;
#   3. the user-prompt hook logs interface='claude_code';
#   4. the production database(s) are byte-for-byte unchanged.
#
# Live skill discovery inside a Claude session is a separate manual route (it
# needs an authenticated Claude session) — see the story test-guide.
#
# The hooks are Node since CV22.DS10.TS5 plateau 1, and each resolves its entry
# point relative to its own file. That is right inside this checkout and wrong
# for a plugin installed elsewhere until CV22.DS10.US3's npm `bin` -- the
# known window TS5 accepted, because CV22 releases once. So this smoke runs the
# IN-REPO plugin on purpose; it no longer needs an interpreter on PATH.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/mirror-mind"
HOOKS_DIR="$PLUGIN_DIR/hooks"

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

export MEMORY_ENV="production"
export MEMORY_DIR="$SANDBOX"
export DB_PATH="$SANDBOX/memory.db"
export DB_BACKUP_PATH="$SANDBOX/backups"
unset MIRROR_HOME MIRROR_USER 2>/dev/null || true

echo "Isolated DB: $DB_PATH"
echo "node -> $(command -v node)"

# --- 0. manifest validation (optional, when claude is installed) -----------
if command -v claude >/dev/null 2>&1; then
  claude plugin validate "$PLUGIN_DIR" >/dev/null || fail "claude plugin validate"
  echo "✓ claude plugin validate passed"
else
  echo "• claude not found — skipping manifest validation"
fi

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

CONTENT="$(sqlite3 "$DB_PATH" "SELECT content FROM messages WHERE role='user' ORDER BY created_at DESC LIMIT 1;")"
INTERFACE="$(sqlite3 "$DB_PATH" "SELECT interface FROM conversations ORDER BY started_at DESC LIMIT 1;")"
echo "Logged message: $CONTENT"
echo "Interface label: $INTERFACE"

[ "$CONTENT" = "$PROMPT" ] || fail "user message not logged to isolated DB"
[ "$INTERFACE" = "claude_code" ] || fail "interface label is not claude_code"

# --- 5. production DB guard: no smoke data leaked --------------------------
for db in "${PROD_DBS[@]}"; do
  leaked_msgs="$(sqlite3 "$db" "SELECT count(*) FROM messages WHERE content = '$PROMPT';" 2>/dev/null || echo ERR)"
  leaked_sess="$(sqlite3 "$db" "SELECT count(*) FROM runtime_sessions WHERE session_id = '$SESSION_ID';" 2>/dev/null || echo ERR)"
  { [ "$leaked_msgs" = "0" ] && [ "$leaked_sess" = "0" ]; } \
    || fail "smoke data leaked into production: $db (messages=$leaked_msgs sessions=$leaked_sess)"
done
echo "✓ no smoke data leaked into production (${#PROD_DBS[@]} db checked)"

echo "✅ Smoke test PASSED"
