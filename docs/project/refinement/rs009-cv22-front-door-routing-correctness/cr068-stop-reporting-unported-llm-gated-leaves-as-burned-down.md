[< RS009](index.md)

# CR068 — Stop reporting unported LLM-gated leaves as burned down

**Status:** done
**RS:** RS009
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

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

### Disposition (Navigator decision, 2026-09-09)

Of the three options the CR named, **DS8 deferral was ruled out on the
project's own terms**: DS7's seam boundary says a family that needs a live call
is DS7-done once its orchestration runs on TS under replay — that is how `soul
harvest save` and the `conversation-logger` close tail shipped — so these
leaves need an owner in DS7, not a parking spot in DS8. Retirement was ruled
out because `mm-journal` and `mm-week` are live documented skills.

**A new story, CV22.DS7.US11 — Content & planning LLM tail**, in the US5 →
US10 shape (a deterministic core story spawns the story that owns its LLM
tail). It takes `journal`, `week plan`, `week save`, and — found while reading
`routing.ts` for the correction — two more orphans of the same class:
`descriptor generate` (US1 kept it "as the DS7↔DS8 live seam", but DS8 flips
live mode and ports nothing) and the ES-001 `conversations`
metadata-lifecycle CLI faces (US1 said "own slice"; none claimed them; the
engine is already in `conversation/metadataLifecycle.ts`). A third orphan,
`identity edit`, went to DS7.TS4 as a `spawnSync($EDITOR)` port — "kept on
Python" is not a disposition once Python is deleted. The one-shot
`--metadata-backfill-*` flags retire in DS10.

One of the CR's own premises was also wrong: **`week save` is not LLM-gated.**
`save_week_items` reads the pending file and calls `add_task`, which is on TS
since US2. The routing table's refusal reason ("week plan/save are
LLM-gated") is false for `save`; US11 flips it ungated.

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

Added 2026-09-09, from the code: `services/tasks.py:save_week_items` makes no
LLM or embedding call (pending file → `ExtractedWeekItem` → `add_task`);
`services/memory.py:add_journal` calls `classify_journal_entry` whenever title,
layer, or tags are missing — which the CLI never supplies — then `add_memory`
(embedding); `services/tasks.py:ingest_week_plan` calls `extract_week_plan`
then `find_tasks_by_title`. `routing.ts` refuses `descriptor generate` as
"(LLM) not ported" and the six `CONVERSATIONS_LIFECYCLE_FLAGS` as "not
ported"; `ts/src/conversation/metadataLifecycle.ts` exists. `identity edit`
is refused as "interactive $EDITOR".

## Validation

**Accepted 2026-09-09** by @viniciusteles.

Because this CR changed documentation only, the question was not "does the code
work" but **can the corrected ledger predict the system's behavior?** The route
therefore required a written prediction from the tables *before* any command
ran; observing first would have validated nothing.

Route: read the *Content & planning writes* per-leaf table and the *Remainder*
table, predict the answering engine for five leaves, then run them through the
front door on the real home and read `front-door.log`.

| # | Command | Ledger predicts | Log recorded |
|---|---------|-----------------|--------------|
| 1 | `week view` | ts | `week ts exit=0` |
| 2 | `week save` | python | `week python exit=0` |
| 3 | `journal --help` | python | `journal python exit=0` |
| 4 | `tasks list` | ts | `tasks ts exit=0` |
| 5 | `consult credits` | python | `consult python exit=0` |

Rows 1 and 2 are the acceptance core: one command, two subcommands, two
engines. The row this CR replaced (`3/3 ✅ done`) could not have predicted row 2.

