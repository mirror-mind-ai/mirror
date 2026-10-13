# Validation — CV21.DS2.TS4

## Status

Passed

## Automated Checks

- CI smoke job run 38304396661 (d74b573d, docs-only changes since): scripts/smoke_claude_plugin.sh hooks, claude_code logging, MCP launcher, missing mirror-hook case all pass; local run 2026-10-13 (Claude Code 2.1.296): validate and sections 2-4 pass, section 5 fails on CR123's known case as the Plan expected; buildClaudePlugin.ts --check in sync

Checks status: passed

## E2E

Decision: required

Evidence: CV21.DS12.TS1 live session on Claude Code 2.1.296 (2026-10-13): hooks fire, Operating Instructions and per-turn context reach the model, Mirror Mode answers through the plugin, 7 MCP tools; DS12 untouched check: real configs and Mirror databases untouched

## Navigator Validation

Route: Read the Evidence table in the TS4 index.md; optionally re-run bash scripts/smoke_claude_plugin.sh from the repository root

Navigator accepted: yes

Expected observation: Every acceptance claim traces to a recorded run with its commit or version and date; locally sections 1-4 pass and section 5 fails only on CR123's case

Pass condition: All claims trace to recorded runs; production-untouched accepted on DS12's content-level check (Navigator, 2026-10-13)

Fail condition: A claim without a run behind it, or a smoke section failing for a reason other than CR123's

## Missing Evidence

- none
<!-- ariad-seal sha256:4923bd19b208db2fe546b8e3f2c51bfb6c1770e0a7f01fb32b1d24048a699fad — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
