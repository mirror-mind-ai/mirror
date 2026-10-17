# Validation — CV21.DS4.TS2

## Status

Passed

## Automated Checks

- npm test 3243 pass 0 fail; typecheck, lint, checkDocLinks, checkPackContents (483 files), checkRetiredSurfaces clean; conversation_lifecycle_smoke and smoke_npm_package 80/0 green; all new tests red first

Checks status: passed

## E2E

Decision: required

Evidence: route.sh static: the plugin's real wrappers and this tree's mirror-hook against a scratch home with replay providers and a key set; a codex session's SessionEnd finished in 492 ms with ended_at, active=0, closed_at, close_tail_pending, no ledger call, no hooks.log line, a backup; maintenance reported Extracted 1 and Finished deferred close tails 1, memory and title present, flag deleted; a claude_code session ran its 7-call tail at exit with closed_at <= first call. The order under a real cut is held by the lifecycle unit tests. The real Codex with a real key is US4's.

## Navigator Validation

Route: bash route.sh static from the story package: three steps, the entry pinned to this tree and printed

Navigator accepted: yes

Expected observation: codex SessionEnd under 1 s with every state written and no model call; the next maintenance finishes the deferred tail and reports it; claude_code tail unchanged at exit, inactive first

Pass condition: Every route check green: Navigator run 20 passed, 0 failed, 2026-10-17 13:50 UTC, after a route defect (entry resolved from the PATH to the published package) was found by the Navigator's first run and fixed

Fail condition: The hook over 1 s or killed, any LLM call on the codex path, active=1, no flag, no backup, the maintenance line at 0, the flag surviving, no tail on claude_code, or closed_at after the first call

## Missing Evidence

- none
<!-- ariad-seal sha256:13aa89c6dfe66d8d744b5915da6c2f7c43a7d224bcfefad01bae39ab9aaa88fb — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
