# Review — CV22.DS9.TS2

## Status

Reviewed

## Debt Findings

- Six findings, none blocking. (1) TS1 INPUT -- the ledger row TS2 writes is unattributed (conversation_id and session_id null), exactly as Python writes it, so a wallet guard reading it cannot tell MCP spend from front-door or extraction spend; adding a marker would be a divergence from the oracle and is TS1's to decide in writing. (2) TS1 INPUT -- the ledger connection inherits the seam's 30s busy_timeout, so a ledger insert blocked by a concurrent writer waits on the agent's response path; parity with Python, and a shorter timeout for an observability write is a divergence to decide rather than absorb. (3) DISTRIBUTION GATE -- between this flip and TS1 the server spends without a ceiling, exactly the posture Python has had since CV21.E2.S2; acceptable at zero installed consumers, and TS1 must land before the plugin is distributed beyond the author. (4) CV21 DEBT, made visible not caused -- the plugin contract assumes 'memory' is importable from a bare python3 and it is not on this machine (measured, and confirmed live in Claude's own MCP log), so the plugin's hooks and the Python MCP entry do not run from a plugin load; the flip makes TypeScript the first engine that works there. (5) CV21 DEBT, same family -- the plugin's generated skills invoke ts/src/frontDoor/cli.ts relative to cwd, against CV21's own no-repo-cwd contract. (6) US2 CARRY-OVER -- journey_status with no slug remains the widest read on the surface (226KB / ~57K tokens) and is a cap candidate for TS1. Also recorded, not debt: one launcher mutant (unanchoring the gate grep) survives as behaviour-equivalent because the sed that follows re-anchors, and the sibling-variable cases it would have guarded are pinned directly; and Python serving a full Claude session was not observed on this machine, though the routing it would have shown is proven three other ways.

## Debt Decision

defer

## Defer Reason

None of the six blocks closure, and four of them are other stories' scope by design rather than this story's omissions: (1), (2) and (6) are explicitly TS1 inputs -- TS2's job was to make spend visible so TS1 can bound it, and deciding attribution or timeout here would pre-empt the story that owns the guard; (3) is a named consequence of sequencing TS2 before TS1, not a defect, and it is bounded by there being zero installed consumers; (4) and (5) belong to CV21, whose contract this story observed and recorded rather than broke -- fixing them here would mean editing another CV's plugin surface inside a cutover story, and DS10's npm distribution makes the TS half moot anyway. Paying any of them now would mix scope into a story whose evidence is byte-equality plus one ledger row.

## Revisit Trigger

TS1's Plan, which must decide in writing whether its wallet guard needs an attribution marker Python never wrote and whether journey_status needs a cap, and which closes the unbounded-spend window; before any distribution of the plugin beyond the author, which TS1 gates; and CV21's next plugin-surface story or DS10's npm packaging, whichever first touches the installed-memory contract and the cwd-relative skill invocations.

## Missing Decision

- none
