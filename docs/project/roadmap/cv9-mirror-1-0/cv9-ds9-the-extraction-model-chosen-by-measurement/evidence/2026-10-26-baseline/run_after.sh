#!/bin/bash
# Wait for a model's 5 runs to finish, then run 6-7 with the corrected shim.
slug=$1; model=$2
while [ "$(grep -c exit $slug/progress.log)" -lt 5 ]; do sleep 5; done
./run_model.sh "$slug" "$model" 6 7
