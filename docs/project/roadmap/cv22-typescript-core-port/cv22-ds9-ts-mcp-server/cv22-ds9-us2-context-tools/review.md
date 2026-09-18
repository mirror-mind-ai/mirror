# Review — CV22.DS9.US2

## Status

Reviewed

## Debt Findings

- Four findings. (1) ACCEPTED SCOPE, not debt: D12 leaves agent-initiated searches uncounted as spend because the server holds a read-only handle, which makes TS2's database-open decision a prerequisite for TS1's wallet guard; recorded on both story rows and pinned by two tests. (2) D10's 1e-6 score tolerance is an exception that now travels with every 'byte-identical' claim about this surface, including DS10's deletion rationale; recorded in the US2 and DS9 indexes. (3) Python's list_journeys docstring promises id/name/description while the code also returns status and metadata — a doc defect in the oracle, ported as-is per the code. (4) journey_status with no slug is still the widest read on the surface after D1: 226KB / ~57K tokens over 21 journeys on the owner's database, down from 3.2MB but still large enough that an agent can fill its context with one call — a cap candidate for TS1. Separately, CR086 was captured against RS010 during this story for the root cause of the memories --search defect (a baseline advance absorbed an oracle change nobody ported), and US1's two deferred findings remain open.

## Debt Decision

defer

## Defer Reason

None of the four blocks TS1 or TS2, and three of them are explicitly those stories' inputs rather than this story's omissions: the spend gap and the widest-read cap are TS1/TS2 scope by design, and the tolerance is a recorded property of the surface rather than a defect to repair. The docstring is Python-side maintenance that would re-baseline the oracle mid-story for no behavioral gain. Fixing any of them here would mix scope into a story whose evidence is byte-equality.

## Revisit Trigger

TS2 settles the database-open decision — at which point the spend gap closes or becomes permanent, and TS1 can size its wallet guard; TS1's plan decides whether journey_status needs a cap beyond D1; the docstring rides the next Python-side CR under RS010; and D10's tolerance is re-read when DS10 writes its deletion rationale.

## Missing Decision

- none
