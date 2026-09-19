# Validation — CV22.DS9.TS1

## Status

Blocked

## Automated Checks

- ts: typecheck + lint + 2389 tests pass; uv run pytest green except CR058's known machine-local flake; CI green at 3a80cffc. One macOS job failed on the bootstrap concurrency race and passed on re-run with no code change: CR084 (the bootstrap lock is not exclusive between creating the file and writing its record) observed unprompted in CI for the first time, unrelated to this story, recorded for Debt Review.

Checks status: passed

## E2E

Decision: required

Evidence: Steps 1-3 done. Two-engine diff through the launcher with guards on: 9 responses byte-identical on both branches, empty stderr, sentinel routing confirmed -- guards do not touch in-range calls. scripts/mcp_guard_probe.sh on a copy of the 50MB production database at rate limit 3: limit=0 and limit=999 refused with the bound named; the same call under MIRROR_TS_MCP_GUARDS=0 returned the oracle's whole transcript; 3 calls allowed and 3 mcp-attributed ledger rows written; the 4th refused with the terminal text; no row for the refusal; one metadata-only guard line in the log; no query or payload anywhere in stderr; memory_access_log unchanged at 3786, so AI-12 still holds while spend is finally counted. Cross-process guarding proven in CI by two spawned servers sharing one count, with a per-process-cache mutant failing it. Two defects in the probe itself were found by running it and fixed: a truncation that broke the terminal-wording check, and a successful payload that would have printed memory content against the script's own privacy claim. Step 4, the real Claude session, is PENDING and is the Navigator's.

## Navigator Validation

Route: 1) scripts/mcp_two_engine_diff.sh --launcher  2-3) scripts/mcp_guard_probe.sh ~/.mirror-minds/vinicius-ts/memory.db (spends ~$0.00006; set MIRROR_MCP_EMBED_RATE_LIMIT to exercise a smaller limit)  4) On a FRESH copy -- the count is global across processes, so a session on a copy the probe just filled would be refused on its first search: DB_PATH=<fresh copy> claude --plugin-dir plugins/mirror-mind, then ask the agent to search 35 topics one call each with search_memories, and observe the 31st; then ask for recall_conversation with limit 0. Pre-registered expectation: the agent reports the refusal and stops or asks, and does not retry; retries are counted afterwards as guard-refused lines in the MCP log after the first.

Navigator accepted: no

Expected observation: The 31st paid call is refused with terminal text the agent obeys, the argument refusal surfaces and the agent corrects the value, and no refusal writes a ledger row

Pass condition: 30 allowed and the 31st refused, 0 provider calls for the refusal, 0 retries after the refusal, the argument refusal corrected rather than repeated, and MIRROR_TS_MCP_GUARDS=0 restoring TS2's behaviour

Fail condition: A refusal delivered as a protocol error, a refusal that wrote a ledger row, a count that includes extraction spend, a second process with its own budget, an agent that retries into the wall, or any query text in a refusal or in the log

## Missing Evidence

- Navigator validation has not been accepted
