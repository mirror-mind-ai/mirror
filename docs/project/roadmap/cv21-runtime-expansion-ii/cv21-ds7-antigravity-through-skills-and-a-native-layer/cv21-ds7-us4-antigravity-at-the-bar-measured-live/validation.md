# Validation — CV21.DS7.US4

## Status

Passed

## Automated Checks

- node --test: 3303 pass 0 fail (+1 scope-change test red-first: agySessionStart activates Mirror Mode so per-turn injection fires); npx biome check clean; generate_hook_wrappers.sh --check in sync; buildClaudePlugin --check in sync

Checks status: passed

## E2E

Decision: required

Evidence: Live bar-walk on agy 1.4.2 (route.sh live + interactive, evidence sanitized). All five bar items PASS: 1 skills (mm:mirror ran mirror load and answered in Mirror's voice), 2 instructions (rules marker quoted), 3 injection once per turn (2 injections/2 turns; turn 1 ran 8 invocations but injected once - the invocationNum==0 gate held; model's own thought: Mirror mode is active), 4 logging+close (user=4/assistant=4 closed; skill turn skipped, ordinary logged), 5 one install step. MCP reachable (7 tools via /mcp). Both negatives PASS. The walk found item 3 initially 0 (no activation path on agy: PreInvocation has no prompt L7, skill-command cannot bind the session); fixed under a named scope change - agySessionStart sets mirror_active - validated live

## Navigator Validation

Route: route.sh live (items 2,4,5 + negatives) and route.sh interactive (items 1,3 + MCP); the model acknowledged Mirror Mode active; /mcp listed 7 tools; both screenshots recorded

Navigator accepted: yes

Expected observation: all five bar items observed on the real path with version/binary/date; injection once per turn (not per invocation); the negative probes hold; parity at the level the evidence supports

Pass condition: all five PASS, negatives hold, recorded with version/binary/date; L4 if clean

Fail condition: a bar item FAIL for a Mirror reason not accepted as agy's limit or not fixed under a named scope change

## Missing Evidence

- none
<!-- ariad-seal sha256:365990019cb764a3ce471dd8355f4ad236dd84e86838ab6f7ce87994e2b573fd — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
