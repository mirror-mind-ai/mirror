[< Refinement Workbench](../index.md) · [RS009](index.md)

# CR089 — The `journey` route swallows `export-registry` and `mutate` as journey slugs

**Refinement Story:** RS009 — CV22 Front-Door Routing Correctness
**Status:** done
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

## Problem

`python -m memory journey export-registry` and `python -m memory journey mutate`
are Python commands: `src/memory/cli/journey.py:120` dispatches them to
`JourneyAdminService` (`src/memory/services/journey_admin.py`, 345 lines). They
arrived in the 2026-09-02 pause-window merge (`v0.31.9`–`v0.31.14`) and the CV22
restart notice promised them "explicit owners at the next DS7 planning pull".
They never got one: the burn-down ledger does not mention `journey_admin`, and
neither does any DS7 story.

The TypeScript `journey` route (`ts/src/frontDoor/routing.ts:873`) claims the whole
family — `set-path`, `update`, and "everything else is a status read". So the two
admin verbs fall into the status read, which treats the verb as a **slug**:

```text
$ node --env-file=.env ts/src/frontDoor/cli.ts journey export-registry
=== journey: export-registry ===

--- recent memories ---
  No recent memories.

$ echo $?
0
```

A caller asking for the registry as JSON gets an empty journey status for a
journey that does not exist, with exit `0`. `journey mutate` — a **write**, JSON
on stdin — is swallowed the same way and does nothing, also with exit `0`.

This is exactly the failure mode CR055 (subcommand inheritance across claimed
families) was captured to audit, found in the wild.

## Expected Behavior

The front door must never turn an unknown verb into a slug. Two acceptable
shapes, in order of preference:

1. **Refuse unknown `journey` verbs with a nonzero, named error**, and route the
   two admin verbs explicitly for as long as they exist. Under the retirement
   decision of 2026-09-19 they are retired unported with a cutoff in
   CV22.DS10.TS4, so "route explicitly" means: to Python until TS4 deletes
   them, then a clear "removed in vX; see release note" refusal.
2. At minimum, a status read whose slug resolves to no journey must exit
   nonzero and say so, rather than rendering an empty document.

Either way, the routing test for the `journey` family should enumerate its
verbs positively and assert that anything else does not reach the status read.

## Impact

Real for one caller today, structural for the migration.

Mirror Desktop's Rust (`src-tauri/src/main.rs:2118`, `:2175`) calls both verbs
through Python directly, so it works — but only because it bypasses the front
door, which is the opposite of what CR072 established as the invocation
contract. Any caller that follows the contract gets a wrong answer with a
success exit code. A silent no-op on a **write** verb is the worst shape a
routing defect can take.

Structurally: DS10's "zero Python commands" claim is not true while 345 lines
of `journey_admin` have no disposition, and the front door's silence is why
nobody noticed. The disposition is now recorded (retire, TS4); this CR is the
routing half.

## Plan Or Decision

Not planned. Captured 2026-09-19 during CV22.DS10.TS1's Plan, when a cross-repo
inventory of Mirror Desktop's Mirror invocations found the two verbs and the
front door's answer to them. Deliberately not folded into TS1, which owns the
projection retirement; the mis-route is the front door's and predates DS10.

The fix is small and should land before TS4 deletes the Python behind it, so
that the refusal shape (option 1) exists at deletion time rather than being
discovered by the next caller.

## Evidence

- `src/memory/cli/journey.py:120–124` — Python dispatch of `export-registry` and
  `mutate`.
- `ts/src/frontDoor/routing.ts:873–885` — the TypeScript claim: `set-path`,
  `update`, else status read.
- `grep -rn "export-registry\|journey_admin" ts/src` — no TypeScript
  implementation or route.
- `docs/project/roadmap/cv22-typescript-core-port/index.md:15–17` — the restart
  notice promising an owner.
- `docs/project/roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/burn-down-ledger.md`
  — no mention.

## Outcome

**Done 2026-09-23, delivered by
[CV22.DS10.TS4](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts4-retire-the-unported-surfaces-with-cutoffs/index.md)
plateau 1**, in the shape this CR preferred: **option 1, the two verbs routed
explicitly by name**.

`ts/src/frontDoor/routing.ts` matches retired surfaces BEFORE any family claims
the command, so `journey export-registry` and `journey mutate` can no longer
reach the status read and be treated as slugs. Both now print one line naming
the cutoff and exit 1. The refusal is emitted before dispatch, so the write
verb's JSON on stdin is never read — measured at ~220ms rather than the hang a
late refusal would have produced — and nothing from argv or stdin is echoed
into the message or the front-door log. TS4 plateau 3 then deleted the 345
lines of `journey_admin` behind them, so the retirement and the refusal landed
in the same release, as this CR asked ("the fix is small and should land before
TS4 deletes the Python behind it").

**What this CR did NOT cover, and why.** Its "at minimum" fallback — that a
status read whose slug resolves to no journey should exit nonzero — turned out
to be **parity with Python**, not a TypeScript defect: `uv run python -m memory
journey no-such-journey-xyz` prints the same empty document with exit 0
(verified on both engines 2026-09-23). Changing it is a deliberate deviation
from the oracle rather than a routing correction, so the Navigator separated it
into
[CR095](cr095-journey-status-renders-an-empty-document-for-an-unknown-slug.md),
sequenced after TS5 removes the oracle. The positive verb enumeration this CR
proposed is not achievable in general for the same reason: at the front door a
verb and a slug have the same shape, so refusing an unknown verb would refuse
every bare-slug status read.

Mirror Desktop, the one caller that used these verbs, bypassed the front door
and called Python directly. It is outside the migration and pinned to the last
Python-bearing release; the
[cutoff](../../../releases/pending-cutoffs.md#journey-admin-verbs) says so.
