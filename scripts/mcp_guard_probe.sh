#!/usr/bin/env bash
# CV22.DS9.TS1 — drive the wallet and abuse guards through the command the plugin
# manifest names, on a COPY of a real database.
#
# What this proves that the unit tests cannot: the guards as a client meets them, through
# the launcher, against real data, with a real embedding provider behind the paid path.
#
# Safety: the source database is copied with `VACUUM INTO` through a read-only
# connection, and never opened for writing. Nothing printed here contains memory, identity, or
# conversation CONTENT — only counts, tool names, and refusal text the server itself
# produced. The refusal text is quoted deliberately: its wording IS the control under test.
#
# Cost: the rate step makes up to MIRROR_MCP_EMBED_RATE_LIMIT real embedding calls
# (~$0.000002 each; the default 30 is ~$0.00006). Skipped without a key.
#
# Needs `node` and the `sqlite3` CLI. Its Python helpers left with the Python
# core (CV22.DS10.TS5); the server under test was never Python.
#
# Usage: scripts/mcp_guard_probe.sh [path/to/memory.db]
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

LAUNCHER="plugins/mirror-mind/mcp/launch.sh"
SOURCE="${1:-}"
if [ -z "$SOURCE" ]; then
  # The production database, resolved the way the front door resolves it.
  SOURCE="$(NODE_OPTIONS=--no-warnings node --env-file-if-exists=.env --input-type=module -e '
    const { resolveDbPath } = await import("./ts/src/frontDoor/dbPath.ts");
    const { DB_PATH: _ignored, ...env } = process.env;
    console.log(resolveDbPath([], { ...env, MEMORY_ENV: "production" }));' 2>/dev/null)" \
    || { echo "could not resolve a database; pass one explicitly"; exit 1; }
fi
[ -f "$SOURCE" ] || { echo "no database at $SOURCE"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/tmp"
COPY="$WORK/tmp/memory-copy.db"
STATUS=0

echo "── copying $(basename "$SOURCE") read-only into a temp dir"
sqlite3 -readonly "$SOURCE" "VACUUM INTO '$COPY'" || { echo "   ✗ copy failed"; exit 1; }

# A conversation that exists, so the argument step exercises the cap rather than a
# not-found path.
CONVERSATION="$(sqlite3 "$COPY" 'SELECT id FROM conversations ORDER BY started_at DESC LIMIT 1')"

launch() {  # launch <env-assignments...> -- reads one JSON-RPC line on stdin
  env -u NODE_OPTIONS -u MIRROR_MCP_VERSION -u MIRROR_TS_MCP \
    DB_PATH="$COPY" MEMORY_ENV=production "$@" "$LAUNCHER" 2>>"$WORK/stderr.log"
}

# A SUCCESSFUL payload is memory, identity, or transcript content, so it is reported by
# size and never printed. A REFUSAL is server-authored text whose wording is the control
# under test, so it is printed in full -- and the boundary redacts any argument value it
# quotes, which is what makes that safe.
tool_text() {
  node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      const line = input.split("\n")[0] ?? "";
      if (!line.trim()) return console.log("<no response>");
      const msg = JSON.parse(line);
      if ("error" in msg) return console.log(`PROTOCOL-ERROR ${JSON.stringify(msg.error)}`);
      const text = msg.result.content[0].text;
      console.log(
        msg.result.isError
          ? `isError ${text.replaceAll("\n", " ")}`
          : `ok <${[...text].length} bytes withheld>`,
      );
    });'
}

# ---------------------------------------------------------------------------
echo "── argument bounds (free, no provider call)"
for LIMIT in 0 999; do
  OUT="$(printf '%s\n' "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"recall_conversation\",\"arguments\":{\"conversation_id\":\"$CONVERSATION\",\"limit\":$LIMIT}}}" | launch | tool_text)"
  echo "   limit=$LIMIT -> $OUT"
  case "$OUT" in
    isError*"limit must be an integer from 1 to 200"*) ;;
    *) echo "      ✗ expected an argument refusal"; STATUS=1 ;;
  esac
done

