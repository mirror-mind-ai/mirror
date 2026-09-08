[< RS009](index.md)

# CR068 — Stop reporting unported LLM-gated leaves as burned down

**Status:** captured
**RS:** RS009
**Driver:** —
**Delivery:** —

## Problem

The burn-down ledger exists because DS7's plan review made the denominator a
blocking constraint: *"the burn-down denominator must be an explicit, tracked
artifact so 'done = zero' is auditable, not asserted."* Its own rule is per
leaf, not per top-level command:

> A command counts as burned down only when its `routing.ts` entry sends it to
> TS **ungated** … Coverage is per subcommand/branch, not per top-level command.

The *Content & planning writes* row does not follow that rule:

```text
| Content & planning writes | `journal`, `tasks`, `week` | 3/3 | DS7.US2 | ✅ done |
```

Three leaves in that row are still answered by Python:

| Leaf | Ported | Routed | Owner today |
|------|:------:|:------:|-------------|
| `journal` | ✗ (no TS module exists) | Python | none |
| `week plan` | ✗ | Python | none |
| `week save` | ✗ | Python | none |
| `tasks` (9 subcommands) | ✓ | TS | — |
| `week view` | ✓ | TS | — |

This is not a routing defect — `routing.ts` is honest, and its refusal reasons
name US5 explicitly. It is an accounting defect, plus an ownership gap behind
it. US2 deliberately excluded the LLM/embedding-gated leaves and reassigned them
to US5 ("`journal` (double LLM/embedding-gated) — moves to US5"). US5 was then
re-scoped to the deterministic `conversation-logger` core, and the LLM tail
moved to US10, which ported the close tail — but neither story ported
`journal`, `week plan`, or `week save`. The reassignment target dissolved and
nothing inherited the work, while the ledger kept the family at `3/3 ✅ done`.

## Expected Behavior

The ledger reports what the front door actually does. The *Content & planning
writes* row shows its leaf remainder the way the `conversation-logger` and
`runtime` rows already do — with a per-leaf table and a named owner for each
unported leaf — so the DS7 command count cannot include a leaf that Python
still answers.

Each of the three leaves ends this CR with an explicit disposition: an owning
story, an explicit deferral to DS8 with a reason (all three cross the
LLM/embedding seam), or an explicit retirement decision. Which disposition is
correct is a Navigator decision, not something this CR presumes.

## Impact

Medium, and it compounds. The ledger is the artifact the strangler uses to
prove convergence; an over-report is the one defect class it exists to prevent.
Concretely:

- DS7's progress is reported against a denominator that has three leaves in the
  wrong column, so "zero deterministic Python commands" would be reachable on
  paper while three commands still answer from Python.
- The leaves have no owner, so nothing will surface them again on its own. They
  were found by accident, while reading adjacent terrain during CV22.DS7.US6
  planning — the same way `conversations append` was found.
- DS10 deletes the Python core. A leaf that is unowned and reported as done is
  exactly the shape that reaches a deletion gate unnoticed.

Low blast radius today: no user-visible defect, because Python still answers
correctly. The risk is entirely in the accounting.

## Plan Or Decision

1. Correct the *Content & planning writes* row to a per-leaf presentation:
   `tasks` 9/9 routed, `week` 1/3 routed, `journal` 0/1 routed.
2. Add a per-leaf detail table for the family, matching the shape the
   `conversation-logger` and `runtime` sections already use.
3. Record the disposition decision for the three LLM/embedding-gated leaves —
   owning story, DS8 deferral, or retirement — near the roadmap, per the
   single-owner rule that unconfirmed decisions must be written down.
4. Recompute and restate the DS7 command denominator and progress from the
   corrected leaf counts.
5. Extend the ledger's stated rules with the reassignment hazard this exposed:
   when a story reassigns scope to another story, the receiving story must
   name it, or the scope has no owner. A reassignment recorded only in the
   sending story's prose is not an owner.

Boundaries: this CR corrects accounting and assigns ownership. It ports
nothing, changes no route, and revisits no flip decision.

## Evidence

Route decisions read directly from `routeMemoryCommand` with an empty
environment:

```text
["journal","x"] -> {"engine":"python","reason":"command not ported to TS"}
["week"]        -> {"engine":"ts","reason":"DS7.US2 week view read ported to TS"}
["tasks","list"]-> {"engine":"ts","reason":"DS7.US2 tasks list read ported to TS"}
```

`week plan|save` are refused with `"week plan/save are LLM-gated and reassigned
to US5, not ported here"`. `find ts/src -iname "*journal*"` returns nothing, and
`grep -ril journal ts/src` matches only schema, icon, and observability files —
there is no TypeScript journal implementation to route to.

Python's surfaces, for the leaf counts: `cli/tasks_cmd.py` declares nine
subcommands (`list`, `add`, `done`, `doing`, `block`, `import`, `delete`,
`sync`, `sync-config`) and `routing.ts` allowlists exactly those nine;
`cli/week.py` declares three (`view`, `plan`, `save`).

## Outcome

_Pending._

## Provenance

Found while reading terrain for CV22.DS7.US6 (Soul Mode) planning on
2026-09-08: `soul harvest save` writes through the same `add_journal` path,
which prompted checking whether `journal` was already on TS. Captured
separately from US6 rather than absorbed into it, because the correction is
accounting and ownership, not Soul scope.
