#!/bin/bash
# Run `eval --all` for one model, runs FIRST to LAST, through the product's own
# transport, each model with its own scratch eval history.
#
#   run_model.sh <slug> <model-id> <reasoning-effort|-> <first-run> <last-run>
#
# `-` leaves MEMORY_EXTRACTION_REASONING unset: the request as the model ships.
# OUT (default /tmp/mm-model-eval-ts1) receives <slug>/run<N>.out, the traces,
# and the scratch home; the repository is the checkout this file lives in.
set -u
slug=$1 model=$2 reasoning=$3 from=$4 to=$5
kit=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$kit" rev-parse --show-toplevel)
out=${OUT:-/tmp/mm-model-eval-ts1}
# MIRROR_HOME's last segment must match the MIRROR_USER the clone's .env sets.
user=$(grep -E '^MIRROR_USER=' "$repo/.env" 2>/dev/null | cut -d= -f2)
user=${user:-eval}
base=$out/$slug
mkdir -p "$base/$user"
git -C "$repo" rev-parse HEAD > "$out/commit.txt"
cd "$repo" || exit 1
for i in $(seq "$from" "$to"); do
  echo "=== run $i start $(date +%T)" >> "$base/progress.log"
  if [ "$reasoning" = "-" ]; then set_reasoning=(-u MEMORY_EXTRACTION_REASONING); else set_reasoning=(MEMORY_EXTRACTION_REASONING="$reasoning"); fi
  env "${set_reasoning[@]}" \
    MEMORY_EXTRACTION_MODEL="$model" \
    MIRROR_HOME="$base/$user" \
    DB_PATH="$HOME/.mirror-minds/$user/memory.db" \
    MM_TRACE="$base/trace.run$i.jsonl" \
    node --env-file-if-exists=.env --import "$kit/shim.mjs" ts/evals/harness/cli.ts --all \
    > "$base/run$i.out" 2>&1
  echo "=== run $i exit $? end $(date +%T)" >> "$base/progress.log"
done
