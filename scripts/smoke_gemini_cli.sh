#!/usr/bin/env bash
# Gemini CLI integration smoke test
#
# Simulates the four Gemini CLI hook events against an isolated database.
# Verifies that:
#   - session-start runs without error
#   - user turns are logged with interface='gemini_cli'
#   - assistant turns are logged with interface='gemini_cli'
#   - session-end-pi closes the conversation
#   - the production database is NOT touched
#
# Usage:
#   ./scripts/smoke_gemini_cli.sh [SMOKE_HOME]
#
# SMOKE_HOME defaults to /tmp/mirror-gemini-smoke

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SMOKE_HOME="${1:-/tmp/mirror-gemini-smoke}"
SMOKE_DB="${SMOKE_HOME}/memory.db"
FAKE_SESSION_ID="smoke-gemini-$(date +%s%3N)"

# ── Guards ──────────────────────────────────────────────────────────────────

echo "== Gemini CLI smoke test =="
echo "   smoke home : $SMOKE_HOME"
echo "   fake session: $FAKE_SESSION_ID"
echo

# Production DB guard: record checksum of the real production DB before the test.
# Ask the core to resolve the path (reads .env / MIRROR_HOME / MIRROR_USER and the
# ~/.mirror-minds default with legacy ~/.mirror fallback) so this guard protects the
# actual production DB regardless of home-directory naming. Must run before the
# DB_PATH/MEMORY_ENV exports below. Empty on failure → guard degrades to a no-op.
PROD_DB="$(cd "$ROOT_DIR" && uv run python -c \
  'from memory.config import resolve_mirror_home, default_db_path_for_home; print(default_db_path_for_home(resolve_mirror_home()))' \
  2>/dev/null || true)"
PROD_DB_CHECKSUM=""
if [[ -n "$PROD_DB" && -f "$PROD_DB" ]]; then
  PROD_DB_CHECKSUM=$(md5 -q "$PROD_DB" 2>/dev/null || md5sum "$PROD_DB" | awk '{print $1}')
fi

# ── Setup ────────────────────────────────────────────────────────────────────

rm -rf "$SMOKE_HOME"
mkdir -p "$SMOKE_HOME"

export DB_PATH="$SMOKE_DB"
export MEMORY_ENV="production"  # exercises the same code path as real usage
export GEMINI_PROJECT_DIR="$ROOT_DIR"
# Do not export GEMINI_SESSION_ID here. Real Gemini versions may omit it even
# when session_id is present in the hook payload; the hooks must support both.
unset GEMINI_SESSION_ID

cd "$ROOT_DIR"

# ── 1. SessionStart ───────────────────────────────────────────────────────────

echo "── 1. SessionStart hook ──"
OUTPUT=$(bash .gemini/hooks/session-start.sh </dev/null 2>/dev/null)
echo "   output: $OUTPUT"
[[ "$OUTPUT" == "{}" ]] || { echo "FAIL: expected {}, got: $OUTPUT"; exit 1; }
echo "   OK"
echo

# ── 2. BeforeAgent (user prompt — regular message) ──────────────────────────

echo "── 2. BeforeAgent hook (user prompt) ──"
PAYLOAD=$(cat <<EOF
{"session_id":"$FAKE_SESSION_ID","transcript_path":"/tmp/t.json","cwd":"$ROOT_DIR","hook_event_name":"BeforeAgent","timestamp":"2026-01-01T00:00:00Z","prompt":"Tell me about my current journeys"}
EOF
)
OUTPUT=$(printf '%s' "$PAYLOAD" | bash .gemini/hooks/log-user.sh 2>/dev/null)
echo "   output: $OUTPUT"
# Must be valid JSON
python3 -c "import json,sys; json.loads(sys.argv[1])" "$OUTPUT" || { echo "FAIL: not valid JSON"; exit 1; }
echo "   OK"
echo

# ── 3. BeforeAgent (skill invocation — must be skipped) ─────────────────────

echo "── 3. BeforeAgent hook (skill invocation — should skip logging) ──"
PAYLOAD=$(cat <<EOF
{"session_id":"$FAKE_SESSION_ID","transcript_path":"/tmp/t.json","cwd":"$ROOT_DIR","hook_event_name":"BeforeAgent","timestamp":"2026-01-01T00:00:01Z","prompt":"/mm-mirror some topic"}
EOF
)
OUTPUT=$(printf '%s' "$PAYLOAD" | bash .gemini/hooks/log-user.sh 2>/dev/null)
echo "   output: $OUTPUT"
[[ "$OUTPUT" == "{}" ]] || { echo "FAIL: skill invocation should return {}, got: $OUTPUT"; exit 1; }
echo "   OK"
echo

# ── 4. AfterAgent (assistant response) ─────────────────────────────────────

