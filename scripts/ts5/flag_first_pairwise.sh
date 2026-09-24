#!/usr/bin/env bash
# CV22.DS10.TS5 plateau 2 -- finding F5, the pairwise proof.
#
# Every flag-first invocation the oracle accepts, answered by Python and by
# TypeScript on two copies of the same database, compared on exit code, stdout,
# stderr, and -- for the writes -- the rows they leave behind. TypeScript runs
# with python/python3/uv shadowed by stubs that exit 66 and log, so the fallback
# cannot be what answers; a non-empty shadow log fails the run.
#
# Possible only while both engines exist. Deleted with the Python core in
# plateau 3, like hook_rowdiff.sh; its verdict lives in the story's test guide.
#
# Usage:
#   bash scripts/ts5/flag_first_pairwise.sh <demo-or-copy.db>
#
# Masked, and only these: each run's own home path, and 8-hex task ids a write
# mints (random on both engines). Nothing masked can hide a routing change.
#
# MEMORY_ENV is pinned to production ON THE SCRATCH COPIES, never left to the
# environment. The first run of this script set it to `test`, which selects
# `memory_test.db`: both engines bootstrapped an empty database beside the copy,
# every read and write compared two empty files, and the verdict was 25/25. Each
# row now also reports whether the invocation changed the copy it was given, so
# a comparison between two untouched databases cannot pass silently again.

set -uo pipefail

SOURCE="${1:?usage: flag_first_pairwise.sh <memory.db>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
WORK="$REPO_ROOT/tmp/ts5/flag-first"
SHADOW="$WORK/shadow"
SHADOW_LOG="$WORK/shadow.log"

rm -rf "$WORK" && mkdir -p "$SHADOW"
: > "$SHADOW_LOG"
for bin in python python3 uv; do
  printf '#!/bin/sh\necho "TS5 SPAWN: %s $*" >> "%s"\nexit 66\n' "$bin" "$SHADOW_LOG" > "$SHADOW/$bin"
  chmod +x "$SHADOW/$bin"
done

lim() { perl -e 'alarm shift; exec @ARGV' "$@"; }

fresh_home() {
  rm -rf "$1" && mkdir -p "$1"
  cp "$SOURCE" "$1/memory.db"
}

normalize() {
  sed -E -e "s#$2#<HOME>#g" -e 's/`[0-9a-f]{8}`/`<ID>`/g' "$1"
}

rows() {
  sqlite3 "$1" \
    "SELECT title, status, journey, due_date, stage FROM tasks ORDER BY title, status;
     SELECT layer, key, content FROM identity WHERE layer IN ('journey_path', 'journey') ORDER BY layer, key;"
}

run_py() {
  (cd "$REPO_ROOT" && unset MIRROR_USER DB_PATH MEMORY_DIR && MIRROR_HOME="$1" MEMORY_ENV=production lim 60 uv run python -m memory "${@:2}" \
    </dev/null >"$1.out" 2>"$1.err")
}

run_ts() {
  (cd "$REPO_ROOT" && unset MIRROR_USER DB_PATH MEMORY_DIR && PATH="$SHADOW:$PATH" MIRROR_HOME="$1" MEMORY_ENV=production NODE_OPTIONS=--no-warnings \
    lim 60 node ts/src/frontDoor/cli.ts "${@:2}" </dev/null >"$1.out" 2>"$1.err")
}

