# Validation — CV21.DS10.TS4

## Status

Passed

## Automated Checks

- npm run typecheck; npm run lint; npm test (3333 tests, 3330 pass, 0 fail); checkPackContents (488 files, clean); checkDocLinks (clean); buildClaudePlugin.ts --check (in sync, rules/AGENTS.md regenerated); smoke_claude_plugin.sh through step 4 (CR142 on this machine); the new runtimePolicy and injectForms tests red before the change, green after

Checks status: passed

## E2E

Decision: not_required

Evidence: Not required for the documents; for CR143 the direct wrapper run is the measure (Grok's model never saw the context, so no session could show a difference): route.sh hook ran mirror-inject.sh against a scratch home with Grok-shaped (176 ms, 166 ms by env; nothing printed, nothing loaded), Claude-shaped (305-317 ms, loaded) and Codex-shaped (263 ms, loaded) payloads. route.sh docs: 43/43 sentences where the plan puts them, zero 'four runtimes', no story code/level/ms/injected in Getting Started's Grok section.

## Navigator Validation

Route: From the story package: bash route.sh docs; read Getting Started's and the contract's Grok Build sections; bash route.sh hook; bash route.sh untouched

Navigator accepted: yes

Expected observation: every grep found, both checks clean; the Grok-shaped payload answered in tens of milliseconds with no load, the others unchanged; the honest line reads as honest

Pass condition: docs 43/43, hook 5/5, untouched green, and the Navigator's read

Fail condition: a sentence missing or misplaced, a stale 'four runtimes', a line promising per-turn context on Grok, a load on the Grok payload, or a change on the Claude/Codex ones

## Missing Evidence

- none
<!-- ariad-seal sha256:b605a367aace05e652b4c22005f8a6a6ae77de5814ee6a4f6841f1ffad9dfc0f — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
