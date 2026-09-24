#!/usr/bin/env bash
# Prove the rewritten hooks write what the Python hooks wrote.
#
# CV22.DS10.TS5 plateau 1. This is the one validation that is ONLY possible
# while both engines exist, and it is why the hooks are rewritten at plateau 1
# rather than at plateau 3 with everything else: run the old hook and the new
# hook against two copies of the same database with the same payload, then
# diff the rows they produced.
#
# Deleted at plateau 3 with the Python it compares against.
#
# Usage:
#   bash scripts/ts5/hook_rowdiff.sh <family> <case> <pristine.db>
#   bash scripts/ts5/hook_rowdiff.sh --all <pristine.db>

set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
WORK="$REPO_ROOT/tmp/ts5/rowdiff"

# NOTE ON THE MASKS: BSD sed (macOS) has no \\b, so word boundaries silently
# never match and the ids they were meant to mask survive into the diff. The
# patterns below are boundary-free for that reason; UUIDs and timestamps are
# masked first so the broad 8-hex rule cannot eat part of a longer token.
#
# The columns that legitimately differ between two runs seconds apart. Masking
# them is the same decision the per-family capture makes about git state: what
# is under test is WHAT WAS WRITTEN, not when or under which generated id.
MASKED="id|session_id|created_at|updated_at|started_at|closed_at|last_message_at|conversation_id"

payload_for() {
  local case_name="$1" session="$2"
  case "$case_name" in
    happy)         printf '{"session_id":"%s","prompt":"hello from the row diff"}' "$session" ;;
    muted)         printf '{"session_id":"%s","prompt":"this turn is muted"}' "$session" ;;
    empty-prompt)  printf '{"session_id":"%s","prompt":""}' "$session" ;;
    no-session-id) printf '{"prompt":"a payload with no session id"}' ;;
    cp1252)        printf '{"session_id":"%s","prompt":"glyphs ◇ → ✓ survive"}' "$session" ;;
    *)             printf '{"session_id":"%s","prompt":"case %s"}' "$session" "$case_name" ;;
  esac
}

# Dump the rows a hook may touch, masked, in a stable order.
dump_rows() {
  local db="$1"
  for table in conversations messages runtime_sessions; do
    echo "--- $table"
    sqlite3 "$db" "SELECT * FROM $table ORDER BY rowid" 2>/dev/null \
      | sed -E "s/[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?/<TS>/g" \
      | sed -E "s/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/<UUID>/g" \
      | sed -E "s/[0-9a-f]{8}/<ID>/g"
  done
}

