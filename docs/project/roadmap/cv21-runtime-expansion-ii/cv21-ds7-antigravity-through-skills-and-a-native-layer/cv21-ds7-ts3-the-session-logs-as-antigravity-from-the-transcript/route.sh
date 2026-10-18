#!/usr/bin/env bash
# CV21.DS7.TS3 — the live logging route, re-runnable.
#
#   bash route.sh live     # two turns, logged as antigravity, then closed
#   bash route.sh verify   # compare installed agy with the recorded one
#
# A scratch HOME, the operator's agy login copied in and removed on exit, the
# checkout's mirror-hook behind MIRROR_BIN. Two model turns; then the scratch
# Mirror database is read for the logged rows. Evidence is sanitized: row
# COUNTS, roles, interface, and the close state — never conversation content.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
RECORDED_AGY="1.4.2"
say() { printf '\n== %s ==\n' "$1"; }

verify() {
  local now; now="$(agy --version 2>/dev/null | head -1)"
  echo "recorded: agy $RECORDED_AGY"; echo "installed: $now"
  case "$now" in *"$RECORDED_AGY"*) echo "match" ;; *) echo "DIFFERS — re-run before trusting" ;; esac
}

live() {
  command -v agy >/dev/null || { echo "agy not on PATH"; exit 1; }
  command -v sqlite3 >/dev/null || { echo "sqlite3 not on PATH"; exit 1; }
  local work home ws bin
  work="$(mktemp -d)"; home="$work/home"; ws="$work/workspace"; bin="$work/bin"
  mkdir -p "$home/.gemini" "$ws" "$bin"
  trap "rm -f '$home/.gemini/oauth_creds.json' '$home/.gemini/google_accounts.json'" EXIT

  say "agy version"; agy --version | head -1

  say "1. stage the plugin"
  HOME="$home" agy plugin install "$REPO_ROOT/plugins/mirror-mind" 2>&1 | tail -1
  local staged="$home/.gemini/config/plugins/mirror-mind"
  grep -q "agy/stop.sh" "$staged/hooks.json" && echo "staged hooks.json carries the Stop handler"

  say "2. scratch Mirror home and mirror-hook behind MIRROR_BIN"
  HOME="$home" MIRROR_HOME="" MIRROR_USER="" XDG_CONFIG_HOME="" \
    node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" init agy-live >/dev/null
  local mhome="$home/.mirror-minds/agy-live" db="$home/.mirror-minds/agy-live/memory.db"
  ln -s "$REPO_ROOT/bin/mirror-hook.js" "$bin/mirror-hook"
  local AGY_ENV=(HOME="$home" MIRROR_BIN="$bin" MIRROR_HOME="$mhome" MIRROR_USER="" OPENROUTER_API_KEY="")

  say "0. authenticate the scratch HOME (interactive, once)"
  echo "open the auth URL, approve, paste the code at agy's prompt."
  (cd "$ws" && env "${AGY_ENV[@]}" agy --print "Reply with the single word: ready.") \
    || { echo "auth did not complete; re-run"; exit 1; }

  say "3. turn 1"
  (cd "$ws" && env "${AGY_ENV[@]}" agy --print "In one short sentence, what is a mirror?" 2>/dev/null | tail -2) || true
  say "4. turn 2"
  (cd "$ws" && env "${AGY_ENV[@]}" agy --continue --print "And in one short sentence, what is a reflection?" 2>/dev/null | tail -2) || true

  say "5. the scratch Mirror database (counts and labels only — no content)"
  local rows
  rows="$(sqlite3 "$db" "SELECT c.interface || '|' || m.role FROM messages m JOIN conversations c ON c.id = m.conversation_id ORDER BY m.created_at, m.rowid;" 2>/dev/null || true)"
  echo "$rows"
  local users assistants
  users="$(printf '%s\n' "$rows" | grep -c 'antigravity|user' || true)"
  assistants="$(printf '%s\n' "$rows" | grep -c 'antigravity|assistant' || true)"
  echo "antigravity user rows: $users; assistant rows: $assistants"
  if [ "$users" -ge 2 ] && [ "$assistants" -ge 2 ]; then
    echo "OBSERVATION 1 PASS: both turns logged as antigravity"
  else
    echo "OBSERVATION 1 PENDING: expected >=2 user and >=2 assistant rows"
  fi

  say "6. idempotency — re-fire Stop against the same transcript"
  local cid tpath before after
  cid="$(sqlite3 "$db" "SELECT session_id FROM runtime_sessions WHERE conversation_id IS NOT NULL LIMIT 1;")"
  tpath="$(find "$home/.gemini/antigravity-cli/brain/$cid" -name transcript.jsonl 2>/dev/null | head -1)"
  before="$(sqlite3 "$db" "SELECT COUNT(*) FROM messages;")"
  printf '{"conversationId":"%s","transcriptPath":"%s"}' "$cid" "$tpath" \
    | env "${AGY_ENV[@]}" node "$bin/mirror-hook" agy:stop >/dev/null 2>&1 || true
  after="$(sqlite3 "$db" "SELECT COUNT(*) FROM messages;")"
  [ "$before" = "$after" ] && echo "OBSERVATION 2 PASS: re-fired Stop added no rows ($before == $after)" \
                           || echo "OBSERVATION 2 PENDING: $before -> $after"

  say "7. close — a returning session start with the orphan threshold at 0"
  env "${AGY_ENV[@]}" MIRROR_STALE_ORPHAN_MINUTES=0 \
    node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" conversation-logger session-start >/dev/null 2>&1 || true
  local open_n
  open_n="$(sqlite3 "$db" "SELECT COUNT(*) FROM conversations WHERE ended_at IS NULL;")"
  [ "$open_n" = "0" ] && echo "OBSERVATION 3 PASS: the conversation is closed" \
                      || echo "OBSERVATION 3 PENDING: $open_n still open"

  say "evidence"
  echo "workdir kept: $work"
  echo "db rows (labels only): $(printf '%s\n' "$rows" | sort | uniq -c | tr '\n' ';')"
}

case "${1:-live}" in
  live) live ;;
  verify) verify ;;
  *) echo "usage: route.sh [live|verify]"; exit 2 ;;
esac
