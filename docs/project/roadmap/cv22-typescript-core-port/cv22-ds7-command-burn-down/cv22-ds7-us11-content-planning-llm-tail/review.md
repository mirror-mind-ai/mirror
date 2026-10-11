# Review — CV22.DS7.US11

## Status

Reviewed

## Debt Findings

- Four findings. (1) The week plan pending file: fixed name in the system temp dir, ambient umask (0644), contents are the user's personal plan text, and write_text follows a pre-existing symlink. Exposure is platform-dependent — macOS resolves gettempdir() to a per-user 0700 directory, Linux normally to /tmp at 1777 — and the difference is invisible from the code. CAPTURED as CR074 under RS010, beside CR062 which fixed the same property for backup archives. Not deferred, because it is a concrete security posture on a write path that will not resurface on its own, and because the fix must change BOTH engines together: a TS-only tightening would break the cross-engine pending-file proof that makes a half-flipped week safe. (2) week plan stores the model-supplied journey slug without checking it exists — the same silent-acceptance-of-an-unvalidated-identifier defect as journey update, already recorded as CR073's deferred debt-2. (3) Python passes no on_llm_call to generate_descriptor, so descriptor is the only LLM role writing no llm_calls row; parity preserved the gap deliberately. (4) apply_metadata_lifecycle is unported and already assigned to DS7.TS4 by the Navigator's option-B decision, recorded in the ledger, the DS7 index and the routing refusal — named for completeness, no new action.

## Debt Decision

defer

## Defer Reason

CR074 is captured and owned, so it needs no trigger. The two remaining findings are deferred rather than captured because each already has a home: the unvalidated journey slug is the same defect as CR073's debt-2 and should be fixed with it on both commands at once rather than tracked twice, and the descriptor ledger gap only becomes real when live spend flows, which is DS8's plan input where it is already recorded.

## Revisit Trigger

The unvalidated-slug finding revisits when CR073's debt-2 trigger fires (when TS4 or US11 next touches journey/identity writes); the descriptor ledger gap revisits when DS8 is planned. If either home is parked or rejected, that finding returns as its own CR rather than lapsing.

## Missing Decision

- none
