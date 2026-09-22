[< Refinement Workbench](../index.md) · [RS009](index.md)

# CR095 — `journey <slug>` renders an empty status document, exit 0, for a journey that does not exist — on both engines

**Refinement Story:** RS009 — CV22 Front-Door Routing Correctness
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

A status read for a slug that resolves to no journey does not fail. It renders
a complete-looking document for a journey that does not exist and exits 0:

```text
$ node --env-file=.env ts/src/frontDoor/cli.ts journey no-such-journey-xyz
=== journey: no-such-journey-xyz ===

--- recent memories ---
  No recent memories.

--- recent conversations ---
  No recent conversations.

$ echo $?
0
```

**This is not a TypeScript defect. It is parity.** `uv run python -m memory
journey no-such-journey-xyz` prints the same eight lines and exits 0
(verified 2026-09-23). `cmd_status` in `src/memory/cli/journey.py` iterates
whatever `get_journey_status(journey)` returns and never checks whether the
slug named a journey; the TS port (`ts/src/frontDoor/render/journeyStatus.ts`,
DS7.US1 Slice A) reproduces that faithfully, including the documented
slug-resolution quirk.

CR089 recorded this as its *option 2* — "at minimum, a status read whose slug
resolves to no journey must exit nonzero and say so" — while its *option 1*
asked the front door to "refuse unknown `journey` verbs". The two are not the
same fix and option 1 is not achievable: at the front door a verb and a slug
have the same shape (one positional token), so no enumeration can refuse
`journey nonsense-verb` without also refusing `journey mirror-ts-core`. What
option 1 can honestly mean is *the two admin verbs, by name* — and that is
what CV22.DS10.TS4 delivers under CR089. Option 2 is this CR, separated on
purpose: it is a **deliberate deviation from the Python oracle**, not a
routing correction, and it deserves its own decision record rather than
riding inside a deletion story.

## Expected Behavior

`journey <slug>` for a slug that resolves to no journey exits nonzero and says
so on stderr (`Error: journey '<slug>' not found.` — the sentence `set-path`
and `update` already use), printing no status document. `journey` with no
argument (every journey) and `journey <existing-slug>` are unchanged
byte-for-byte.

The routing test for the `journey` family then covers: `set-path`, `update`,
no argument, an existing slug, a nonexistent slug (nonzero, named), and the
two retired admin verbs (refused by name with their cutoff, per TS4).

## Impact

Real but bounded. Any caller that checks the exit code — a skill, a hook, an
extension, the Desktop's Rust — is told a nonexistent journey exists and is
empty. A mistyped slug in `mm-journey` or `mm-build` reads as "this journey
has nothing yet" instead of "no such journey". Nothing is written; the harm
is a wrong answer with a success code, which is the shape RS009 exists to
close.

Structural: while the Python oracle exists, the TS status read is graded at
parity. Changing the exit code is a recorded deviation, which means either an
oracle-drift exemption for the duration or sequencing the change after TS5
removes the oracle and parity stops meaning anything.

## Plan Or Decision

Not planned. Captured 2026-09-23 during the CV22.DS10.TS4 Plan review, when
the panel found that TS4's draft had folded this into CR089's front-door fix
and that the behavior is Python's own. The Navigator decided the same day to
**capture it separately** and keep TS4 to deletion: TS4 delivers CR089 as the
two named `retired` entries and leaves `journey <slug>` byte-identical to the
oracle.

Recommended sequencing: after CV22.DS10.TS5 deletes the oracle, when the
change is a plain behavior decision with a plain test. Taking it earlier is a
Navigator choice and requires the drift exemption named above.

## Evidence

- `src/memory/cli/journey.py:12–40` — `cmd_status` prints whatever the
  service returns; no not-found branch (contrast `cmd_set_path`, line 54,
  which has one).
- `ts/src/frontDoor/render/journeyStatus.ts` — the port, with the
  slug-resolution quirk documented at the top of the file.
- `ts/src/frontDoor/routing.ts:873–885` — the family claim: `set-path`,
  `update`, else status read.
- Live check, 2026-09-23: both engines, eight lines on stdout, empty stderr,
  exit 0, for `journey no-such-journey-xyz`.
- [CR089](cr089-the-journey-route-swallows-export-registry-and-mutate.md)
  §Expected Behavior — the two options, and why only one of them is a routing
  fix.
- [CV22.DS10.TS4 plan](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts4-retire-the-unported-surfaces-with-cutoffs/plan.md)
  §Review — the panel finding that separated this from TS4.

## Outcome

Open.
