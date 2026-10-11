# Validation — CV22.DS9.TS1

## Status

Passed

## Automated Checks

- ts: typecheck + lint + 2390 tests pass; uv run pytest green except CR058's known machine-local flake; CI green at 59942810 on all five jobs including macOS. An earlier macOS run failed on the bootstrap concurrency race and passed on re-run with no code change: CR084 observed unprompted in CI for the first time, unrelated to this story.

Checks status: passed

## E2E

Decision: required

Evidence: Scripted: two-engine diff through the launcher byte-identical on both branches with guards on; mcp_guard_probe.sh on a copy of the 50MB production database -- argument bounds refused with the bound named, MIRROR_TS_MCP_GUARDS=0 restoring the oracle's whole transcript, N calls allowed and N attributed ledger rows written, the next refused with the terminal text, no row for the refusal, no query or payload in the log, memory_access_log unchanged so AI-12 holds while spend is counted. Cross-process guarding proven by two spawned servers sharing one count, with a per-process-cache mutant failing it. LIVE CLAUDE SESSIONS, TWICE. First (limit 30, 35 topics): wallet held exactly -- 30 allowed, 30 rows, 5 refusals, no row written by a refusal, production untouched -- but the agent read 'Use a filter instead' as 'a way around the limit' and, told 'Do not retry this tool', called it four more times with different topics. Both wordings corrected in 59942810: filters named as NOT METERED rather than hinted at as a workaround, the stop scoped to another query and gated on the human, and the alternative made per tool since mirror_context has no layer or type filter. Second session (limit 10, 14 topics): 10 allowed, 10 rows, ONE refusal and the agent stopped at it -- zero further attempts -- and its escalation offered raising the limit or waiting, with no bypass framing. The argument refusal exceeded the prediction: asked for limit 0, the agent surfaced the bound, declined to substitute because the Navigator had explicitly asked for 0, offered valid values, and answered the underlying question through list_conversations, using the unmetered path naturally. Scope: n=1 per wording; what it establishes is that the two specific misreadings are gone and behaviour tracked the text.

## Navigator Validation

Route: 1) scripts/mcp_two_engine_diff.sh --launcher  2-3) scripts/mcp_guard_probe.sh <real db>  4) a fresh copy, MIRROR_MCP_EMBED_RATE_LIMIT=10, claude --plugin-dir plugins/mirror-mind: a 14-topic sequential search_memories loop observed at the 11th call, then recall_conversation with limit 0; refusals counted afterwards from the project's MCP log

Navigator accepted: yes

Expected observation: The paid call at the limit is refused with text the agent obeys and does not read as a loophole, the argument refusal surfaces the bound, and no refusal writes a ledger row

Pass condition: N allowed and the next refused, 0 provider calls and 0 rows for the refusal, 0 further attempts after the refusal, the argument refusal informing rather than looping, and MIRROR_TS_MCP_GUARDS=0 restoring TS2's behaviour

Fail condition: A refusal delivered as a protocol error, a refusal that wrote a ledger row, a count that includes extraction spend, a second process with its own budget, an agent that continues into the wall, or any query text in a refusal or in the log

## Missing Evidence

- none