echo "── the same call with MIRROR_TS_MCP_GUARDS=0 (the revert)"
OUT="$(printf '%s\n' "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"recall_conversation\",\"arguments\":{\"conversation_id\":\"$CONVERSATION\",\"limit\":0}}}" | launch MIRROR_TS_MCP_GUARDS=0 | tool_text)"
case "$OUT" in
  ok*) echo "   limit=0 -> ok (the pre-guard whole-transcript behaviour, restored)" ;;
  *)   echo "   limit=0 -> $OUT"; echo "      ✗ the switch did not restore the pre-guard behaviour"; STATUS=1 ;;
esac

# ---------------------------------------------------------------------------
echo "── rate limit (real embedding calls)"
HAS_KEY=0
[ -n "${OPENROUTER_API_KEY:-}" ] && HAS_KEY=1
if [ "$HAS_KEY" = "0" ] && [ -f .env ] \
   && grep -qE '^[[:space:]]*OPENROUTER_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]]' .env; then
  HAS_KEY=1
fi

if [ "$HAS_KEY" = "0" ]; then
  echo "   • skipped: no OPENROUTER_API_KEY (this step makes real embedding calls)"
else
  LIMIT="${MIRROR_MCP_EMBED_RATE_LIMIT:-5}"
  echo "   using MIRROR_MCP_EMBED_RATE_LIMIT=$LIMIT (override to exercise the default 30)"
  BEFORE="$(sqlite3 "$COPY" "SELECT COUNT(*) FROM llm_calls WHERE session_id='mcp'")"
  ALLOWED=0
  REFUSED=""
  for i in $(seq 1 $((LIMIT + 1))); do
    OUT="$(printf '%s\n' "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"search_memories\",\"arguments\":{\"query\":\"probe topic $i\",\"limit\":3}}}" | launch MIRROR_MCP_EMBED_RATE_LIMIT="$LIMIT" | tool_text)"
    case "$OUT" in
      isError*rate-limited*) REFUSED="$OUT"; break ;;
      ok*) ALLOWED=$((ALLOWED + 1)) ;;
      *) echo "   ✗ unexpected: $OUT"; STATUS=1; break ;;
    esac
  done
  AFTER="$(sqlite3 "$COPY" "SELECT COUNT(*) FROM llm_calls WHERE session_id='mcp'")"
  echo "   allowed=$ALLOWED (expected $LIMIT)  mcp ledger rows $BEFORE -> $AFTER"
  echo "   refusal: ${REFUSED:-<none>}"
  [ "$ALLOWED" = "$LIMIT" ] || { echo "      ✗ the guard did not refuse at the limit"; STATUS=1; }
  [ "$AFTER" = "$((BEFORE + LIMIT))" ] || { echo "      ✗ a refusal wrote a row, or a call did not"; STATUS=1; }
  case "$REFUSED" in
    *"Do not send another query to this tool until the user replies."*) ;;
    *) echo "      ✗ the refusal does not end with the scoped stop"; STATUS=1 ;;
  esac
  case "$REFUSED" in
    *"not metered"*) ;;
    *) echo "      ✗ the refusal does not name the unmetered path as sanctioned"; STATUS=1 ;;
  esac
fi

# ---------------------------------------------------------------------------
echo "── what reached the log"
if grep -q "guard refused" "$WORK/stderr.log" 2>/dev/null; then
  grep "guard refused" "$WORK/stderr.log" | sed 's/^/   /'
fi
if grep -qiE "probe topic|SELECT|memory content" "$WORK/stderr.log" 2>/dev/null; then
  echo "   ✗ an argument or payload reached stderr"; STATUS=1
else
  echo "   ✓ no query or payload in the log"
fi

# ---------------------------------------------------------------------------
echo "── write check: only the ledger rows the allowed calls made"
BODIES="$(sqlite3 "$COPY" "SELECT COUNT(*) FROM llm_calls WHERE session_id = 'mcp' AND (prompt != '' OR response != '')")"
ACCESS="$(sqlite3 "$COPY" "SELECT COUNT(*) FROM memory_access_log")"
echo "   bodies stored in mcp rows: $BODIES (must be 0)"
echo "   memory_access_log rows: $ACCESS (AI-12: an agent search teaches the ranker nothing)"
[ "$BODIES" = "0" ] || STATUS=1

echo
[ "$STATUS" -eq 0 ] && echo "   ✓ guards behaved as specified" || echo "   ✗ at least one guard check failed"
exit $STATUS
