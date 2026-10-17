#!/usr/bin/env bash
# CV21.DS4.TS2 — SessionEnd's close tail survives Codex's 1 s bound.
#
#   bash route.sh static
#
# The plugin's real wrappers and the real `mirror-hook` entry, against a scratch
# mirror home with the replay providers in place of the model and a key set.
# Three steps: a `codex` session ends inside 1 s with every state written and
# no model call; the next session start's maintenance finishes the deferred
# tail; a `claude_code` session still runs the tail at exit, with the session
# inactive before the first call. Writes only under DS4_TS2_DIR (default
# /tmp/cv21-ds4-ts2); touches no real home.
#
# What this proves: the bounded path is fast, makes no model call, writes every
# state, and the deferred tail finishes at the next start. What it does not:
# the ORDER under a real cut -- under replay nothing is slow, so the 1 s kill
# never fires. The lifecycle unit tests hold the order.
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)"
D_RAW="${DS4_TS2_DIR:-/tmp/cv21-ds4-ts2}"
HOOKS="$ROOT/plugins/mirror-mind/hooks"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
look() { printf '  \033[36m→\033[0m %s\n' "$*"; }
show() { sed 's/^/      | /'; }
PASS=0
FAIL=0

rm -rf "$D_RAW" && mkdir -p "$D_RAW"
D="$(cd "$D_RAW" && pwd -P)"
HOME_DIR="$D/home"
MIRROR="$D/mirror-home"
EVIDENCE="$D/evidence"
mkdir -p "$HOME_DIR" "$MIRROR" "$EVIDENCE"
DB="$MIRROR/memory_test.db"

# The replay providers the suite uses: every model call answers from a file.
cat >"$D/replay-llm.json" <<'EOF'
{ "kind": "llm", "responses": {
  "extraction": "[{\"title\":\"Route memory\",\"content\":\"The Codex session's memory, extracted at the next start.\",\"context\":\"TS2 route\",\"memory_type\":\"insight\",\"layer\":\"ego\",\"tags\":[\"ts2\"]}]",
  "task_extraction": "[]", "curation": "[]",
  "summary": "Route summary.", "conversation_title": "Route title",
  "conversation_tags": "[\"ts2\"]", "conversation_summary": "Route summary." } }
EOF
node -e 'console.log(JSON.stringify({kind:"embedding",response:{embedding:Array(1536).fill(0.25)}}))' >"$D/replay-embedding.json"

ENV=(env HOME="$HOME_DIR" MIRROR_HOME="$MIRROR" MIRROR_USER= MEMORY_ENV=test
  OPENROUTER_API_KEY=route-key-set
  MIRROR_TS_CONVERSATION_LLM_REPLAY="$D/replay-llm.json"
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY="$D/replay-embedding.json"
  PI_SESSIONS_DIR="$D/absent-pi-sessions" MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off
  NODE_OPTIONS=--no-warnings PATH="$PATH")

