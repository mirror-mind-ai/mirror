#!/usr/bin/env bash
# CV22.DS9.US2 — feed one JSON-RPC transcript to BOTH MCP servers over a
# synthetic fixture database and diff their bytes.
#
# Read-only with respect to anything real: the fixture is built from the
# golden's ordered seed in a temporary directory, and the developer's own
# database is never opened.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/tmp"
DB="$WORK/tmp/fixture.db"

echo "── building the fixture from the golden's ordered seed"
( cd ts && node --input-type=module -e "
import { writeFileSync } from 'node:fs';
const { openDatabaseCopyForWrite } = await import('./src/db/database.ts');
const { createSchema } = await import('./src/db/schema.ts');
const golden = JSON.parse(await import('node:fs').then(m => m.readFileSync('./test/goldens/mcp-tools.golden.json','utf-8')));
const db = openDatabaseCopyForWrite('$DB');
createSchema(db);
const NOW = '2026-01-01T00:00:00Z';
const s = golden.seed;
for (const j of s.journeys) db.prepare('INSERT INTO identity (id, layer, key, content, metadata, created_at, updated_at) VALUES (?, \'journey\', ?, ?, ?, ?, ?)').run('id-journey-'+j.key, j.key, j.content, j.metadata, NOW, NOW);
for (const p of s.personas) db.prepare('INSERT INTO identity (id, layer, key, content, metadata, created_at, updated_at) VALUES (?, \'persona\', ?, ?, ?, ?, ?)').run('id-persona-'+p.key, p.key, p.content, p.metadata, NOW, NOW);
for (const r of s.identity) db.prepare('INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('id-'+r.layer+'-'+r.key, r.layer, r.key, r.content, NOW, NOW);
for (const m of s.memories) {
  const emb = m.embedding_seed === null ? null : Buffer.from(new Float32Array(Array.from({length: golden.embedding_dim}, (_, i) => Number((((m.embedding_seed*7 + i*3) % 11)/10).toFixed(4)))).buffer);
  db.prepare('INSERT INTO memories (id, title, content, memory_type, layer, journey, tags, created_at, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(m.id, m.title, m.content, m.memory_type, m.layer, m.journey, m.tags, m.created_at, emb);
}
for (const c of s.conversations) db.prepare('INSERT INTO conversations (id, title, started_at, ended_at, interface, persona, journey, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(c.id, c.title, c.started_at, c.ended_at, c.interface, c.persona, c.journey, c.summary);
for (const m of s.messages) db.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(m.id, m.conversation_id, m.role, m.content, m.created_at);
db.close();
writeFileSync('$WORK/transcript.jsonl', golden.transcript.stdin);
" ) || { echo "   ✗ fixture build failed"; exit 1; }

echo "── python -m memory mcp"
DB_PATH="$DB" MEMORY_ENV=test uv run python -m memory mcp \
  < "$WORK/transcript.jsonl" > "$WORK/py.out" 2> "$WORK/py.err"
PY_EXIT=$?
echo "   exit=$PY_EXIT stderr_bytes=$(wc -c < "$WORK/py.err" | tr -d ' ')"

echo "── node ts/src/mcp/main.ts  (bare node, as a client spawns it)"
env -u NODE_OPTIONS DB_PATH="$DB" MEMORY_ENV=test MIRROR_MCP_VERSION="$(
  DB_PATH="$DB" MEMORY_ENV=test uv run python -c "
from importlib.metadata import version
try: print(version('mirror'))
except Exception: print('0.0.0')
")" node ts/src/mcp/main.ts < "$WORK/transcript.jsonl" > "$WORK/ts.out" 2> "$WORK/ts.err"
TS_EXIT=$?
echo "   exit=$TS_EXIT stderr_bytes=$(wc -c < "$WORK/ts.err" | tr -d ' ')"

echo "── diff"
if diff "$WORK/py.out" "$WORK/ts.out" > "$WORK/diff.txt"; then
  echo "   ✓ DIFF EMPTY — $(wc -l < "$WORK/py.out" | tr -d ' ') responses identical byte for byte"
else
  echo "   ✗ the engines disagree:"
  head -20 "$WORK/diff.txt"
  exit 1
fi

[ "$PY_EXIT" -eq 0 ] && [ "$TS_EXIT" -eq 0 ] || { echo "   ✗ non-zero exit"; exit 1; }
[ ! -s "$WORK/py.err" ] && [ ! -s "$WORK/ts.err" ] || { echo "   ✗ stderr not empty"; exit 1; }
echo "   ✓ both exit 0 with empty stderr"