The sheet carried three guards against the failure class this project has
recorded twice (US6's bash-only `read -ra` comparing two identical failures;
US7's literal placeholder slug comparing two empty responses). All three held:
the log grew by exactly five lines (429 → 434), every entry exited 0, and the
engine column contained both values (3 python / 2 ts). A sheet that measured
nothing would have failed at least one.

Incidental live evidence: `consult credits` returned R$ 18.29 on the
implementer's run and R$ 18.28 on the Navigator's — a real OpenRouter call,
answered by Python, which is the production-reality claim demonstrated rather
than argued.

**Limits of this validation, stated because a spot check that claims more than
it measured is the defect this ledger exists to prevent.** Five leaves were
checked, so *completeness* of the Remainder table is not established by this
route — it rests on a read of `routing.ts`. The log shows `consult python`; it
does not show that the opt-in gate is the reason, which is a code inference.
And the dispositions (US11, TS4, DS10) are accepted judgments, not observables.

## Review

**Proportionality.** 565 lines across 10 files for three unowned leaves reads
heavy, but most of it is the Remainder table and the per-leaf detail section —
new standing structure, not prose about this defect. Justified: the burn-down
denominator is the artifact the strangler proves convergence with, and it now
has a place where an unowned leaf cannot hide. The alternative, correcting one
row, would have left the same defect class free to recur, which it already had
four more times.

**Scope discipline.** The CR ported nothing, changed no route, and revisited no
flip decision, as its boundaries required. `week save`'s wrong refusal reason in
`routing.ts` was documented, not fixed, and belongs to US11.

**One of the CR's own premises was wrong and is recorded as such** rather than
quietly corrected: it assumed all three leaves were LLM-gated. `week save` is
not. Capturing a CR from a partly mistaken reading is normal; leaving the
mistake in the record is what keeps the next reader honest.

**Debt — deferred, with a revisit trigger.** The Remainder table's
*completeness* has no automated guard. It is accurate today because
`routing.ts` was read end to end; nothing prevents drift the next time a route
changes. This is the same defect class this CR just paid, one level up: an
accounting artifact whose truth depends on someone remembering. The fix is a
check that enumerates every routing decision and diffs it against the table.

- **Decision:** defer.
- **Reason:** the natural home is **CR072**, which already opens
  `check_skill_command_parity.py` and adds an assertion to it; building a second
  checker now would duplicate the harness.
- **Revisit trigger:** when CR072 is planned. If CR072 is parked or rejected,
  this debt returns as its own CR rather than lapsing.

## Outcome

**Done 2026-09-09.** Implemented, validated on the real home, reviewed.

What changed, all in project documents (no code, no route, no SQLite):

1. [Burn-down ledger](../../roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/burn-down-ledger.md):
   the *Content & planning writes* row is per-leaf (`tasks` 9/9, `week` 1/3,
   `journal` 0/1) with owner `US2 / US11`; a per-leaf detail section in the
   `conversation-logger`/`runtime` shape; the ‡ residuals extended with
   `descriptor generate`, `identity edit`, and the ES-001 flags, each with an
   owner; a new **Remainder** section listing every leaf that does not answer
   from TS in an unconfigured install with its owner — including the thirteen
   ported leaves behind the opt-in `MIRROR_TS_EXTERNAL_ROUTES` gate, under DS8;
   the **reassignment rule** and the skill-bypass note in the Rules; the
   denominator restated (30 → 29, `journey-projection` to DS10 with TS5); a
   History entry.
2. [DS7 index](../../roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/index.md):
   US11 row added to the candidate table; TS5 row marked reassigned; status
   line and ordering prose updated.
3. [US11 package](../../roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/cv22-ds7-us11-content-planning-llm-tail/index.md)
   authored: five-row leaf inventory, seam boundaries, evidence, revert
   contract.
4. [DS10 index](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/index.md):
   backfill-flag retirement recorded (item 6).
5. [Decisions](../../decisions.md#cv22-makes-the-ported-work-real-before-porting-more):
   the dispositions recorded near the roadmap, per the single-owner rule.

**Validation route (Navigator).** Open the ledger's Remainder table and the
Content & planning detail table; for any two leaves of your choosing, run the
front door with the argv shown and confirm the engine the log records matches
the table (`tail -3 ~/.mirror-minds/vinicius-ts/front-door.log` after each).
Expected: `journal` and `week plan` → `python`; `week view` → `ts`. Pass: the
table and the log agree. Fail: any row whose engine the log contradicts.

**Not done by this CR:** no route changed; `week save` still says "LLM-gated"
in `routing.ts` until US11 corrects it; the nine bypassing skills are CR072;
the Remainder table's completeness guard is deferred to CR072 with a trigger.

**What it changed downstream.** The inspection that paid this CR produced the
re-sequencing recorded in
[Decisions — CV22 makes the ported work real before porting more](../../decisions.md#cv22-makes-the-ported-work-real-before-porting-more):
DS8 moved ahead of US8, TS5 moved to DS10, US8's D1 resolved to retire the
SQLite Workbench, and CR072/CR073 were captured. A CR scoped to "correct an
accounting row" ended up re-ordering the remainder of the Delivery Story,
which is the argument for reading terrain when paying small debts.

## Provenance

Found while reading terrain for CV22.DS7.US6 (Soul Mode) planning on
2026-09-08: `soul harvest save` writes through the same `add_journal` path,
which prompted checking whether `journal` was already on TS. Captured
separately from US6 rather than absorbed into it, because the correction is
accounting and ownership, not Soul scope.
