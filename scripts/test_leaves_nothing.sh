#!/usr/bin/env bash
# CR163 — the suite leaves nothing behind.
#
# Runs `npm test` with TMPDIR at an empty directory of its own and, if the
# suite passed, fails when anything is left in it, listed by prefix so the
# log alone names the test that left it. One script for CI's Tests workflow
# and for the Navigator's validation route, so the two cannot drift.
#
# It sees every temp home because the repository guard
# (ts/scripts/checkTestTempHomes.ts) keeps a literal /tmp out of ts/test: a
# home made there would escape this directory. It deletes nothing it finds;
# it only reports.
#
# Usage: bash scripts/test_leaves_nothing.sh
#   On CI the directory is made under RUNNER_TEMP; elsewhere under the
#   system temp folder.

set -euo pipefail

if [ -n "${RUNNER_TEMP:-}" ]; then
  suite_tmp=$(mktemp -d "${RUNNER_TEMP}/suite-tmp.XXXXXX")
else
  suite_tmp=$(mktemp -d)
fi
echo "suite TMPDIR: ${suite_tmp}"

# npm 11 turns on Node's module compile cache for its own start-up, in
# os.tmpdir()/node-compile-cache. That is npm's, not a test's, and no test uses
# it, so the run turns it off rather than this script keeping an exception.
#
# Only a passing suite is checked: a failing test is one failure, not two.
set +e
TMPDIR="${suite_tmp}" NODE_DISABLE_COMPILE_CACHE=1 npm test
status=$?
set -e
if [ "${status}" -ne 0 ]; then
  echo "npm test failed (exit ${status}); leftovers not checked" >&2
  exit "${status}"
fi

left=$(find "${suite_tmp}" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')
if [ "${left}" -eq 0 ]; then
  rmdir "${suite_tmp}"
  echo "The suite left nothing behind."
  exit 0
fi

# A directory mkdtemp made is its prefix and six characters: strip them to
# group. A file keeps its whole name.
echo "The suite left ${left} entries in ${suite_tmp}, by prefix:" >&2
find "${suite_tmp}" -mindepth 1 -maxdepth 1 | while read -r path; do
  name=$(basename "${path}")
  if [ -d "${path}" ]; then
    printf '%s\n' "${name}" | sed -E 's/[A-Za-z0-9]{6}$/…/'
  else
    printf '%s\n' "${name}"
  fi
done | sort | uniq -c | sort -rn >&2
exit 1
