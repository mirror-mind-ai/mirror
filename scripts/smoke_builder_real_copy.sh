#!/usr/bin/env bash
# CV22.DS7.US8 — Navigator validation step 3, made portable.
#
# Drives one Ariad story lifecycle (guard → plan → approve → guard → validate →
# review → coherence → done) on BOTH engines, each in its own world: a copy of
# the given database and a scratch clone of this repository. After every step
# the two worlds are compared on four faces — streams and exit code, the
# delivery cursor's metadata BYTES, the closure artifacts written into the
# clone, and the Journey projection receipts the seam published.
#
# Copy-only and offline by construction: the real home and the real checkout
# are never opened for writing, and the provider key is emptied in both
# environments. The TypeScript side runs through the real front door under
# MIRROR_TS_BUILD=1 so the route, not only the command tree, is graded.
#
# Usage:
#   scripts/smoke_builder_real_copy.sh --source-db ~/.mirror-minds/<user>/memory.db \
#       [--journey <slug>] [--root <dir>]
#
# The journey must already exist in the source database and have `ariad`
# adopted; the lifecycle acts on whatever item its cursor holds. A cursor at a
# stage that refuses `plan-item` still grades — both engines must refuse alike.
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DB=""
JOURNEY="mirror-ts-core"
ROOT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --source-db) SOURCE_DB="$2"; shift 2 ;;
    --journey) JOURNEY="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SOURCE_DB" ] && [ -f "$SOURCE_DB" ] || { echo "--source-db <existing memory.db> is required" >&2; exit 2; }
SOURCE_DB="$(cd "$(dirname "$SOURCE_DB")" && pwd)/$(basename "$SOURCE_DB")"
HOME_BASENAME="$(basename "$(dirname "$SOURCE_DB")")"
[ -n "$ROOT" ] || ROOT="$(mktemp -d /tmp/builder-real-copy-XXXX)"
mkdir -p "$ROOT"
SNAP="$ROOT/snapshot.db"
CURSOR_KEY="__builder_delivery_cursor__:$JOURNEY"

cd "$REPO"
rm -rf "$ROOT/py" "$ROOT/ts" "$ROOT/steps"
mkdir -p "$ROOT/steps"
# A consistent snapshot, taken once, so both worlds start from the same bytes.
sqlite3 "$SOURCE_DB" ".backup '$SNAP'"

# Two-character world names keep the two clone roots the same length: surfaces
# wrap absolute paths, and roots of different lengths would wrap differently.
for w in py ts; do
  mkdir -p "$ROOT/$w/$HOME_BASENAME"
  cp "$SNAP" "$ROOT/$w/$HOME_BASENAME/memory.db"
  git clone -q --local --no-hardlinks "$REPO" "$ROOT/$w/clone"
  git -C "$ROOT/$w/clone" checkout -q "$(git rev-parse HEAD)"
done

# Both engines: the copy home, no inherited TS gates, no provider key. Node's
# --env-file and memory.config's .env loader both defer to an existing variable,
# so an EMPTY key stays empty on both sides.
unset_ts_gates() { env | sed -n 's/^\(MIRROR_TS_[A-Z_]*\)=.*/-u \1/p'; }
py_env() {
  # shellcheck disable=SC2046
  env -u MIRROR_SESSION_ID -u MEMORY_ENV -u DB_PATH $(unset_ts_gates) \
    MIRROR_HOME="$ROOT/$1/$HOME_BASENAME" MIRROR_USER="$HOME_BASENAME" OPENROUTER_API_KEY= "${@:2}"
}
ts_env() {
  # shellcheck disable=SC2046
  env -u MIRROR_SESSION_ID -u MEMORY_ENV -u DB_PATH $(unset_ts_gates) \
    MIRROR_HOME="$ROOT/$1/$HOME_BASENAME" MIRROR_USER="$HOME_BASENAME" OPENROUTER_API_KEY= \
    MIRROR_TS_BUILD=1 NODE_OPTIONS=--no-warnings "${@:2}"
}

# Setup (ungraded): point each copy's journey at its own scratch clone.
for w in py ts; do
  py_env "$w" uv run python -m memory journey set-path "$JOURNEY" "$ROOT/$w/clone" >/dev/null 2>&1 \
    || { echo "journey set-path failed for world $w" >&2; exit 1; }
done

