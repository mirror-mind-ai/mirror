# Validation — CV21.DS8.US2

## Status

Passed

## Automated Checks

- npm test 3306/3306 (3 pre-existing skips); retiredSurfaces 50/50 with the widened row; buildClaudePlugin --check in sync; checkRetiredSurfaces.ts clean (gemini-cli stayed retired); biome clean; checkDocLinks 2 broken before, 1 after (the remaining one predates DS8: plugins/mirror-mind/rules/AGENTS.md's root-relative REFERENCE.md link, since DS7.US1)

Checks status: passed

## E2E

Decision: not_required

Evidence: Prose and one guard table; no runtime behavior moves. The guards (operating-instructions, claude-plugin drift, retired-surface) and the release tripwire are the end-to-end proof the tree says one thing everywhere.

## Navigator Validation

Route: 1) the inventory grep (\bgemini\b, model names excluded) outside history finds only past tense, model mentions, tests about the retirement, and the guard table; 2) Getting Started §1/§6/§7/§8/§9 read as a new user: four runtimes, no Gemini CLI step, an Antigravity section stating only what DS7.US4 measured; 3) checkRetiredSurfaces.ts exit 0; 4) diff AGENTS.md plugins/mirror-mind/rules/AGENTS.md empty; 5) mm-consult's gemini model rows intact

Navigator accepted: yes

Expected observation: Every runtime-facing doc names Pi, Claude Code, Codex, Antigravity; the tripwire passes; the copies are byte-equal; model mentions and history untouched

Pass condition: All five observations as the test guide states

Fail condition: A live sentence still presents Gemini CLI as supported, wired, or an option; a Gemini CLI wiring step survives in Getting Started; the tripwire reports a gemini-cli problem; the AGENTS.md copies differ; a model mention was swept

## Missing Evidence

- none
<!-- ariad-seal sha256:59dfb3ff84ba1b3a855c547d0e2ae4dc21f51b9ede3f9263dccbf697c88c05bd — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
