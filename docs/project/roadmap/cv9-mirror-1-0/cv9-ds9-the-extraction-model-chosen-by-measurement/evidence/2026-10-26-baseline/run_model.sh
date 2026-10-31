#!/bin/bash
# usage: run_model.sh <slug> <model-id> <first-run> <last-run>
slug=$1; model=$2; from=$3; to=$4
base=/tmp/mm-model-eval/$slug; mkdir -p "$base/vinicius-dev"
cd /Users/vinicius/dev/workspace/mirror-dev
for i in $(seq "$from" "$to"); do
  echo "=== run $i start $(date +%T)" >> "$base/progress.log"
  MEMORY_EXTRACTION_MODEL="$model" MIRROR_HOME="$base/vinicius-dev" DB_PATH="$HOME/.mirror-minds/vinicius-dev/memory.db" \
  MM_TRACE="$base/trace.run$i.jsonl" \
    node --env-file-if-exists=.env --import /tmp/mm-model-eval/shim.mjs ts/evals/harness/cli.ts --all > "$base/run$i.out" 2>&1
  echo "=== run $i exit $? end $(date +%T)" >> "$base/progress.log"
done
