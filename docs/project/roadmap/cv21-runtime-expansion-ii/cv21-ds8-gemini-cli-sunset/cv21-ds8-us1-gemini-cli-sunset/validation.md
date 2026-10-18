# Validation — CV21.DS8.US1

## Status

Passed

## Automated Checks

- npm test: 3306/3306 pass (3 pre-existing skips); scripts/smoke_npm_package.sh 70/70, no Gemini section; smoke_mirror_mcp pass; smoke_claude_plugin step 6 fails identically on the clean tree (global /opt/homebrew/bin/mirror-hook defeats the 'gone' simulation; CI unaffected); biome clean; one pre-existing tsc error in hooks/agy.ts

Checks status: passed

## E2E

Decision: required

Evidence: scripts/smoke_npm_package.sh installs the packed tarball from nothing: 70 passed, 0 failed, 487 files, no .gemini/ path

## Navigator Validation

Route: 1) npm pack --dry-run shows no .gemini/ path; 2) scratch home with a gemini stub on PATH, mirror init prints no Gemini CLI block; 3) mirror-hook gemini:session-start exits 0, empty stdout, 'unknown hook name' in hooks.log; 4) git grep sweep outside history matches only US2-owned docs and the guard table; 5) mirror recall of a gemini_cli conversation (18 in the dev home) loads as before

Navigator accepted: yes

Expected observation: No Gemini CLI path ships, init does not know the runtime, the hook family is unknown, live code/CI/dev-guide are clean, gemini_cli history still reads

Pass condition: All five observations as the test guide states; US2-owned doc mentions remain and are not this story's fail

Fail condition: Any .gemini/ path in the tarball; a Gemini CLI block from init; the Gemini session start running; a live code/CI match; a gemini_cli conversation missing or erroring

## Missing Evidence

- none
<!-- ariad-seal sha256:f66e762ddc10de7bfa6799ca88d38e4d4e2c381ff1def7dc048d52a7f24a9e5f — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
