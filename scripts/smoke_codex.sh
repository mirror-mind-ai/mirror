#!/usr/bin/env bash
set -euo pipefail

# CV8.E7 — Codex Operational Validation Smoke Test
# Proves that backfill-codex-session correctly parses Codex JSONL
# and logs messages with interface='codex' to an isolated database.
# Runs the TypeScript front door; the Python core it used to call was deleted
# by CV22.DS10.TS5.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

export MEMORY_ENV=test
export MIRROR_HOME=$(mktemp -d)
# The front door resolves `--mirror-home` BEFORE the DB_PATH environment
# variable, and MEMORY_ENV=test names the file, so this is where the backfill
# below writes. (The Python engine this smoke was written for read DB_PATH.)
DB_PATH="$MIRROR_HOME/memory_test.db"

echo "Using isolated test DB: $DB_PATH"

# 1. Setup - just create the directory
mkdir -p "$MIRROR_HOME"

# 2. Create fake Codex JSONL
JSONL_PATH="$MIRROR_HOME/fake_session.jsonl"
SESSION_ID="019d3b75-0462-7762-ac7c-4852a85ce725"
CWD="$PWD"

cat > "$JSONL_PATH" <<EOF
{"timestamp":"2026-03-29T21:17:27.472Z","type":"session_meta","payload":{"id":"$SESSION_ID","timestamp":"2026-03-29T21:16:57.832Z","cwd":"$CWD"}}
{"timestamp":"2026-03-29T21:17:27.479Z","type":"event_msg","payload":{"type":"user_message","message":"Hello Codex"}}
{"timestamp":"2026-03-29T21:17:31.928Z","type":"event_msg","payload":{"type":"agent_message","message":"Hello Vinícius"}}
EOF

# 3. Run backfill
# Pass MIRROR_HOME explicitly to match our exported DB_PATH
NODE_OPTIONS=--no-warnings node "$ROOT_DIR/ts/src/frontDoor/cli.ts" \
  conversation-logger backfill-codex-session "$JSONL_PATH" --interface codex --mirror-home "$MIRROR_HOME"

# 4. Verify DB entries
echo "Verifying database entries..."

# Check messages - using created_at for deterministic order
MESSAGES=$(sqlite3 "$DB_PATH" "SELECT role, content FROM messages ORDER BY created_at;")
echo "Messages in DB:"
echo "$MESSAGES"

# Check interface label
INTERFACE=$(sqlite3 "$DB_PATH" "SELECT interface FROM conversations LIMIT 1;")
echo "Interface label: $INTERFACE"

# Validate
if echo "$MESSAGES" | grep -q "user|Hello Codex" && \
   echo "$MESSAGES" | grep -q "assistant|Hello Vinícius" && \
   [[ "$INTERFACE" == "codex" ]]; then
  echo "✅ Smoke test PASSED"
else
  echo "❌ Smoke test FAILED"
  exit 1
fi

rm -rf "$MIRROR_HOME"
