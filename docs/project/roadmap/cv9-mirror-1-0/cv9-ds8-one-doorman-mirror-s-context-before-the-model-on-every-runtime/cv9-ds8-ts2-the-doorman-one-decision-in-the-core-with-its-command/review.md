# Review — CV9.DS8.TS2

## Status

Reviewed

## Debt Findings

- Four findings, none owed by TS2. (1) hook_injected is written after a full load for the legacy inject hook's case 2, which the doorman never reads — US4 retires that reader and this write with it. (2) No memory threshold in the delta by plan; scores logged (0.38–0.42 on the Navigator's walk) — US5's live walk sets the number. (3) Pre-existing: mirror load --query with MEMORY_RECEPTION=0 and only an embedding fixture is accepted by the router but refused by the load route, which resolves providers from the full MIRROR_QUERY_TRANSPORT instead of mirrorQueryTransportFor(env) as the router and the doorman now do — one line to align, a maintenance item or CR. (4) Pre-existing: smoke_claude_plugin.sh step 6 ('mirror-hook gone') is defeated on a machine with a global npm-linked mirror-hook, since the wrapper's fallback directories find it; smoke design, not product.

## Debt Decision

defer

## Defer Reason

Findings 1 and 2 are owned by sibling stories US4 and US5, whose plans already name them; findings 3 and 4 predate this story, touch surfaces outside its scope (the load route, the smoke script), and changing them here would widen a story that is validated and ready to close.

## Revisit Trigger

US4 Plan (retire hook_injected write); US5 Plan (set the threshold from the logged scores); a maintenance commit or CR for the load route's transport resolution and the smoke's missing-bin probe, before CV9's release gate runs smoke_claude_plugin on a developer machine

## Missing Decision

- none
<!-- ariad-seal sha256:6148a748378fdee5c1e14da497a6f7eb65e675b51bac044d9e11de366db6ff73 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
