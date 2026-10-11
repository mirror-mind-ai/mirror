[< Refinement Workbench](../index.md) · [RS004](index.md)

# CR094 — Two journey identity layers hold the same document, and the one Mirror Mode reads is the one that drifts

**Refinement Story:** RS004 — Identity Resolution Fidelity
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

A journey's document is stored twice, in two `identity` layers, with the same
shape and no mechanism keeping them consistent:

| Layer | Written by | Read by |
|---|---|---|
| `journey` | `identity set journey <slug>` | `mirror load` context assembly (`mirror/orchestration.ts`), `journeys` listing |
| `journey_path` | `journey update <slug>` | `journey <slug>` detail, `journeySyncFile`, MCP read models, **task extraction** (`tasks/journeyPathParse.ts`) |

Both hold a full Markdown document opening with `# Title`, `**Status:**`, and
`**Stage:**`, followed by Description / Required reading / Current focus / Scope
/ Done condition. Nothing reconciles them, and no surface reports that they
disagree.

Found on 2026-09-22 while closing CV22.DS10.TS2. The `mirror-ts-core` journey
had:

- `journey_path` updated **2026-09-21**, accurate — DS10, TS2 in flight;
- `journey` updated **2026-09-10**, twelve days stale — still claiming
  "DS7 — Command Burn-Down (12/15) — next: DS8 live-provider cutover", with
  DS7, DS8, and DS9 all closed by then.

The stale copy is the one injected into **every Mirror Mode load**, so the
mirror had been reading a twelve-day-old picture of its own most active journey
back to itself, in every session, while the Navigator diligently maintained the
copy nothing reads back to him.

## Expected Behavior

One authority for a journey's document, or — if two layers are genuinely
warranted because they serve different purposes — an explicit contract saying
which owns which fact, and a check that reports drift instead of letting it
accumulate silently.

The failure is not that a document went stale. It is that **staleness in this
particular record is invisible by construction**: the layer that drifts is the
one only the model reads, and the model has no way to notice that what it was
handed disagrees with what the human has been editing.

Three shapes worth weighing, none chosen here:

1. **Collapse to one layer.** Simplest end state; requires deciding which
   consumers move, including task extraction and the MCP read models.
2. **Keep both, split the contract.** `journey` holds durable framing (what the
   journey is, scope, done condition, coarse position); `journey_path` holds
   volatile per-story detail. This is the shape the record was left in on
   2026-09-22, but as a convention in prose, enforced by nothing.
3. **Keep both, add a drift check.** Cheapest; reports rather than prevents,
   and adds a check for a duplication that may not deserve to exist.

## Impact

Silent and continuous, which is what makes it worth a CR rather than a fix in
passing.

Nothing errors. No command fails. The cost is that Mirror Mode reasons from a
stale journey description — the single richest piece of context it gets about
what the user is actually doing — and neither the user nor the model can see the
discrepancy. A mirror whose self-description has quietly expired is a specific
kind of wrong: it will sound confident and current while being neither.

There is also a smaller trap for anyone editing these records. `journey update`
prints `Journey path '<slug>' updated.` and writes `journey_path`; the obvious
reading of the command name is that it updates the journey. Updating the
document `mirror load` actually reads requires `identity set journey <slug>`,
which is not what the journey skill documents. This CR's own discovery went that
way: the first write went to the wrong layer.

## Plan Or Decision

Not planned. Captured 2026-09-22 at the Navigator's request while wrapping up
CV22.DS10.TS2, after both records were brought up to date by hand.

Filed against **RS004** rather than RS010: this is not port hygiene and has
nothing to do with CV22 — it predates the migration and outlives it. RS004's
framing is the fit: *"identity-derived facts one resolver with one contract …
the framework asking one authority instead of guessing three ways."* A journey
document is an identity-derived fact with two authorities and no contract.

Same class as CR093, and the two are worth reading together: a guard or a
convention covers one surface, the neighbouring surface looks identical, and
nothing notices the gap.

Out of scope until the Navigator chooses a shape: any change to task extraction,
MCP read models, or the `journey update` command's naming.

## Evidence

```text
# the two rows, same journey, twelve days apart
$ sqlite3 memory.db "SELECT layer, length(content), updated_at FROM identity
                     WHERE key='mirror-ts-core' AND layer IN ('journey','journey_path');"
journey       5210  2026-09-10T14:31:59Z     <- read by mirror load
journey_path  3824  2026-09-21T12:20:16Z     <- read by `journey <slug>`

# what the stale copy was telling every Mirror Mode session
**Stage:** DS7 — Command Burn-Down (12/15; US8, US9, TS4 remain) — next: DS8 live-provider cutover
# actual state that day: DS7 done 2026-09-17, DS8 done 2026-09-13, DS9 done 2026-09-19

# the two writers, neither of which mentions the other
ts/src/frontDoor/cli.ts        journey update  -> setIdentity(..., JOURNEY_PATH_LAYER, ...)
                               prints "Journey path '<slug>' updated."
ts/src/frontDoor/cli.ts        identity set journey <slug> -> layer 'journey'

# the readers
ts/src/mirror/orchestration.ts:213   SELECT ... FROM identity WHERE layer = 'journey'
ts/src/journey/journeyStatus.ts:91   getIdentityContent(db, JOURNEY_PATH_LAYER, journeyKey)
ts/src/tasks/journeyPathParse.ts     extracts tasks from the journey PATH layer
```

## Outcome

Open.
