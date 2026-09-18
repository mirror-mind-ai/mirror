#!/usr/bin/env bash
# CV22.DS9.US2 — run every deterministic MCP tool variant through BOTH engines
# against a COPY of a real database, and compare per-response hashes.
#
# Safety posture, in order of importance:
#   * the source database is opened read-only and copied with VACUUM INTO; the
#     original is never written, and the copy lives in a temp directory removed
#     on exit;
#   * nothing this script prints contains memory, conversation, identity, or
#     journey CONTENT -- only SHA-256 hashes, byte counts, and tool names. The
#     point is to prove the engines agree, not to show what they said;
#   * the `query` variants of search_memories and mirror_context are excluded:
#     they would embed, which costs money and is not byte-comparable across two
#     calls. Those are graded under replay in ts/test/mcp/.
#
# Usage: scripts/mcp_real_copy_probe.sh [path/to/memory.db]
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

SOURCE="${1:-}"
if [ -z "$SOURCE" ]; then
  SOURCE="$(uv run python -c "
from memory.config import require_db_path
print(require_db_path())
" 2>/dev/null)" || { echo "could not resolve a database; pass one explicitly"; exit 1; }
fi
[ -f "$SOURCE" ] || { echo "no database at $SOURCE"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/tmp"
COPY="$WORK/tmp/memory-copy.db"

echo "── copying $(basename "$SOURCE") ($(du -h "$SOURCE" | cut -f1)) read-only into a temp dir"
uv run python -c "
import sqlite3, sys
src = sqlite3.connect('file:$SOURCE?mode=ro', uri=True)
dst = sqlite3.connect('$COPY')
src.backup(dst)
dst.close(); src.close()
" || { echo "   ✗ copy failed"; exit 1; }
echo "   ✓ copy made; the source was never opened for writing"

echo "── choosing a probe subject from the copy"
read -r JOURNEY CONVERSATION <<< "$(uv run python -c "
import sqlite3
c = sqlite3.connect('$COPY')
row = c.execute('''
    SELECT m.journey, COUNT(*) AS n FROM memories m
    WHERE m.journey IS NOT NULL
      AND EXISTS (SELECT 1 FROM conversations v WHERE v.journey = m.journey)
    GROUP BY m.journey ORDER BY n DESC, m.journey LIMIT 1
''').fetchone()
journey = row[0] if row else ''
conv = c.execute(
    'SELECT id FROM conversations WHERE journey = ? ORDER BY started_at DESC LIMIT 1', (journey,)
).fetchone()
print(journey, conv[0] if conv else '')
")"
echo "   journey with the most memories that also has conversations: ${JOURNEY:-<none>}"
[ -n "$JOURNEY" ] || { echo "   ✗ no suitable journey in this database"; exit 1; }

BEFORE="$(uv run python -c "
import sqlite3
c = sqlite3.connect('$COPY')
print(','.join(str(c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]) for t in ('memory_access_log','llm_calls','memories','conversations')))
")"

cat > "$WORK/transcript.jsonl" <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_journeys","arguments":{}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"journey_status","arguments":{"slug":"$JOURNEY"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_conversations","arguments":{"limit":10}}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"list_conversations","arguments":{"journey":"$JOURNEY","limit":5}}}
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"recall_conversation","arguments":{"conversation_id":"$CONVERSATION","limit":5}}}
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"detect_persona","arguments":{"query":"there is a bug in the database schema"}}}
{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"search_memories","arguments":{"journey":"$JOURNEY","limit":5}}}
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"search_memories","arguments":{"layer":"ego","limit":5}}}
{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"search_memories","arguments":{"type":"insight","limit":5}}}
{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"mirror_context","arguments":{"journey":"$JOURNEY"}}}
EOF

echo "── python -m memory mcp"
DB_PATH="$COPY" MEMORY_ENV=production uv run python -m memory mcp \
  < "$WORK/transcript.jsonl" > "$WORK/py.out" 2> "$WORK/py.err"
echo "   exit=$? stderr_bytes=$(wc -c < "$WORK/py.err" | tr -d ' ')"

echo "── node ts/src/mcp/main.ts  (bare node)"
env -u NODE_OPTIONS DB_PATH="$COPY" MEMORY_ENV=production \
  MIRROR_MCP_VERSION="$(uv run python -c "
from importlib.metadata import version
try: print(version('mirror'))
except Exception: print('0.0.0')
")" node ts/src/mcp/main.ts < "$WORK/transcript.jsonl" > "$WORK/ts.out" 2> "$WORK/ts.err"
echo "   exit=$? stderr_bytes=$(wc -c < "$WORK/ts.err" | tr -d ' ')"

echo "── per-response comparison (hashes only; no content is printed)"
uv run python - "$WORK/py.out" "$WORK/ts.out" <<'PY'
import hashlib, json, sys

LABELS = {
    1: "initialize", 2: "tools/list", 3: "list_journeys", 4: "journey_status",
    5: "list_conversations(all)", 6: "list_conversations(journey)",
    7: "recall_conversation", 8: "detect_persona", 9: "search_memories(journey)",
    10: "search_memories(layer)", 11: "search_memories(type)", 12: "mirror_context",
}

def payloads(path):
    out = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        msg = json.loads(line)
        result = msg.get("result") or {}
        content = result.get("content")
        text = content[0]["text"] if content else json.dumps(result, sort_keys=True)
        out[msg.get("id")] = text
    return out

py, ts = payloads(sys.argv[1]), payloads(sys.argv[2])
ids = sorted(set(py) | set(ts), key=lambda value: (value is None, value))
worst = 0
print(f"   {'tool':<30} {'bytes':>8}  {'python':<10} {'typescript':<10} verdict")
for identifier in ids:
    label = LABELS.get(identifier, str(identifier))
    a, b = py.get(identifier), ts.get(identifier)
    ha = hashlib.sha256(a.encode()).hexdigest()[:8] if a is not None else "MISSING"
    hb = hashlib.sha256(b.encode()).hexdigest()[:8] if b is not None else "MISSING"
    ok = a is not None and a == b
    worst |= 0 if ok else 1
    size = len(a) if a is not None else 0
    print(f"   {label:<30} {size:>8}  {ha:<10} {hb:<10} {'✓' if ok else '✗ DIFFERS'}")
print()
print("   ✓ every tool agrees" if not worst else "   ✗ at least one tool differs")
sys.exit(worst)
PY
STATUS=$?

echo "── write check: neither engine may have touched the copy"
# An assertion, not a printout. Python's MCP server is free to write in general
# -- its query search reinforces and records the embedding ledger -- while the
# TS server holds a READ-ONLY handle by decision (d). No call in this transcript
# embeds or reinforces, so both must leave every count untouched, and a future
# change that makes either engine write on a read path fails right here.
uv run python - "$BEFORE" "$COPY" <<'PY' || STATUS=1
import sqlite3
import sys

before = [int(value) for value in sys.argv[1].split(",")]
tables = ("memory_access_log", "llm_calls", "memories", "conversations")
connection = sqlite3.connect(sys.argv[2])
after = [connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables]

ok = True
for table, was, now in zip(tables, before, after):
    unchanged = was == now
    ok &= unchanged
    print(f"   {table:<20} {was:>8} -> {now:<8} {'✓' if unchanged else '✗ WROTE'}")
print("   ✓ neither engine wrote to the copy" if ok else "   ✗ a read path wrote")
sys.exit(0 if ok else 1)
PY

exit $STATUS
