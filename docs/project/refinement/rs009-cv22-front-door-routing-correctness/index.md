[< Refinement Workbench](../index.md)

# RS009 — CV22 Front-Door Routing Correctness

## Framing

The front-door routing table decides, per command, whether the TypeScript core
or the frozen Python engine answers. Its entries were authored family by family
as CV22 progressed, and each entry matches on the top-level command. That was
correct when written, but it makes an implicit claim that ages badly: *this
family's argv shapes are the ones that existed when I claimed it.*

On 2026-09-02 that claim broke in production shape. `conversations append`,
added by v0.31.13, inherited DS7.US1's listing route: the request reached
TypeScript, rendered a conversation listing, exited 0, and silently discarded
the caller's messages. It was caught only because DS7.US5 happened to inspect
that route while porting the same boundary.

## Outcome

Every claimed command family in `ts/src/frontDoor/routing.ts` has an explicit,
audited position on subcommands it does not implement — allowlist, refusal, or
documented full coverage — so a subcommand added upstream cannot silently
inherit a TS route it was never ported into.

## Boundaries

- Audit and correctness only; this is not a licence to port new subcommands.
- Preserve every currently correct route; the goal is closing an inheritance
  hole, not re-litigating flip decisions.
- Fixes land as routing guards plus regression tests, in the same shape as the
  `conversations append` fix that motivated this story.

## Change Requests

- [CR055 — Audit subcommand inheritance across claimed command families](cr055-audit-subcommand-inheritance-in-claimed-families.md)