SAME=0
DIFF=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  [[ "$line" == \#* ]] && continue
  expect="same"
  if [[ "$line" == DEVIATION:* ]]; then expect="deviation"; line="${line#DEVIATION:}"; fi

  PY="$WORK/py" TS="$WORK/ts"
  fresh_home "$PY"; fresh_home "$TS"
  IFS='|' read -r -a shape <<< "$line"
  run_py "$PY" "${shape[@]//@H/$PY}"; py_exit=$?
  run_ts "$TS" "${shape[@]//@H/$TS}"; ts_exit=$?

  # Did each engine touch the copy it was given? Must agree, and is shown.
  py_wrote=$(diff -q <(rows "$PY/memory.db") <(rows "$SOURCE") >/dev/null && echo read || echo wrote)
  ts_wrote=$(diff -q <(rows "$TS/memory.db") <(rows "$SOURCE") >/dev/null && echo read || echo wrote)
  stray=$(ls "$PY" "$TS" | grep -c 'memory_.*\.db$')

  verdict="SAME"
  [ "$py_exit" = "$ts_exit" ] || verdict="DIFF"
  # 126/127 is the HARNESS failing to run an engine, not an engine answering.
  # Two of them agree perfectly and prove nothing -- which is how an earlier
  # draft reported 28/28 while running neither engine at all.
  case "$py_exit $ts_exit" in *126*|*127*) verdict="HARNESS" ;; esac
  [ "$py_wrote" = "$ts_wrote" ] || verdict="DIFF"
  [ "$stray" = "0" ] || verdict="DIFF"
  diff -q <(normalize "$PY.out" "$PY") <(normalize "$TS.out" "$TS") >/dev/null || verdict="DIFF"
  diff -q <(normalize "$PY.err" "$PY") <(normalize "$TS.err" "$TS") >/dev/null || verdict="DIFF"
  diff -q <(rows "$PY/memory.db") <(rows "$TS/memory.db") >/dev/null || verdict="DIFF"

  shown="${line//|/ }"
  printf '%-4s %-11s exit py=%s ts=%s  %-5s  %s\n' "$verdict" "($expect)" "$py_exit" "$ts_exit" "$ts_wrote" "$shown"
  if [ "$verdict" != "SAME" ]; then
    diff <(normalize "$PY.out" "$PY") <(normalize "$TS.out" "$TS") | head -4 | sed 's/^/       out /'
    diff <(normalize "$PY.err" "$PY") <(normalize "$TS.err" "$TS") | head -3 | sed 's/^/       err /'
    diff <(rows "$PY/memory.db") <(rows "$TS/memory.db") | head -4 | sed 's/^/       row /'
  fi
  if [ "$verdict" = "SAME" ] || { [ "$expect" = "deviation" ] && [ "$verdict" != "HARNESS" ]; }; then
    SAME=$((SAME + 1))
  else
    DIFF=$((DIFF + 1))
  fi
done <<'SHAPES'
# Reads -- five families whose flag-first form only Python answered.
extensions|--mirror-home|@H
extensions|--mirror-home|@H|list
list|--mirror-home|@H
list|--mirror-home|@H|personas
list|--mirror-home|@H|journeys
list|--mirror-home|@H|--verbose|personas
descriptor|--mirror-home|@H|list
week|--mirror-home|@H
week|--mirror-home|@H|view
inspect|--mirror-home|@H|persona|demo-code-reviewer
inspect|--mirror-home|@H|persona|nobody
inspect|--mirror-home|@H|extension|nope
# Reads -- two families already on TypeScript.
tasks|--mirror-home|@H
tasks|--mirror-home|@H|list
tasks|--all|--mirror-home|@H
journey|--mirror-home|@H|status
journey|--mirror-home|@H|demo-child-alpha
# Writes -- the rows are compared too.
tasks|--mirror-home|@H|add|Flag first task
tasks|--mirror-home|@H|done|demo-task-mon
tasks|--mirror-home|@H|doing|demo-task-mon
tasks|--mirror-home|@H|block|demo-task-mon
tasks|--mirror-home|@H|delete|demo-task-mon
tasks|--mirror-home|@H|done|no-such-task
journey|--mirror-home|@H|update|demo-child-alpha|Flag first content
week|--mirror-home|@H|save
# Oracle quirks TypeScript deliberately does not reproduce.
list|--mirror-home|@H|--verbose
DEVIATION:tasks|--mirror-home|@H|--journey|demo-child-alpha|add|Journey flag first
DEVIATION:tasks|--mirror-home|@H|--status|done|list
SHAPES

spawns="$(wc -l < "$SHADOW_LOG" | tr -d ' ')"
echo
echo "pairwise: $SAME agree or are named deviations, $DIFF differ unexpectedly; interpreter spawns under the shadow: $spawns"
[ "$spawns" = "0" ] || sort "$SHADOW_LOG" | uniq -c
[ "$DIFF" = "0" ] && [ "$spawns" = "0" ]