normalize() { sed -e "s#$ROOT/py#<W>#g" -e "s#$ROOT/ts#<W>#g"; }
cursor() { sqlite3 "$ROOT/$1/$HOME_BASENAME/memory.db" "select metadata from runtime_sessions where session_id='$CURSOR_KEY';"; }
receipts() {
  local p="$ROOT/$1/clone/.mirror/projections"
  [ -d "$p" ] || { echo "0 receipts"; return; }
  echo "$(find "$p/.receipts" -type f 2>/dev/null | wc -l | tr -d ' ') receipts; $(cd "$p" && find . -type f ! -path './.receipts/*' ! -name '.publication.lock' | sort | tr '\n' ' ')"
}
artifacts() {
  ( cd "$ROOT/$1/clone" \
    && git status --porcelain -- docs/project/roadmap | sort \
    && for f in $(git status --porcelain -- docs/project/roadmap | awk '{print $2}' | sort); do
         echo "=== $f"; cat "$f"; done ) | normalize
}

FAILURES=0
step() {
  local n="$1"; shift; local label="$1"; shift
  local d="$ROOT/steps/$n-$label"; mkdir -p "$d"
  py_env py uv run python -m memory build "$@" > "$d/py.out" 2> "$d/py.err"; echo $? > "$d/py.code"
  ts_env ts node --env-file=.env ts/src/frontDoor/cli.ts build "$@" > "$d/ts.out" 2> "$d/ts.err"; echo $? > "$d/ts.code"
  cursor py > "$d/py.cursor"; cursor ts > "$d/ts.cursor"
  artifacts py > "$d/py.artifacts"; artifacts ts > "$d/ts.artifacts"
  receipts py > "$d/py.receipts"; receipts ts > "$d/ts.receipts"
  local streams="same" cur="same" art="same" rec="same"
  cmp -s <(normalize < "$d/py.out") <(normalize < "$d/ts.out") || streams="DIFF(stdout)"
  cmp -s <(normalize < "$d/py.err") <(normalize < "$d/ts.err") || streams="$streams DIFF(stderr)"
  cmp -s "$d/py.code" "$d/ts.code" || streams="$streams DIFF(exit)"
  cmp -s "$d/py.cursor" "$d/ts.cursor" || cur="DIFF"
  cmp -s "$d/py.artifacts" "$d/ts.artifacts" || art="DIFF"
  cmp -s "$d/py.receipts" "$d/ts.receipts" || rec="DIFF"
  case "$streams$cur$art$rec" in *DIFF*) FAILURES=$((FAILURES + 1)) ;; esac
  printf '%-2s %-16s exit py=%s ts=%s  stdout=%6sB  streams=%-12s cursor=%-5s artifacts=%-5s receipts=%s (%s)\n' \
    "$n" "$label" "$(cat "$d/py.code")" "$(cat "$d/ts.code")" "$(wc -c < "$d/py.out" | tr -d ' ')" \
    "$streams" "$cur" "$art" "$rec" "$(cut -d';' -f1 < "$d/py.receipts")"
}

M=(--method ariad --journey "$JOURNEY")
step 1 guard-before   check-implementation "${M[@]}"
step 2 plan-item      plan-item "${M[@]}" --objective "Smoke objective: grade both engines on a real-database copy"
step 3 approve-plan   approve-plan "${M[@]}"
step 4 guard-after    check-implementation "${M[@]}"
step 5 validate-item  validate-item "${M[@]}" \
  --check "smoke check one" --check "smoke check two" \
  --checks-status passed --e2e-decision required \
  --e2e-evidence "smoke e2e evidence" --navigator-route "smoke navigator route" \
  --navigator-accepted --implementation-complete \
  --expected-observation "identical streams and cursor bytes on both engines" \
  --pass-condition "diff-clean" --fail-condition "any surface or cursor-byte difference"
step 6 review-item    review-item "${M[@]}" \
  --debt "smoke debt finding" --decision defer \
  --defer-reason "smoke defer reason" --revisit-trigger "smoke revisit trigger"
step 7 coherence-item coherence-item "${M[@]}" \
  --process "smoke process alignment" --project "smoke project alignment" \
  --product "smoke product alignment" --local-difference "smoke local difference"
step 8 done-item      done-item "${M[@]}" \
  --history-action "smoke history action" --roadmap-update "smoke roadmap update" \
  --next-recommendation "smoke next recommendation"

echo "worlds: $ROOT (copy-only; the source database was not opened for writing)"
if [ "$FAILURES" -eq 0 ]; then
  echo "builder real-copy lifecycle: both engines agree at every step"
else
  echo "builder real-copy lifecycle: $FAILURES step(s) differ — inspect $ROOT/steps" >&2
  exit 1
fi
