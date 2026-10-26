#!/bin/bash
# Pool two run sets of the same configuration into one directory for analyze.mjs:
# the second set's traces are renumbered after the first's, and each model's eval
# records are concatenated in run order.
#   combine.sh <first-out> <second-out> <combined-out>
set -eu
first=$1 second=$2 combined=$3
for dir in "$first"/*/; do
  slug=$(basename "$dir")
  [ -d "$second/$slug" ] || continue
  user=$(ls "$first/$slug" | grep -v -E '\.(log|out|jsonl)$' | head -1)
  mkdir -p "$combined/$slug/$user/eval-history"
  n=$(ls "$first/$slug"/trace.run*.jsonl | wc -l | tr -d ' ')
  cp "$first/$slug"/trace.run*.jsonl "$combined/$slug/"
  for t in "$second/$slug"/trace.run*.jsonl; do
    i=$(basename "$t" | sed -E 's/trace\.run([0-9]+)\.jsonl/\1/')
    cp "$t" "$combined/$slug/trace.run$((i + n)).jsonl"
  done
  for h in "$first/$slug/$user/eval-history"/*.jsonl; do
    name=$(basename "$h")
    cat "$h" "$second/$slug/$user/eval-history/$name" > "$combined/$slug/$user/eval-history/$name"
  done
done
