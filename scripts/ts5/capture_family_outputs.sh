#!/usr/bin/env bash
# CV22.DS10.TS5, slice A — the per-family capture.
#
# Records what one representative invocation of each ported command family
# answers on a real database, as a hash rather than as text. Taken at plateau 0
# while Python still exists, replayed at plateau 3 after it is deleted; an
# empty diff between the two files is the story's central claim — that removing
# an engine changed nothing a user invokes.
#
# It has to be a hash. `real_db_copy_parity.py` and `route_matrix.ts` both die
# with the oracle, so nothing else can compare real output across the deletion,
# and the output itself is the Navigator's own memories, journeys, and
# conversations — which never enter a story package.
#
# Usage:
#   bash scripts/ts5/capture_family_outputs.sh tmp/ts5/pristine.db > out.tsv
#   bash scripts/ts5/capture_family_outputs.sh tmp/ts5/pristine.db --selftest
#
# --selftest runs every family twice on two fresh copies and reports the ones
# whose normalized output differs from itself. A family that cannot match
# itself ten seconds apart cannot prove anything four plateaus apart.
#
# What --selftest CANNOT catch, and the first cross-commit replay did: anything
# that varies with TIME rather than with the run. Two runs one second apart sit
# on the same commit, so a surface printing the git SHA looks perfectly
# deterministic -- and then differs on every replay. `runtime version` prints
# `Git commit:`, and it took an actual plateau-1 replay to see it. Hence the
# commit mask below; hence also the rule that a capture is re-taken at the
# BASELINE COMMIT whenever the normalizer changes, or the two files are hashed
# under different rules and the diff means nothing.
#
# The same replay showed the masks must cover CHECKOUT STATE too -- branch,
# clone role, update channel. Those describe the machine, not the engine, and
# the baseline replays from a git worktree where all three legitimately differ.
# What this capture is for is proving that REMOVING AN ENGINE changed no
# answer; a branch name is not an answer. The clone-role guard keeps its own
# direct coverage in cloneRoleGuard.test.ts and in the Navigator route.
#
# Deleted at Done? No — this script outlives the story, because it is the only
# before/after instrument the migration leaves behind.

set -uo pipefail

PRISTINE="${1:?usage: capture_family_outputs.sh <pristine.db> [--selftest]}"
MODE="${2:-capture}"
# `pwd -P`, not `pwd`: on macOS /tmp is a symlink to /private/tmp, and the
# front door resolves the repository path before printing it. With the logical
# form the mask misses by exactly the `/private` prefix, which is how three
# families looked changed when nothing had changed.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
WORK="$REPO_ROOT/tmp/ts5/capture-work"
SOURCE_HOME="${MIRROR_SOURCE_HOME:-$HOME/.mirror-minds/vinicius-ts}"

[ -f "$PRISTINE" ] || { echo "no pristine database at $PRISTINE" >&2; exit 2; }

# One representative invocation per ported family. Read-oriented by intent, but
# correctness does not depend on that: every invocation gets its own copy of
# the pristine database, so a family that writes cannot contaminate the next
# one or its own replay.
#
# Excluded, each for a stated reason:
#   - consult ask|credits, memories --search, journal, week save, the
#     conversation close tail: reach a provider. Cost and non-determinism.
#   - seed, init, backup, harvest, story, mirror log: writes whose output
#     embeds the thing they just created.
#   - runtime status|diagnose: report the git SHA of the working tree, which
#     legitimately differs between plateau 0 and plateau 3. Covered instead by
#     the Navigator route (test-guide steps 10-11).
FAMILIES=$(cat <<'EOF'
detect-persona|detect-persona a bug in the database migration
journeys|journeys
memories|memories --limit 5
memories-type|memories --type insight --limit 5
list-personas|list personas
list-journeys|list journeys
list-extensions|list extensions
inspect-persona|inspect persona engineer
identity-list|identity list
identity-get|identity get persona engineer
conversations|conversations --limit 5
conversation-logger|conversation-logger status
mode|mode status
tasks|tasks list
week|week view
shadow|shadow list
descriptor|descriptor list
extensions|extensions list
ext|ext list
mirror-journeys|mirror journeys
build-inspect-method|build inspect-method
build-pull-candidates|build pull-candidates --method ariad --journey mirror-ts-core
journey|journey mirror-ts-core
runtime-version|runtime version
runtime-release-notes|runtime release-notes latest
welcome|welcome
retired-workbench|build refinement-story pull
retired-backfill|conversations --metadata-backfill-preview
unknown-command|frobnicate
EOF
)

