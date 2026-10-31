#!/bin/bash
# One replay arm, in its own process, with the arm's model and reasoning setting in
# that process's environment (CV9.DS9.TS2).
#
#   run_arm.sh <arm> <model-id> <reasoning-effort|->
#
# `-` leaves MEMORY_EXTRACTION_REASONING unset: the request as the model ships.
# The trace (TS1's preload, by path) holds response bodies, so it is written to
# scratch, never to the repository.
set -u
arm=$1 model=$2 reasoning=$3
kit=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$kit" rev-parse --show-toplevel)
scratch=${TS2_SCRATCH:-$HOME/mirror-ts2-replay}
shim="$kit/../../../cv9-ds9-ts1-reasoning-setting/evidence/2026-10-26-reasoning-off/shim.mjs"
mkdir -p "$scratch/traces" && chmod 700 "$scratch" "$scratch/traces"
if [ "$reasoning" = "-" ]; then set_reasoning=(-u MEMORY_EXTRACTION_REASONING); else set_reasoning=(MEMORY_EXTRACTION_REASONING="$reasoning"); fi
cd "$repo" || exit 1
env "${set_reasoning[@]}" MEMORY_EXTRACTION_MODEL="$model" MM_TRACE="$scratch/traces/$arm.jsonl" \
  node --env-file-if-exists=.env --import "$shim" "$kit/replay.mjs" "$arm" \
  > "$scratch/replay-$arm.log" 2>&1
echo "exit $?" >> "$scratch/replay-$arm.log"
