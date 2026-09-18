#!/usr/bin/env bash
# CV22.DS9.US2 — feed one JSON-RPC transcript to BOTH MCP servers over a
# synthetic fixture database and diff their bytes.
#
# Read-only with respect to anything real: the fixture is built from the
# golden's ordered seed in a temporary directory, and the developer's own
# database is never opened.
#
# --launcher (CV22.DS9.TS2) spawns `plugins/mirror-mind/mcp/launch.sh` — the
# command the plugin manifest actually names — instead of `node main.ts`, and
# takes the Python side through the SAME launcher with MIRROR_TS_MCP=0. Without
# it this harness proves the engines agree; with it, that the thing a client
# launches is the engine we think it is, on both branches.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

USE_LAUNCHER=0
[ "${1:-}" = "--launcher" ] && USE_LAUNCHER=1
LAUNCHER="plugins/mirror-mind/mcp/launch.sh"

# The Python branch needs `memory` importable from a bare `python3`, which is
# CV21's plugin contract and is NOT met in this repo (no pip install). The same
# stand-in `scripts/smoke_claude_plugin.sh` uses puts the project venv first on
# PATH; without it the revert branch would fail with ModuleNotFoundError and
# prove nothing about routing.
if [ "$USE_LAUNCHER" = "1" ]; then
  VENV_BIN="$(uv run python -c 'import os,sys; print(os.path.dirname(sys.executable))')"
  export PATH="$VENV_BIN:$PATH"
  export PYTHONPATH="$PWD/src${PYTHONPATH:+:$PYTHONPATH}"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/tmp"
DB="$WORK/tmp/fixture.db"

echo "── building the fixture from the golden's ordered seed"
( cd ts && node --input-type=module -e "
import { writeFileSync } from 'node:fs';
const { openDatabaseCopyForWrite } = await import('./src/db/database.ts');
// bootstrapDatabase, not createSchema alone: a real database carries its
// _migrations ledger, and a fixture without one makes the TS server apply a
// pending migration on launch (correctly) and say so on stderr -- which is
// the harness lying about the steady state a client would see.
const { bootstrapDatabase } = await import('./src/db/bootstrap.ts');
const golden = JSON.parse(await import('node:fs').then(m => m.readFileSync('./test/goldens/mcp-tools.golden.json','utf-8')));
bootstrapDatabase('$DB').close();
const db = openDatabaseCopyForWrite('$DB');
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

PY_VERSION="$(DB_PATH="$DB" MEMORY_ENV=test uv run python -c "
from importlib.metadata import version
try: print(version('mirror'))
except Exception: print('0.0.0')
")"

if [ "$USE_LAUNCHER" = "1" ]; then
  echo "── $LAUNCHER with MIRROR_TS_MCP=0  (the revert branch)"
  env -u NODE_OPTIONS MIRROR_TS_MCP=0 DB_PATH="$DB" MEMORY_ENV=test "$LAUNCHER" \
    < "$WORK/transcript.jsonl" > "$WORK/py.out" 2> "$WORK/py.err"
  PY_EXIT=$?
else
  echo "── python -m memory mcp"
  DB_PATH="$DB" MEMORY_ENV=test uv run python -m memory mcp \
    < "$WORK/transcript.jsonl" > "$WORK/py.out" 2> "$WORK/py.err"
  PY_EXIT=$?
fi
echo "   exit=$PY_EXIT stderr_bytes=$(wc -c < "$WORK/py.err" | tr -d ' ')"

if [ "$USE_LAUNCHER" = "1" ]; then
  echo "── $LAUNCHER with no gate  (what a client spawns by default)"
  # No MIRROR_MCP_VERSION: the launcher's TS branch must resolve the version
  # itself, which is the D4 fallback under test rather than a pin from here.
  env -u NODE_OPTIONS -u MIRROR_MCP_VERSION -u MIRROR_TS_MCP \
    DB_PATH="$DB" MEMORY_ENV=test "$LAUNCHER" \
    < "$WORK/transcript.jsonl" > "$WORK/ts.out" 2> "$WORK/ts.err"
  TS_EXIT=$?
else
  echo "── node ts/src/mcp/main.ts  (bare node, as a client spawns it)"
  env -u NODE_OPTIONS DB_PATH="$DB" MEMORY_ENV=test MIRROR_MCP_VERSION="$PY_VERSION" \
    node ts/src/mcp/main.ts < "$WORK/transcript.jsonl" > "$WORK/ts.out" 2> "$WORK/ts.err"
  TS_EXIT=$?
fi
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

if [ "$USE_LAUNCHER" = "1" ]; then
  # Both branches answered identically, which is the point -- and is exactly why
  # the routing claim needs separate evidence: D4 makes the two engines report
  # the same version on purpose, so serverInfo cannot tell them apart.
  #
  # MIRROR_MCP_VERSION can. The TS server honors it; the Python server reads
  # importlib.metadata and ignores it. A sentinel value therefore says which
  # engine answered, deterministically and with no process-timing games.
  echo "── which engine each branch started (sentinel: only TS honors MIRROR_MCP_VERSION)"
  SENTINEL="0.0.0-routing-sentinel"
  # env processes options before assignments, so -u must precede any gate the
  # caller sets: `env -u X X=0` ends with X=0, `env X=0 -u X` is an error.
  probe_version() {
    printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' \
      | env -u NODE_OPTIONS -u MIRROR_TS_MCP \
        MIRROR_MCP_VERSION="$SENTINEL" DB_PATH="$DB" MEMORY_ENV=test "$@" "$LAUNCHER" 2>/dev/null \
      | head -1 \
      | uv run python -c "import json,sys; print(json.load(sys.stdin)['result']['serverInfo']['version'])"
  }
  DEFAULT_VERSION="$(probe_version)"
  REVERT_VERSION="$(probe_version MIRROR_TS_MCP=0)"

  ROUTING=0
  if [ "$DEFAULT_VERSION" = "$SENTINEL" ]; then
    echo "   ✓ default branch  -> TypeScript"
  else
    echo "   ✗ default branch answered $DEFAULT_VERSION — expected the TS server"; ROUTING=1
  fi
  if [ "$REVERT_VERSION" = "$PY_VERSION" ]; then
    echo "   ✓ MIRROR_TS_MCP=0 -> Python ($PY_VERSION)"
  else
    echo "   ✗ revert branch answered $REVERT_VERSION — expected Python's $PY_VERSION"; ROUTING=1
  fi
  [ "$ROUTING" -eq 0 ] || exit 1
fi