# Normalization. Everything masked here is something that legitimately differs
# between two runs on different days; nothing here can hide a routing or
# rendering change, which is what the capture exists to detect.
normalize() {
  sed -E \
    -e 's/[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:?[0-9]{2})?/<TIMESTAMP>/g' \
    -e 's/[0-9]{4}-[0-9]{2}-[0-9]{2}/<DATE>/g' \
    -e 's/\b[0-9]{2}:[0-9]{2}(:[0-9]{2})?\b/<TIME>/g' \
    -e 's/\b[0-9]+ (second|minute|hour|day|week|month|year)s? ago\b/<AGO>/g' \
    -e 's/\bh[áa] [0-9]+ (segundo|minuto|hora|dia|semana|m[êe]s|ano)s?\b/<AGO>/g' \
    -e 's/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/<UUID>/g' \
    -e 's/([Cc]ommit): [0-9a-f]{7,40}/\1: <SHA>/g' \
    -e 's/(Git branch): .*/\1: <BRANCH>/g' \
    -e 's/(Clone role): .*/\1: <ROLE>/g' \
    -e 's/(Update channel): .*/\1: <CHANNEL>/g' \
    -e 's/(channel) [a-z-]+/\1 <CHANNEL>/g' \
    -e 's/\b[0-9]+\.[0-9]+\.[0-9]+\b/<VERSION>/g' \
    -e "s#$WORK/[A-Za-z0-9._-]*#<WORK>#g" \
    -e "s#$REPO_ROOT#<REPO>#g" \
    -e "s#$HOME#<HOME>#g"
  # Order matters, and the self-test is what proved it: with <REPO> applied
  # first, the scratch path's prefix was already rewritten and the per-run tag
  # (.../capture-work/a/... vs .../b/...) survived into the hash, so three
  # families could not match themselves ten seconds apart. The work directory
  # is masked before the repository root that contains it.
}

run_family() {
  local slug="$1" argv="$2" tag="$3"
  local home="$WORK/$tag/vinicius-ts"
  rm -rf "$WORK/$tag"
  mkdir -p "$home"
  cp -c "$PRISTINE" "$home/memory.db" 2>/dev/null || cp "$PRISTINE" "$home/memory.db"
  [ -d "$SOURCE_HOME/identity" ]   && cp -R "$SOURCE_HOME/identity"   "$home/identity"
  [ -d "$SOURCE_HOME/extensions" ] && cp -R "$SOURCE_HOME/extensions" "$home/extensions"

  # stdout and stderr are captured SEPARATELY and hashed separately.
  #
  # The first draft discarded stderr, and the capture came back with the
  # sha256 of the empty string for three families -- the two retired refusals
  # and `build pull-candidates`. Those answer entirely on stderr, and so does
  # D2's new unknown-subcommand answer. A capture blind to stderr is blind to
  # exactly the surfaces this story is most likely to change.
  cd "$REPO_ROOT" || return 127
  MIRROR_HOME="$home" MIRROR_USER=vinicius-ts NODE_OPTIONS=--no-warnings \
    node ts/src/frontDoor/cli.ts $argv >"$WORK/$tag.out" 2>"$WORK/$tag.err"
  local exit_code=$?
  normalize < "$WORK/$tag.out"
  printf '\n--- stderr ---\n'
  normalize < "$WORK/$tag.err"
  return $exit_code
}

if [ "$MODE" = "--dump" ]; then
  # Debug aid: print one family's normalized streams instead of hashing them.
  while IFS='|' read -r slug argv; do
    [ -z "$slug" ] && continue
    [ "$slug" = "${3:-}" ] || continue
    run_family "$slug" "$argv" dump
  done <<< "$FAMILIES"
  rm -rf "$WORK"
  exit 0
fi

if [ "$MODE" = "--selftest" ]; then
  echo "family                 verdict   (two runs, two fresh copies)"
  while IFS='|' read -r slug argv; do
    [ -z "$slug" ] && continue
    a="$(run_family "$slug" "$argv" a)"; ea=$?
    b="$(run_family "$slug" "$argv" b)"; eb=$?
    if [ "$a" = "$b" ] && [ "$ea" = "$eb" ]; then
      printf '%-22s deterministic\n' "$slug"
    else
      printf '%-22s VOLATILE  (exit %s/%s, %s/%s lines)\n' \
        "$slug" "$ea" "$eb" "$(printf '%s' "$a" | wc -l | tr -d ' ')" "$(printf '%s' "$b" | wc -l | tr -d ' ')"
      diff <(printf '%s' "$a") <(printf '%s' "$b") | head -4 | sed 's/^/    /'
    fi
  done <<< "$FAMILIES"
  rm -rf "$WORK"
  exit 0
fi

printf 'family\targv\texit\tout_lines\terr_lines\tsha256_out\tsha256_err\n'
while IFS='|' read -r slug argv; do
  [ -z "$slug" ] && continue
  run_family "$slug" "$argv" cap > /dev/null; code=$?
  o_lines="$(normalize < "$WORK/cap.out" | grep -c '' | tr -d ' ')"
  e_lines="$(normalize < "$WORK/cap.err" | grep -c '' | tr -d ' ')"
  o_hash="$(normalize < "$WORK/cap.out" | shasum -a 256 | cut -d' ' -f1)"
  e_hash="$(normalize < "$WORK/cap.err" | shasum -a 256 | cut -d' ' -f1)"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$slug" "$argv" "$code" "$o_lines" "$e_lines" "$o_hash" "$e_hash"
done <<< "$FAMILIES"
rm -rf "$WORK"
