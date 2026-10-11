# Review — CV22.DS7.US7

## Status

Reviewed

## Debt Findings

- CR071 paid and closed. Five findings carried to RS010 with the trigger above: the read-path backup clobbering, the 2.00s test budget below its own subprocess floor, the delegated refresh subcommand outside the oracle-drift tripwire, the obfuscator's /home and bare-token gaps, and the incorrect projection-frequency claim in the 2026-09-09 decision record.

## Debt Decision

defer

## Defer Reason

The pay_now debt is PAID: CR071 is done, validated by the Navigator, and closed in the canonical Refinement index. Eleven skills that reached the front door on Pi while calling Python directly on Claude Code and the published plugin now agree across all three copies, and scripts/check_skill_command_parity.py fails CI when a future flip updates one copy and not the others. Front-door coverage moved 13/2/2 to 13/13/13. Green CI at b8c9c2d. The remaining five findings are carried, not paid, because each is a decision rather than a repair: (2) the read-path pre-write snapshot overwriting the last-write undo point is a front-door design property US6 introduced and this story widened, and changing it means deciding whether read-only routes should take the write path at all; (3) the 2.00s web-server test budget is someone else's test and the repair is a judgement about how long a real subprocess may take; (4) whether the delegated journey-projection refresh belongs in the oracle-drift tripwire is a question about what that tripwire is for; (5) the obfuscator's /home/... and bare-bearer-token gaps are product decisions that would break parity if changed inside a port; (6) the decision record's projection-frequency claim needs correcting where it is written, which is documentation the next story will touch anyway.

## Revisit Trigger

Before CV22.DS7.US8 is pulled. US8 carries the largest skill surface in the product and the highest-churn oracle, and findings 2 and 4 both concentrate there: it adds the most read-only routes to the snapshot path, and it is the story that will most exercise the delegated refresh seam. Findings 3, 5, and 6 ride along as cheap cleanups at the same checkpoint.

## Missing Decision

- none