# A read of the scratch database, through node:sqlite (no sqlite3 binary needed).
q() { node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  const row = db.prepare(process.argv[2]).get();
  console.log(row ? String(Object.values(row)[0] ?? "") : "");' "$DB" "$1" 2>/dev/null; }
x() { node -e '
  const { DatabaseSync } = require("node:sqlite");
  new DatabaseSync(process.argv[1]).exec(process.argv[2]);' "$DB" "$1"; }
hook() { local name="$1"; shift; "${ENV[@]}" bash "$HOOKS/$name" "$@"; }
log_lines() { if [ -f "$MIRROR/hooks.log" ]; then wc -l <"$MIRROR/hooks.log" | tr -d ' '; else echo 0; fi; }
# Milliseconds, portable (macOS date has no %N).
now_ms() { node -e 'console.log(Date.now())'; }

say "Evidence"
look "date: $(date -u '+%Y-%m-%d %H:%M UTC')"
look "mirror-hook: $(command -v mirror-hook || echo 'not on the PATH')"
look "package: $(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json")"
command -v mirror-hook >/dev/null || { bad "mirror-hook is not on the PATH (npm link at the repository root)"; exit 1; }

# Bootstrap the home with one deterministic call, so the first hook is not also a migration.
"${ENV[@]}" mirror runtime version >/dev/null 2>&1 || true
"${ENV[@]}" mirror conversation-logger session-start-fast >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
say "1. A codex session ends inside 1 s: state written, no model call"
SID="ts2-codex-$$"
for i in 1 2; do
  printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"t$i\",\"prompt\":\"prompt $i about the route\"}" | hook log-user-prompt.sh >/dev/null 2>&1
  printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"t$i\",\"last_assistant_message\":\"reply $i from the route\"}" | hook log-assistant-reply.sh >/dev/null 2>&1
done
CONV="$(q "SELECT conversation_id FROM runtime_sessions WHERE session_id = '$SID'")"
[ -n "$CONV" ] && ok "a conversation is bound to the session ($CONV)" || { bad "no conversation bound"; }
check_label="$(q "SELECT interface FROM runtime_sessions WHERE session_id = '$SID'")"
[ "$check_label" = "codex" ] && ok "the session is labelled codex (US8, from turn_id)" || bad "label is '$check_label'"
MSGS="$(q "SELECT COUNT(*) FROM messages WHERE conversation_id = '$CONV'")"
[ "$MSGS" = "4" ] && ok "four messages: eligible for extraction" || bad "$MSGS messages"
# A journey, so extraction has something to attach to at the next start.
x "UPDATE conversations SET journey = 'mirror' WHERE id = '$CONV'"
LOG_BEFORE="$(log_lines)"
CALLS_BEFORE="$(q "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = '$CONV'")"

T0="$(now_ms)"
printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"t2\"}" | hook log-session-end.sh >"$EVIDENCE/session-end.out" 2>&1
T1="$(now_ms)"
ELAPSED=$((T1 - T0))
look "log-session-end.sh took ${ELAPSED} ms"
[ "$ELAPSED" -lt 1000 ] && ok "the hook finished on its own inside 1 s" || bad "the hook took ${ELAPSED} ms (Codex would have killed it at 1000)"
[ -n "$(q "SELECT ended_at FROM conversations WHERE id = '$CONV'")" ] && ok "ended_at is set" || bad "ended_at is null"
[ "$(q "SELECT active FROM runtime_sessions WHERE session_id = '$SID'")" = "0" ] && ok "the runtime session is inactive" || bad "the runtime session is still active"
[ -n "$(q "SELECT closed_at FROM runtime_sessions WHERE session_id = '$SID'")" ] && ok "closed_at is set" || bad "closed_at is null"
[ "$(q "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = '$CONV'")" = "1" ] && ok "close_tail_pending is set" || bad "no close_tail_pending flag"
CALLS_AFTER="$(q "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = '$CONV'")"
[ "${CALLS_AFTER:-0}" = "${CALLS_BEFORE:-0}" ] && ok "no LLM call in the ledger for the conversation" || bad "the ledger gained $((CALLS_AFTER - CALLS_BEFORE)) call(s)"
LOG_AFTER="$(log_lines)"
[ "${LOG_AFTER:-0}" = "${LOG_BEFORE:-0}" ] && ok "hooks.log gained no line" || { bad "hooks.log gained a line:"; tail -1 "$MIRROR/hooks.log" | show; }
[ -n "$(ls "$MIRROR/backups" 2>/dev/null | head -1)" ] && ok "a dated backup exists (the backup ran inside the bound, after no model call)" || bad "no backup under $MIRROR/backups"

# ---------------------------------------------------------------------------
say "2. The next session start finishes the deferred tail"
"${ENV[@]}" mirror conversation-logger session-maintenance >"$EVIDENCE/maintenance.out" 2>&1
grep -E "Extracted|Finished" "$EVIDENCE/maintenance.out" | show
grep -q "Finished deferred close tails: 1 " "$EVIDENCE/maintenance.out" && ok "maintenance reports: Finished deferred close tails: 1" || bad "maintenance did not report the finished tail"
note "the SessionStart hook runs this same composite, silently, before it prints the Operating Instructions"
[ "$(q "SELECT COUNT(*) FROM memories WHERE conversation_id = '$CONV'")" -ge 1 ] && ok "the conversation has memories (extractPending, through replay)" || bad "no memories extracted"
[ "$(q "SELECT title FROM conversations WHERE id = '$CONV'")" = "Route title" ] && ok "the conversation has its generated title" || bad "title is '$(q "SELECT title FROM conversations WHERE id = '$CONV'")'"
[ -z "$(q "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = '$CONV'")" ] && ok "close_tail_pending is gone (the key deleted)" || bad "the flag survives"

# ---------------------------------------------------------------------------
say "3. A claude_code session still runs the tail at exit, inactive first"
SID2="ts2-claude-$$"
for i in 1 2; do
  printf '%s' "{\"session_id\":\"$SID2\",\"prompt\":\"prompt $i about the route\"}" | hook log-user-prompt.sh >/dev/null 2>&1
  printf '%s' "{\"session_id\":\"$SID2\",\"last_assistant_message\":\"reply $i from the route\"}" | hook log-assistant-reply.sh >/dev/null 2>&1
done
CONV2="$(q "SELECT conversation_id FROM runtime_sessions WHERE session_id = '$SID2'")"
[ "$(q "SELECT interface FROM runtime_sessions WHERE session_id = '$SID2'")" = "claude_code" ] && ok "the session is labelled claude_code" || bad "label is not claude_code"
x "UPDATE conversations SET journey = 'mirror' WHERE id = '$CONV2'"
printf '%s' "{\"session_id\":\"$SID2\"}" | hook log-session-end.sh >"$EVIDENCE/session-end-claude.out" 2>&1
CALLS2="$(q "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = '$CONV2'")"
[ "${CALLS2:-0}" -ge 1 ] && ok "the ledger has the tail's calls ($CALLS2) for the conversation" || bad "no tail calls at exit"
[ -z "$(q "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = '$CONV2'")" ] && ok "not flagged: nothing deferred" || bad "flagged on claude_code"
CLOSED="$(q "SELECT closed_at FROM runtime_sessions WHERE session_id = '$SID2'")"
FIRST="$(q "SELECT MIN(called_at) FROM llm_calls WHERE conversation_id = '$CONV2'")"
look "closed_at $CLOSED · first call $FIRST"
[ -n "$CLOSED" ] && [ -n "$FIRST" ] && [ ! "$CLOSED" \> "$FIRST" ] && ok "the session was inactive at or before the first call (closed_at <= first call)" || bad "closed_at after the first call, or missing"

say "Result"
echo "  passed: $PASS   failed: $FAIL   evidence: $EVIDENCE"
[ "$FAIL" = "0" ]
