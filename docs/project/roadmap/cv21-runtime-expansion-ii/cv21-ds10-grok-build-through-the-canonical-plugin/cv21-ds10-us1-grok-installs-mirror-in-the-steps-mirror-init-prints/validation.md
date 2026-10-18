# Validation — CV21.DS10.US1

## Status

Passed

## Automated Checks

- npm run typecheck; npm run lint; npm test (3329 tests, 3326 pass, 0 fail); checkPackContents (clean); checkDocLinks (clean); buildClaudePlugin.ts --check (in sync); the new marker, wiring, init, reader/finding, and update-hint tests red before the change and green after it

Checks status: passed

## E2E

Decision: required

Evidence: route.sh grok on the installed grok 1.0.62 from a scratch HOME/GROK_HOME: the two printed steps load 25 skills from source plugin, the hooks file once, the mirror-mind MCP server (stdio), the rule as global (~2,233 tokens), plugin list at 0.35.0; undone clean. route.sh guards: one MCP server on Claude Code 2.1.296, agy 1.4.2, Codex 0.163.0, grok 1.0.62. route.sh diagnose: one finding per broken wiring, none when clean. route.sh untouched: 111 real-config entries unchanged.

## Navigator Validation

Route: From the story package: bash route.sh setup; bash route.sh static; bash route.sh guards; bash route.sh grok; bash route.sh diagnose; bash route.sh untouched (test-guide.md, steps 1-5)

Navigator accepted: yes

Expected observation: init prints the Grok Build block with the two steps and both notes, the other four blocks unchanged; every runtime's validator sees one MCP server; grok inspect --json lists 25 plugin skills, the hooks file, the MCP server, and the global rule; diagnose names one finding per broken wiring with the reinstall line, none on a clean home; the real ~/.grok and ~/.claude hash unchanged

Pass condition: every route step reports failed: 0, with the one noted exception in static: smoke_claude_plugin step 5, pre-existing on a machine with a global mirror-hook in a probed directory

Fail condition: a step differing from the probe's selection, a second MCP server on any runtime, a skill from source user, no server or rule listed, a missing or extra diagnose finding, or any change in the real configuration

## Missing Evidence

- none
<!-- ariad-seal sha256:197e328b03c9c4eb559a0a93ec09ddd805fd3a5452d7c58b13f5ac76225eb5d1 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
