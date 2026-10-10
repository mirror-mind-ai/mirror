# Validation — CV22.DS10.US3

## Status

Passed

## Automated Checks

- npm test (3046 pass), typecheck, biome, checkRetiredSurfaces (11 rows), checkPackContents (467 files, paths and content), checkSkillCommandParity, checkDocLinks, generate_hook_wrappers --check, smoke_npm_package.sh 68/68, smoke_runtime_update.sh 86/86; CI green on both legs and the smoke job (38044030137)

Checks status: passed

## E2E

Decision: required

Evidence: Routes 1/1b/2a/2b (2026-10-06) and 3 steps 1-5 (2026-10-09) walked by the Navigator on a scratch prefix, home, config, and Pi sessions, and a real Claude Code session on the installed package; route 3e (2026-10-09) the updater's package lane; route 4 (2026-10-10) the plateau-0 capture replayed through mirror on the same pristine.db

## Navigator Validation

Route: test-guide.md routes 1-4: npm link in the checkout; pack+install+init+seed+pi install from /tmp; the plugin copied out of the tree under Claude Code; runtime channel and the promotion dry run; FRONT_DOOR=mirror bash scripts/capture_family_outputs.sh tmp/us3/pristine.db, diffed against tmp/us3/before.tsv

Navigator accepted: yes

Expected observation: mirror answers from the PATH with no checkout; twelve personas; config 0600/0700; Install: package in runtime status; every runtime answers /mm-journeys from the install and routes a Mirror Mode question under a persona signature (D13); hooks find mirror-hook wherever the plugin is copied; the replay diff names only runtime-version, 8 to 9 lines (the Install: line)

Pass condition: every route step passes as written; the replay differs only in runtime-version's Install: line

Fail condition: any route step fails, any skill names the checkout form, an interpreter is spawned, or any other capture family's hash moves

## Missing Evidence

- none
<!-- ariad-seal sha256:aa25503cbb7e3ef4d6a6e0c23978354f8f894626a350e403ff14da16cc5f86a0 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