echo "── 4. AfterAgent hook (assistant response) ──"
PAYLOAD=$(cat <<EOF
{"session_id":"$FAKE_SESSION_ID","transcript_path":"/tmp/t.json","cwd":"$ROOT_DIR","hook_event_name":"AfterAgent","timestamp":"2026-01-01T00:00:02Z","prompt":"Tell me about my current journeys","prompt_response":"You have two active journeys: mirror and automation.","stop_hook_active":false}
EOF
)
OUTPUT=$(printf '%s' "$PAYLOAD" | bash .gemini/hooks/log-assistant.sh 2>/dev/null)
echo "   output: $OUTPUT"
[[ "$OUTPUT" == "{}" ]] || { echo "FAIL: expected {}, got: $OUTPUT"; exit 1; }
echo "   OK"
echo

# ── 5. SessionEnd ────────────────────────────────────────────────────────────

echo "── 5. SessionEnd hook ──"
PAYLOAD=$(cat <<EOF
{"session_id":"$FAKE_SESSION_ID","transcript_path":"/tmp/t.json","cwd":"$ROOT_DIR","hook_event_name":"SessionEnd","timestamp":"2026-01-01T00:00:03Z","reason":"smoke"}
EOF
)
OUTPUT=$(printf '%s' "$PAYLOAD" | bash .gemini/hooks/session-end.sh 2>/dev/null)
echo "   output: $OUTPUT"
[[ "$OUTPUT" == "{}" ]] || { echo "FAIL: expected {}, got: $OUTPUT"; exit 1; }
echo "   OK"
echo

# ── 6. Inspect database rows ─────────────────────────────────────────────────

echo "── 6. Inspect database ──"
if [[ ! -f "$SMOKE_DB" ]]; then
  echo "FAIL: smoke database was not created at $SMOKE_DB"
  exit 1
fi

# Conversations with interface=gemini_cli
CONV_COUNT=$(sqlite3 "$SMOKE_DB" \
  "SELECT COUNT(*) FROM conversations WHERE interface='gemini_cli';" 2>/dev/null)
echo "   conversations with interface='gemini_cli': $CONV_COUNT"
[[ "$CONV_COUNT" -ge 1 ]] || { echo "FAIL: expected at least 1 gemini_cli conversation, got $CONV_COUNT"; exit 1; }

# Get the gemini_cli conversation ID
CONV_ID=$(sqlite3 "$SMOKE_DB" \
  "SELECT id FROM conversations WHERE interface='gemini_cli' LIMIT 1;" 2>/dev/null)
echo "   gemini_cli conversation id: $CONV_ID"

# Messages in the gemini_cli conversation (user + assistant)
MSG_COUNT=$(sqlite3 "$SMOKE_DB" \
  "SELECT COUNT(*) FROM messages WHERE conversation_id='$CONV_ID';" 2>/dev/null)
echo "   messages in gemini_cli conversation: $MSG_COUNT"
[[ "$MSG_COUNT" -ge 2 ]] || { echo "FAIL: expected at least 2 messages (user + assistant), got $MSG_COUNT"; exit 1; }

# Check user message content
USER_MSG=$(sqlite3 "$SMOKE_DB" \
  "SELECT content FROM messages WHERE conversation_id='$CONV_ID' AND role='user' LIMIT 1;" 2>/dev/null)
echo "   user message: ${USER_MSG:0:60}..."
[[ "$USER_MSG" == *"journeys"* ]] || { echo "FAIL: user message content mismatch: $USER_MSG"; exit 1; }

# Check assistant message content
ASST_MSG=$(sqlite3 "$SMOKE_DB" \
  "SELECT content FROM messages WHERE conversation_id='$CONV_ID' AND role='assistant' LIMIT 1;" 2>/dev/null)
echo "   assistant message: ${ASST_MSG:0:60}..."
[[ "$ASST_MSG" == *"journeys"* ]] || { echo "FAIL: assistant message content mismatch: $ASST_MSG"; exit 1; }

echo "   OK"
echo

# ── 7. Production DB guard ───────────────────────────────────────────────────

echo "── 7. Production DB safety check ──"
if [[ -f "$PROD_DB" && -n "$PROD_DB_CHECKSUM" ]]; then
  PROD_DB_CHECKSUM_AFTER=$(md5 -q "$PROD_DB" 2>/dev/null || md5sum "$PROD_DB" | awk '{print $1}')
  if [[ "$PROD_DB_CHECKSUM" != "$PROD_DB_CHECKSUM_AFTER" ]]; then
    echo "FAIL: production database was modified during the smoke test!"
    echo "  before: $PROD_DB_CHECKSUM"
    echo "  after:  $PROD_DB_CHECKSUM_AFTER"
    exit 1
  fi
  echo "   production DB unchanged (checksum: $PROD_DB_CHECKSUM)"
else
  echo "   no production DB found — nothing to guard"
fi
echo "   OK"
echo

# ── Summary ──────────────────────────────────────────────────────────────────

echo "== Smoke test PASSED =="
echo "   smoke home : $SMOKE_HOME"
echo "   DB rows    : $CONV_COUNT conversation(s), $MSG_COUNT message(s)"
echo "   interface  : gemini_cli"
