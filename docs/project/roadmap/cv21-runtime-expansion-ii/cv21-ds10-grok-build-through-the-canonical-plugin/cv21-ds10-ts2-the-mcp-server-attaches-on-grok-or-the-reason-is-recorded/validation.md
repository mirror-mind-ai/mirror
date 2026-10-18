# Validation — CV21.DS10.TS2

## Status

Passed

## Automated Checks

- node ts/scripts/checkDocLinks.ts clean; no code changed (outcome 1), so the suite, pack, and plugin-build checks are not this story's gate

Checks status: passed

## E2E

Decision: required

Evidence: route.sh static: grok mcp doctor on US1's install handshakes (protocol 2025-11-25) with 7 tools discovered, healthy. route.sh session S1 (the shipped plugin, grok-4.7, headless, GROK_AUTH_PATH): init names mirror-mind pending; search_tool found mirror-mind__* keys; use_tool mirror-mind__list_journeys answered []; result FOUND/RESULT; 0.0245 and 0.0237 USD on two runs. S3 (control plugin): attached, ping->pong, 0.0176. S2/S4 not needed. untouched: 109 entries unchanged.

## Navigator Validation

Route: From the story package: bash route.sh setup; static; session S1; session S3; untouched (test-guide.md). Reads the real ~/.grok/auth.json in place through GROK_AUTH_PATH; about two cents a session.

Navigator accepted: yes

Expected observation: doctor connected with seven tools; per session the init snapshot names the server, search_tool returns its keys, use_tool answers, the stderr log stays empty, total_cost_usd recorded; the real configuration hashes unchanged

Pass condition: no failed/disabled/needs-auth status, the server's keys reachable through init.tools or search_tool, and a use_tool call answered — for S1 and for the control S3

Fail condition: a decisive failure status, no key found, use_tool unanswered, a Skipping MCP tool line, or any change in the real configuration

## Missing Evidence

- none
<!-- ariad-seal sha256:8473146a7044b47300a6eba48ab40358d7e6d9960d4905999265e1a47c2b2618 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
