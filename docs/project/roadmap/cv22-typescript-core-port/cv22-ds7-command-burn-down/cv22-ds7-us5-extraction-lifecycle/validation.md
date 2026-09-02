# Validation — CV22.DS7.US5

## Status

Passed

## Automated Checks

- Python suite (non-live) green except a pre-existing machine-speed flake root-caused to wait_for_run's 2.0s poll ceiling vs a 2.4-2.6s subprocess; TS suite 975/975; tsc; Biome; Ruff check+format; oracle-drift clean; 9-generator golden regeneration a no-op with provider keys emptied; migration structural parity PASS; bootstrap custody parity PASS; real-DB-copy read parity overall_match true; write-parity conversation_logger probe match true; doc links clean; CI green at ff05bd7 across test 3.10, test 3.12, ts macos, ts ubuntu, parity

Checks status: passed

## E2E

Decision: required

Evidence: Hook-inclusive E2E on a disposable Mirror home through the real front door, run by the Navigator on 2026-09-02 and independently by the Driver before and after the flip. Navigator run: ACTIVE; both hook calls silent; 'Conversation logging MUTED.' then MUTED; exactly one message row (user|how does extraction work?) with the slash-prefixed prompt absent; title 'how does extraction work?'; metadata bytes {"title_source": "first_user", "title_status": "provisional"} identical to the Python oracle; front-door.log route column ts. Kill-switch run: MIRROR_TS_CONVERSATION_LOGGER=0 produced route column python with identical output, and Python read the mute flag TS had written, showing cross-engine state compatibility.

## Navigator Validation

Route: From the repo root: run the slice-A block in the US5 test guide (ts() helper, five commands, then the two SELECTs), then re-run with MIRROR_TS_CONVERSATION_LOGGER=0 exported and confirm the front-door log route column flips from ts to python while output stays identical.

Navigator accepted: yes

Expected observation: ACTIVE, silence on both hook calls, 'Conversation logging MUTED.', MUTED; exactly one user message (the slash command absent); conversation title 'how does extraction work?'; metadata exactly {"title_source": "first_user", "title_status": "provisional"}; route column ts, then python under the kill switch.

Pass condition: stdout strings, row states, and metadata bytes identical on both engines, and the kill switch reverts the route with no data migration

Fail condition: any divergence in output strings, row states, ordering, or metadata bytes; any argument payload appearing in front-door.log; or the kill switch failing to reach Python

## Missing Evidence

- none
