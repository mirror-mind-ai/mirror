# Validation — CV22.DS10.US2

## Status

Passed

## Automated Checks

- npm test 2578 pass; uv run pytest 2091 pass (3.10 and 3.12); scripts/smoke_runtime_update.sh 34/34 on ubuntu and macOS; runtime-backup and runtime-git goldens byte-identical; doc links, oracle drift, retired surfaces, Node skill parity clean

Checks status: passed

## E2E

Decision: required

Evidence: Performed as an operational smoke against a real tree with python/python3/uv shadowed to exit 66: nine stages pass, HEAD fast-forwards, the _migrations ledger moves 16 to 17 through a fresh-process migrate, PRAGMA integrity_check is ok, the archive independently re-verifies, and one line lands in front-door.log. The three failure paths are covered: diverged (tree and ledger unchanged, captured sha in the recovery block), --dry-run (nothing touched), repair lane (fast-forward, migrations skipped). The Navigator-visible two-hop route on the production clone is NOT run and is carried as a post-merge obligation: this branch is not an ancestor of origin/main or origin/stable, so that clone cannot fast-forward to code containing the TS updater.

## Navigator Validation

Route: Navigator reviewed the automated and operational evidence and accepted the smoke as this story's E2E evidence, sequencing the production-clone two-hop route after the branch merges to main.

Navigator accepted: yes

Expected observation: runtime update answers from TypeScript with no interpreter spawned; the release chain answers its cutoff before dispatch; PYTHON_ALLOWLIST no longer exists

Pass condition: Every automated check green on the pushed commit, the smoke green on both platforms, and the two-engine comparisons byte-identical

Fail condition: Any interpreter spawn during an update, any stage regression, or any two-engine comparison differing outside a recorded deviation

## Missing Evidence

- none
