# Validation — CV22.DS9.TS2

## Status

Passed

## Automated Checks

- ts: typecheck + lint + 2356 tests pass; uv run pytest green except CR058's known machine-local flake; CI green at 4493fe00 (Tests + Docs)

Checks status: passed

## E2E

Decision: required

Evidence: Scripted: two-engine diff through the launcher, both branches, 9 responses byte-identical with empty stderr and routing proven by sentinel; real-copy probe on a copy of the 50MB production DB, 12 tools byte-identical, read paths wrote nothing, one query search wrote llm_calls +1 / memory_access_log +0. LIVE CLAUDE SESSION (the E2E): plugin connected, 7 tools in Python's declaration order, all seven called successfully (17/23/17/7/8/4 ms and 2s for the paid search_memories path); malformed recall_conversation returned an isError result and list_journeys answered identically afterwards, so a tool error did not kill the server; ledger on the copy went 552 -> 553 with memory_access_log unchanged at 3786 and the row role=embedding bodies_withheld=1 priced=1 unattributed=1; ps showed node .../ts/src/mcp/main.ts as the child of claude --plugin-dir; Claude's own MCP log recorded serverVersion mirror-mind 0.31.14 (D4's pyproject fallback through a real client, no MIRROR_MCP_VERSION set) and ZERO stderr bytes across the whole session. Revert branch under the same real client: Claude's log shows python3: No module named memory, which is positive evidence that MIRROR_TS_MCP=0 routed to Python -- the launcher took the revert branch and the engine that failed was Python, for CV21's documented unmet installed-memory contract. LIMITATION RECORDED: Python serving a full Claude session was not observed on this machine; Claude never attempted that spawn (no MCP log file for the server in that session) while the same launcher with the same environment answers from Python when spawned directly.

## Navigator Validation

Route: 1) scripts/mcp_two_engine_diff.sh --launcher  2) scripts/mcp_real_copy_probe.sh --launcher <real db>  3) launcher from a non-repo cwd on both branches  4) DB_PATH=<copy> claude --plugin-dir plugins/mirror-mind: /mcp, tools/list, one call per tool, one malformed call, ps for the engine, then the MIRROR_TS_MCP=0 control session

Navigator accepted: yes

Expected observation: TypeScript answers the plugin's MCP surface with tools identical to Python's, the gate routes the other way, and an agent search records exactly one llm_calls row while reinforcing nothing

Pass condition: Empty diffs, correct engine on each branch, one ledger row and nothing else, a working Claude session listing and calling all seven tools without killing the server

Fail condition: Any byte difference outside US2 D10's score tolerance, any row other than the single llm_calls insert, any write through the tools' read-only handle, the wrong engine on either branch, a .env gate that is ignored, or a session where a tool error takes the server down

## Missing Evidence

- none
