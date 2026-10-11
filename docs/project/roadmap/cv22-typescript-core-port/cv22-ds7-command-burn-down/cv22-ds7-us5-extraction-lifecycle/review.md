# Review — CV22.DS7.US5

## Status

Reviewed

## Debt Findings

- Integer-valued float metadata diverges between cores: 1.0 serializes as 1.0 in Python and 1 in TypeScript because JSON.parse collapses the distinction before either core sees it. Metadata bytes take part in the append idempotency comparison, so a batch written by one core and replayed through the other could raise a spurious idempotency_conflict. Unreachable today because the append route is not wired; blocks the CV22.DS7.US10 append flip.
- One corrupt conversation metadata row fails the entire extraction scan: SQLite json_extract raises malformed JSON rather than returning NULL, so get_unextracted_conversations and the whole maintenance run raise for every conversation. Both cores behave identically, so the port is at parity; the fragility is the product's and predates CV22.
- TS upsertRuntimeSession encodes the inverse convention of Python's store: TS uses undefined=preserve/null=clear, Python uses None=preserve for five fields and an _UNSET sentinel for two. Call sites translate correctly today, but a shared wrapper encoding Python's convention directly would remove the footgun.
- Routing subcommand inheritance: conversations append inherited DS7.US1's listing route, rendered a listing, exited 0, and silently discarded caller messages. Fixed for that case with a regression test; the same shape may exist in other claimed command families, which remain unaudited.
- tests/unit/memory/web/test_server.py wait_for_run polls 40 x 0.05s, a 2.0s ceiling, while the operation spawns a Python subprocess taking 2.4-2.6s on this machine. Passes on CI's faster runners, fails locally regardless of tree state. Pre-existing, unrelated to US5 code.

## Debt Decision

defer

## Defer Reason

All five findings are parity-preserving or out of US5's scope. The one with product impact, the float-metadata divergence, is unreachable while the append route stays unwired, and fixing it means touching the append serializer, which belongs with the flip it gates rather than with the deterministic core this story closed. Paying any of them inside US5 would widen a story that was deliberately re-scoped to its provider-free plateau.

## Revisit Trigger

Before CV22.DS7.US10 routes conversations append to TS, the float-metadata divergence must be resolved; it is already recorded as US10's inherited blocker. The routing subcommand-inheritance audit is promoted to its own Change Request. The remaining three are registered as parity-preserving observations and revisit when their surface is next touched.

## Missing Decision

- none
