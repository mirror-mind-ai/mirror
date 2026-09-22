[< Parent](../index.md)

# CV22.DS10.TS4 — Retire the unported surfaces with cutoffs

**Status:** 🟡 Planned — pulled 2026-09-23; Plan authored and panel-reviewed the same day, awaiting Navigator approval
**Type:** Technical Story
**Artifacts:** [plan.md](plan.md) · [test-guide.md](test-guide.md)

---

## Technical Story

In order to reach zero Python commands without leaving five surfaces to fail
in Python's own words after Python is gone,
As the port owner,
I want `migrate-legacy`, `memory-rehearse-migration`, the twenty SQLite
Refinement Workbench leaves with their `get_workbench_snapshot` read, the
`conversations --metadata-backfill-*` flags, and `journey export-registry` /
`journey mutate` deleted behind published cutoffs, and the front door able to
say *removed* on its own,
So that TS5 inherits a command surface where every name either answers from
TypeScript or refuses with the cutoff that explains why.

## Outcome

The five surfaces (~4,300 lines of Python including tests) are deleted; each
has a section in
[`docs/releases/pending-cutoffs.md`](../../../../../releases/pending-cutoffs.md)
answering what no longer exists, what to do instead, and what still works;
`scripts/check_retired_surfaces.py` asserts each deletion stays complete; the
front door refuses all six command shapes with one line naming the cutoff and
exit 1 — before any stdin read, echoing nothing — so `journey export-registry`
and `journey mutate` can never again be read as slugs (CR089; the unknown-slug
exit-0 behavior is Python parity and is CR095, after TS5); the `🧰 Refinement field`
renders one file-first state on projects without a refinement index; the 62
Workbench rows and migrations `015`/`016` are untouched.

## Acceptance Behavior

```text
Given any of the six retired command shapes
When  the Navigator runs it through the front door
Then  one line names the surface and its cutoff anchor, and the exit code is 1
And   `journey mutate` with JSON on stdin, or stdin closed, exits 1 at once
      without reading or echoing it
And   `journey <existing-slug>` and `journey` are byte-identical to before

Given `uv run python -m memory --help` and the installed scripts
When  the story is done
Then  none of the five surfaces appear, and the retired-surface check passes
      with five TS4 rows

Given this project, and a project with no docs/project/refinement/index.md
When  `build load` runs on each
Then  the first renders its Refinement field byte-identical to before, and the
      second renders the single file-first state with no SQLite read behind it

Given the Navigator's memory.db
When  the story is done
Then  builder_refinement_stories holds 10 rows, builder_change_requests 52,
      the _migrations ledger is unchanged, and 015/016 still read as applied
```

## Scope

See [plan.md](plan.md) §Scope A–F. In one line: a baseline, a `retired`
decision at the front door plus CR089's two named entries, then four deletion
plateaus (migration tools, `journey_admin`, backfill flags, Workbench —
Python side first so the goldens regenerate from the oracle), then cutoffs,
guard rows, and the residue sweep.

## Out Of Scope

Any port; Workbench row export or table drop; `conversation-logger backfill-*`;
the `runtime` update/release half (US2); `fallbackPython`, `MIRROR_TS_*`
gates, `uv`, `pyproject.toml`, `ts/parity/` (TS5); `retired` entries for
`web` / `eval` / `journey-projection` (TS5); the `journey <slug>` status read
for unresolvable slugs (CR095, after TS5); Mirror Desktop.

## Gate Items (from the [DS10 package](../index.md#command-surfaces-assigned-from-ds7-decision-2026-09-07))

2. `migrate-legacy` — retired unported, cutoff documented;
3. `memory-rehearse-migration` — retired unported;
5. the twenty SQLite Workbench leaves and the `get_workbench_snapshot` read —
   retired unported, cutoff documented, rows stay readable through the last
   Python-bearing release;
6. `conversations --metadata-backfill-preview|-apply` — retired unported,
   cutoff documented;
— plus `journey export-registry` / `journey mutate` (`journey_admin`, 345
lines; disposition recorded in TS1, routing half in
[CR089](../../../../refinement/rs009-cv22-front-door-routing-correctness/cr089-the-journey-route-swallows-export-registry-and-mutate.md)).

## Validation

See [test-guide.md](test-guide.md). Every route is free and keyless; the
Navigator's real-home `build load` after plateau 5 is the end-to-end check.

## Plateau Progress

| # | Plateau | Status |
|---|---|---|
| 0 | Baseline: `build load mirror-ts-core` captured, read-only home copy for the index-less route | ○ |
| 1 | The front door says *removed* (`retired` decision, six predicates, three refusal properties, CR089's two entries) | ○ |
| 2 | `migrate-legacy` and `memory-rehearse-migration` deleted | ○ |
| 3 | `journey_admin` deleted | ○ |
| 4 | `conversations --metadata-backfill-*` deleted | ○ |
| 5 | The Workbench: Python renders the single state → goldens regenerated → TS follows → Python's Workbench deleted (four commits, reverted as a set) | ○ |
| 6 | Cutoffs, guard rows, residue sweep | ○ |

## Lifecycle Record

- **2026-09-23** — Pulled, Prepare read the terrain, Plan authored. Three
  decisions put to the Navigator (front-door `retired` shape; CR089 delivered
  in plateau 1 with Driver/Delivery recorded; Refinement field collapses to
  one file-first state, rows untouched).
- **2026-09-23** — Panel Plan review (engineer, quality-assurance,
  security-engineer, database-architect, devops-engineer): six findings, all
  folded into the plan. The draft's CR089 promise conflated a verb with a
  slug and hid a parity deviation; the Navigator decided to **capture that
  separately** — [CR095](../../../../refinement/rs009-cv22-front-door-routing-correctness/cr095-journey-status-renders-an-empty-document-for-an-unknown-slug.md)
  — and keep TS4 to deletion. Plateau 5 re-ordered Python-first for the
  goldens; plateau 0 added for the baseline.

## Where To Resume

Plan reviewed and corrected; awaiting Navigator approval of the three
decisions. Nothing implemented.
