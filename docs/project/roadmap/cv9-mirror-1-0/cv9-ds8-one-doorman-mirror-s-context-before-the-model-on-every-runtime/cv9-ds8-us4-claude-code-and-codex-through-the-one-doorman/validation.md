# Validation — CV9.DS8.US4

## Status

Passed

## Automated Checks

- claudeInject.test.ts, doorman/orchestration operating-mode tests, buildCli session-naming test; npm test 3501/3498 pass, 0 fail; typecheck, lint (1 pre-existing warning), diff --check, buildClaudePlugin --check, checkSkillCommandParity, checkPackContents, checkDocLinks, checkRetiredSurfaces clean; smoke_claude_plugin steps 1-5 pass

Checks status: passed

## E2E

Decision: required

Evidence: Live walk 2 on the installed Claude Code 2.1.310 and Codex 0.164.0 with the tree linked: 16/16 rows pass (test-guide.md). Walk 1 found and fixed the Builder route's session naming; one difference recorded: Claude Code runs the hook twice on a checkout-plus-plugin machine

## Navigator Validation

Route: test-guide.md Navigator Validation, eight rows per runtime with sqlite3 reads between turns

Navigator accepted: yes

Expected observation: Explicit turn loads once and signs; domain change re-routes and signs; sticky voice; Builder switch ends deltas; unprompted question marks the session and its next turn is a delta; logging and MCP intact

Pass condition: All eight rows on both runtimes

Fail condition: A double load, a missing signature, a Builder turn as the mirror, an unmarked session, the block logged

## Missing Evidence

- none
<!-- ariad-seal sha256:123e850f6450c1253d0d32d067e83c8d78f1508c9aa917763590ee655b80b70d — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