run_one() {
  local engine="$1" family="$2" case_name="$3" pristine="$4"
  local home="$WORK/$engine/vinicius-ts"
  rm -rf "$WORK/$engine"
  mkdir -p "$home"
  cp -c "$pristine" "$home/memory.db" 2>/dev/null || cp "$pristine" "$home/memory.db"
  local session="rowdiff-fixed-session"
  local payload; payload="$(payload_for "$case_name" "$session")"

  # `muted` is a state, not a payload: mute first, through whichever engine.
  if [ "$case_name" = "muted" ]; then
    MIRROR_HOME="$home" MIRROR_USER=vinicius-ts \
      node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" conversation-logger mute \
      >/dev/null 2>&1 || true
  fi

  case "$engine:$family" in
    python:claude)
      # PYTHONPATH is not optional: the real hook exported
      # "$CLAUDE_PROJECT_DIR/src" before piping stdin, and without it the
      # import fails, 2>/dev/null swallows it, and the Python side writes
      # nothing -- which the harness would then report as the NEW code writing
      # too much. A comparison against a silently broken oracle is worse than
      # no comparison.
      printf '%s' "$payload" | MIRROR_HOME="$home" MIRROR_USER=vinicius-ts \
        PYTHONPATH="$REPO_ROOT/src" python3 -c \
        "from memory.cli.conversation_logger import hook_user_prompt; hook_user_prompt()" \
        >/dev/null 2>"$WORK/python.err"
      if [ -s "$WORK/python.err" ]; then
        echo "PYTHON ORACLE FAILED: $(head -1 "$WORK/python.err")" >&2
      fi
      ;;
    node:claude)
      printf '%s' "$payload" | MIRROR_HOME="$home" MIRROR_USER=vinicius-ts \
        node --no-warnings "$REPO_ROOT/ts/src/hooks/main.ts" claude:user-prompt \
        >/dev/null 2>&1
      ;;
    python:gemini)
      # The Gemini hooks already entered the front door for every Mirror
      # command; their Python was only JSON parsing. The comparable unit is
      # therefore the front-door call the old script made.
      # Derive BOTH fields the way the old shell did -- including the session
      # id, which came from $GEMINI_SESSION_ID or the payload. Using a fixed
      # one here made the Python side log a turn the real hook would have
      # skipped, and the harness reported a difference that was its own.
      local prompt payload_session
      prompt="$(printf '%s' "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("prompt",""))' 2>/dev/null)"
      payload_session="$(printf '%s' "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("session_id",""))' 2>/dev/null)"
      if [ "${prompt:0:1}" = "/" ]; then
        : # a skill invocation is a command, not a message: the old script exits here
      else
        if [ -n "$prompt" ] && [ -n "$payload_session" ]; then
          MIRROR_HOME="$home" MIRROR_USER=vinicius-ts \
            node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" conversation-logger log-user \
            "$payload_session" "$prompt" --interface gemini_cli >/dev/null 2>&1 || true
        fi
        # UNCONDITIONAL in the old script, outside the logging guard -- which
        # is why an empty prompt still reached `mirror load` and still touched
        # the operating-mode row. Omitting it here made the harness report a
        # difference that was its own third time running.
        MIRROR_HOME="$home" MIRROR_USER=vinicius-ts \
          node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" mirror load \
          --context-only --query "$prompt" --session-id "$payload_session" >/dev/null 2>&1 || true
      fi
      ;;
    node:gemini)
      printf '%s' "$payload" | MIRROR_HOME="$home" MIRROR_USER=vinicius-ts \
        node --no-warnings "$REPO_ROOT/ts/src/hooks/main.ts" gemini:log-user \
        >/dev/null 2>&1
      ;;
    *)
      echo "unsupported engine/family: $engine:$family" >&2
      return 2
      ;;
  esac

  dump_rows "$home/memory.db"
}

compare() {
  local family="$1" case_name="$2" pristine="$3"
  local before after
  before="$(run_one python "$family" "$case_name" "$pristine")"
  after="$(run_one node "$family" "$case_name" "$pristine")"
  if [ "$before" = "$after" ]; then
    printf '  %-8s %-14s identical\n' "$family" "$case_name"
    return 0
  fi
  printf '  %-8s %-14s DIFFERS\n' "$family" "$case_name"
  diff <(printf '%s' "$before") <(printf '%s' "$after") | head -12 | sed 's/^/      /'
  return 1
}

PRISTINE="${2:-}"
failures=0
if [ "${1:-}" = "--all" ]; then
  [ -f "$PRISTINE" ] || { echo "usage: hook_rowdiff.sh --all <pristine.db>" >&2; exit 2; }
  echo "hook row-diff (python vs node), masked columns: $MASKED"
  for family in claude gemini; do
    for case_name in happy muted empty-prompt no-session-id cp1252; do
      compare "$family" "$case_name" "$PRISTINE" || failures=$((failures + 1))
    done
  done
  rm -rf "$WORK"
  echo
  [ "$failures" -eq 0 ] && echo "row diff: every family and case identical." || echo "row diff: $failures difference(s)."
  exit "$failures"
fi

compare "${1:?family}" "${2:?case}" "${3:?pristine.db}"
exit $?
