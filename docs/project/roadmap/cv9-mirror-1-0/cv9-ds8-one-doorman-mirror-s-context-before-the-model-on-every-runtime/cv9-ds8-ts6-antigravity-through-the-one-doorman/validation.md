# Validation — CV9.DS8.TS6

## Status

Passed

## Automated Checks

- node --test ts/test/hooks/agy.test.ts: 21/21 (8/21 red before); claudeInject.test.ts 6/6 on the shared fixture; npm test 3524 pass, 0 fail, 3 skipped (a global install on this machine); typecheck; lint; git diff --check; doc-link, pack-contents, plugin-sync, skill-parity, retired-surface checks; smoke_mirror_mcp.sh passed; smoke_claude_plugin.sh fails at step 6 identically with the story's code stashed (global /opt/homebrew/bin/mirror-hook), recorded in the test guide

Checks status: passed

## E2E

Decision: required

Evidence: The Navigator's walk on agy 1.4.7, real providers, headless and interactive (docs/project/roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/evidence/walk-20261025.md): every verdict PASS; one full step per explicit turn, one delta per ordinary turn with the persona re-routed and signed, none on skill turns or after the Builder switch; 6/6 logged as antigravity; hooks.log empty; hook 0.23-1.02 s against a 15 s budget. Before it, the Driver's headless smoke (docs/project/roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/evidence/driver-smoke-20261025.md).

## Navigator Validation

Route: bash docs/project/roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/route.sh walk with TS6_OPENROUTER_API_KEY, then the five interactive prompts

Navigator accepted: yes

Expected observation: One Mirror step per Mirror turn (full on the explicit form, delta on ordinary turns, re-routed), none on skill turns or after a switch that landed on the session; the 4b limit observed; logging equal; hooks.log empty; timing under budget

Pass condition: Every verdict PASS, hooks.log empty headless and after the interactive session, no doorman cost on a skill turn, timing under 15 s

Fail condition: A second load by the model on the explicit turn, a step on a skill turn or after the switch, a wrong persona in the delivered line, unequal log counts, any hooks.log line, or a hook over budget

## Missing Evidence

- none
<!-- ariad-seal sha256:9f69ab9aeea2d0307f0fe8a69ca84aa423954d4dd8ac06c19dc05ce1c1faa3eb — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
