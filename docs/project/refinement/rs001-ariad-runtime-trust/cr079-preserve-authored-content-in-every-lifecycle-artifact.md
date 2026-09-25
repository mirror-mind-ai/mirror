[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR079 — Preserve authored content in every lifecycle artifact, not one at a time

**Status:** captured
**RS:** RS001
**Driver:** —
**Delivery:** —

## Problem

Ariad lifecycle commands regenerate their story-package artifact from the
arguments they are given, replacing whatever a Driver had authored there. The
project has met this three times now, at three stages, and has fixed it twice —
each time for one artifact:

| Stage | Artifact | Record | State |
|---|---|---|---|
| Plan materialization | `index.md` | [CR004](cr004-preserve-authored-story-index.md) | captured, open |
| Plan approval | `plan.md` | [CR015](cr015-preserve-driver-authored-plan-before-approval.md) | promoted → CV20.DS15/DS16, **done** |
| Validation | `validation.md` | this CR | — |

The third instance, 2026-09-12, during CV22.DS8.US3's closure: `build
validate-item` replaced a 235-line authored `validation.md` with its 33-line
generated summary. Lost in the overwrite were the per-probe result tables, a
cross-engine ledger comparison against the home's own Python-written rows, the
two environmental traps the validation had surfaced, and the step-by-step
outcomes of seven Navigator-run steps. It was recoverable only because the
authored version happened to have been committed before the lifecycle commands
ran.

The pattern is not "three bugs". It is one missing rule, patched per artifact
as each instance is met. CV20.DS15 delivered Plan preservation; nothing
generalized it, so `index.md` is still open and `validation.md` was never
considered. `review.md`, `coherence.md`, `done.md`, and `handoff.md` have the
same shape and have simply not been authored by hand yet in a story that also
ran their command.

## Expected Behavior

A lifecycle command owns its own generated sections and nothing else. Given an
existing artifact, it updates the fields it generates and leaves every other
byte alone; given no artifact, it writes its scaffold as today.

Stated as the rule rather than as three fixes: **no Ariad command replaces
content it did not write.** The natural shape is a marked, regenerable region —
the runtime's contract fields — with authored narrative outside it, which is
how `validation.md` was reassembled by hand after this instance.

A weaker but acceptable form, if merging proves costly: refuse to overwrite a
file whose content diverges from the scaffold the command would have produced,
and name the file. A refusal is recoverable; a silent replacement is only
recoverable through git, and only if the author happened to commit first.

## Impact

Medium, and it is the trust kind rather than the correctness kind. Nothing is
corrupted and nothing ships wrong — the loss is Driver work, and the damage is
to the belief that running the lifecycle is safe. A Driver who has been bitten
once starts copying files before running commands, which is exactly the
defensive ritual a runtime is supposed to make unnecessary.

The exposure grows as story packages get richer. US3's `validation.md` held
evidence that cost real money to produce: eight live provider probes and four
writes against a real home. Regenerating it discarded the record of spend that
had already happened.

## Plan Or Decision

**2026-09-25 — in the Ariad trust floor; CR004 folds into this.** Decided in
[The CV22 release is gated on an Ariad trust floor, worked before US3](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3):
this CR is taken as the general rule, and CR004 closes with its delivery rather
than as a fourth per-artifact patch. Decision 2 below is therefore answered;
decision 1 (merge or refuse) is still open and belongs to this CR's plan.

Not yet planned. Two decisions belong to whoever takes it:

1. **Merge or refuse.** Marked regenerable regions preserve the most and cost
   the most; refuse-and-name is cheap and leaves the Driver to merge by hand.
2. **Whether CR004 folds into this.** CR004 is the same rule at the Plan stage
   for `index.md`. If this CR is taken as the general rule, CR004 should be
   superseded by it rather than fixed separately — a fourth per-artifact patch
   is the thing this CR exists to stop. CV20.DS15's delivered Plan preservation
   is the reference implementation to generalize from, not to duplicate.

### Plan (drafted 2026-09-25, panel-reviewed, awaiting Navigator approval)

#### Characterization (read-only, TypeScript engine)

Every file write in `ts/src/builder`, and what it does to a file that already
exists:

| Command | Writes | Existing file |
|---|---|---|
| `prepare-templates` | method templates | preserved (`templateGeneration.ts`) |
| `pull-item` → Expand | Delivery Story and child `index.md` | preserved (`expand.ts`) |
| `plan-item` | `index.md`, `plan.md`, `test-guide.md` | preserved (`writeStoryPackage`) |
| `plan-delivery-story` | the Delivery Story's `plan.md`, `index.md`, `test-guide.md` | preserved (`writeDeliveryStoryPackage`) |
| `validate-item`, `review-item`, `coherence-item`, `done-item` | `validation.md`, `review.md`, `coherence.md`, `done.md` | **replaced** (`writeClosureArtifact`, unguarded on purpose: the port reproduced Python and named this CR) |
| Delivery Story validate, review, coherence, and Done | the same four, at Delivery Story level | **replaced** (`writeDeliveryStoryClosureArtifact`) |

Three facts reshape this CR:

1. **CR004 is already fixed.** `writeStoryPackage` writes each file only when
   it is absent. The oracle-recorded golden sequence
   `plan_preserves_authored_plan` shows an authored `index.md` and `plan.md`
   coming through Plan byte for byte, with only the missing `test-guide.md`
   written. This CR's "`index.md` is still open", and the reason US3's
   `inherited.md` gives for being a separate file, misread that. CR004
   closes with this delivery, citing the golden and a direct test.
2. **The live defect is the eight closure writes, and nothing downstream reads
   them.** The runtime reads back only `index.md` (the Delivery Story Done
   preflight) and `plan.md` (the Plan preauthorization completeness check).
   Preserving a closure artifact breaks no later step.
3. **The Delivery Story surface misreports the loss.** Its
   `ARTIFACTS_MATERIALIZED` shows `↻ existing` for a file it has just
   replaced, because the state is computed from a pre-check, not from the
   write. Story-level checkpoints show the artifact path with no state at all.

#### Decision: preserve by ownership seal

Closure artifacts are *records* that the runtime may legitimately rewrite.
When a checkpoint is recorded as pending and later accepted, `validate-item`
runs again, and the file has to follow. Pure no-clobber would freeze the first
record. Marked regions (merge) would keep runtime fields current inside
authored files, at the cost of parsing and repairing regions in Markdown that
people edit by hand.

The recommendation is a seal. A closure artifact the runtime writes ends with
one HTML comment carrying the SHA-256 of everything above it, with line endings
normalized to LF:

```text
<!-- ariad-seal sha256:<hex> — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
```

On write:

- **absent**: write the file sealed; the surface says `created`.
- **present, and the seal matches**: rewrite it sealed; the surface says
  `updated`.
- **anything else**: an authored file, a hand-edited one, one written before
  this CR, one with the seal removed, or one with text after the seal. Leave
  every byte, and the surface says `preserved`. It names the file and says
  this checkpoint's fields are shown in the checkpoint surface, not written to
  the file.

This is the CR's "weaker but acceptable form" without its re-run flaw: the
runtime replaces only content it can prove it wrote and nobody changed.

Rejected alternatives:

- **Marked regions (merge).** More machinery than the two recorded incidents
  need. It can be layered on later, and the seal would mark the region.
- **A digest in the delivery cursor.** No file bytes change, but the cursor is
  recorded in 112 lifecycle sequences, and ownership would live apart from the
  file it describes.
- **A digest in a new `runtime_sessions` row.** It is a fourth kind of pseudo
  row, the overloading
  [CR100](../rs010-cv22-oracle-and-port-hygiene/cr100-the-session-resolver-guesses-from-a-table-of-three-row-kinds.md)
  exists to remove.

#### The rule, made structural

This CR's complaint is that the rule was patched one artifact at a time. So:

- **One writer**, `ts/src/builder/artifacts/artifactWriter.ts`, with two
  policies. `create-only` covers the scaffolds (Plan packages, Expand,
  templates), exactly as they behave today. `sealed-record` covers the eight
  closure artifacts. It returns what it did (`created`, `updated`, `existing`,
  `preserved`), and every surface reports that return value, never a
  pre-check.
- **Confinement at the writer.** Every path must resolve under the journey's
  project root, and anything else is refused before writing. That closes
  CR008's wrong-repository writes at the file layer as well.
- **A guard test.** It fails if any module under `ts/src/builder` other than
  the writer calls `writeFileSync`, `appendFileSync`, or `renameSync`, and it
  carries a positive fixture so it cannot pass vacuously. A ninth artifact
  cannot arrive without choosing a policy.

#### Scope

- New: `ts/src/builder/artifacts/artifactWriter.ts` (policies, seal,
  ownership check, confinement).
- Rerouted through the writer: `closureArtifacts.ts`,
  `deliveryStoryArtifacts.ts`, `planArtifacts.ts`, `expand.ts`,
  `templateGeneration.ts`.
- Surfaces: `preserved` becomes a real state, distinct from `existing` (a
  scaffold kept) and `updated` (a sealed record rewritten). This covers
  `artifactSurfaces.ts`, the Delivery Story closure manifest, and the
  story-level checkpoint rows, all worded in plain project language.
- Goldens: every recorded closure artifact gains its seal. That is 150
  recorded contents: 134 in `builder-lifecycle` across 26 sequences and 16 in
  `builder-command`, plus the state rows of their surfaces.
  - The mechanical edit is a script that applies
    `content → content + seal(content)` only to closure paths (never
    templates), asserts its counts, and adds a ledger row, per the freeze
    rule.
  - A sequence in which an authored closure file precedes its command changes
    meaning (replaced becomes preserved). Such sequences are edited by hand,
    with intent, and listed.
- Docs:
  - REFERENCE: who owns a lifecycle artifact.
  - The `mm-build` skill: `preserved` is not an error, and it is never
    "fixed" by deleting an authored file.
  - US3's `inherited.md`: its stated reason is corrected.
  - CR004's closure.

#### Acceptance Behavior

```text
Given no validation.md
When validate-item runs
Then validation.md is written with a seal, and the surface says created

Given a sealed validation.md that nobody changed
When validate-item runs again (recorded pending, then accepted)
Then the file carries the new fields and a new seal, and the surface says updated

Given a validation.md that is authored (no seal), hand-edited, missing its
  seal line, or has text after the seal
When validate-item runs
Then every byte is unchanged, the cursor advances exactly as today, and the
  surface says preserved, names the file, and says the fields are in this checkpoint

Given a sealed validation.md whose line endings were converted to CRLF
When validate-item runs again
Then it is recognized as unchanged and updated (no Windows checkout demotes a record)

The same for review.md, coherence.md, done.md, and the four Delivery Story
  closure artifacts. The Delivery Story surface never again says existing for a
  file it replaced.

Given an authored index.md, plan.md, or test-guide.md
When plan-item or plan-delivery-story runs
Then each is byte-identical afterwards (CR004: the golden, and now a direct test)

Given an artifact path outside the journey's project root
When any writer policy is asked to write it
Then it refuses, and nothing is written

Given a module under ts/src/builder other than the writer
When it calls writeFileSync, appendFileSync, or renameSync
Then the guard test fails, and its fixture proves that the detector detects
```

#### Validation Route

Automated checks:

- tests first, for every acceptance line;
- the golden edit, run as a script with asserted counts;
- `npm test`, typecheck, and lint;
- CI's Builder Ariad lifecycle smoke.

Navigator-visible, on a scratch project (never a real repository):

1. Author a `validation.md` with evidence and run `validate-item`: the file is
   untouched, and the surface says preserved.
2. Delete it and run again: a sealed record is created.
3. Accept and run again: the record is updated.
4. Edit one line and run again: the file is preserved.

#### Exclusions

- Merging runtime fields into authored files (regions). This is possible
  later, and compatible with the seal.
- Seals on scaffolds. `create-only` needs none.
- `handoff.md`. No Ariad command writes it.
- The Explorer handoff writer. It sits outside the Builder tree and already
  never overwrites: it picks a fresh directory when the base exists.
- Migrating closure files written before this CR. They carry no seal, so a
  re-run preserves them. Deleting one lets the runtime write a sealed record.
  This is documented, not automated.

#### Panel Plan Review (2026-09-25)

The plan was reviewed in a single pass by the technical persona panel.

Synthesis: the plan is sound, and its risk sits in two places.

- **The golden edit.** 150 recorded contents change, so the transform must be
  mechanical and verified.
- **Robustness to accidental byte changes.** The seal has to survive changes
  that rewrite bytes without changing meaning, line-ending conversion above
  all.

Five lenses dissented, and every finding is folded in above:

- **DevOps and quality assurance:** hash LF-normalized content, and test it
  directly, since no CI job runs the core on Windows.
- **Quality assurance:** acceptance names text after the seal, a removed seal,
  and the pending-then-accepted double run.
- **Security:** confinement belongs at the single writer. The seal is
  integrity by convention, not authentication, and it gates nothing beyond
  overwrite permission for these eight files.
- **Engineer:** surfaces must report the writer's return value. The `↻
  existing` misreport came from a separate pre-check. The guard test carries a
  positive fixture.
- **AI engineer and prompt engineer:** the skill must say that `preserved` is
  not an error and must not be "fixed" by deleting an authored file. The seal
  line is written for an agent reading raw Markdown.

The database, experience, and product lenses raised nothing further. The
database lens preferred the seal in the file over a digest in the cursor or a
new pseudo-row.

#### Authority Boundary

This plan authorizes nothing. Implementation starts after Navigator approval
(`planned`), with the Driver and Delivery recorded at `in_progress`. No commit,
push, or release is granted by any part of it.

## Evidence

- `docs/project/roadmap/cv22-typescript-core-port/cv22-ds8-live-provider-cutover/cv22-ds8-us3-long-tail-cutover-and-gate-consolidation/validation.md`
  — carries a closing note describing the overwrite and the restoration; its
  current structure (contract fields first, authored evidence below) is the
  hand-made version of the merge this CR asks the runtime to perform.
- Commit `96c6991b` — the restoration, with the diff showing 235 lines replaced
  by 33.
- **Second data point, 2026-09-13, CV22.DS8.TS2.** `validate-item` replaced
  the authored `validation.md` (146 lines) with a 33-line scaffold of the
  command's flags; `review-item` then replaced an authored, not-yet-committed
  `review.md` with the same shape. Validation was restored from its commit
  with the runtime's fields summarized in a closing section; the review was
  re-authored from the Driver's draft. Same class, one story later — the
  overwrite is a property of every lifecycle verb that names an artifact,
  which is this CR's thesis.
- [CR004](cr004-preserve-authored-story-index.md),
  [CR015](cr015-preserve-driver-authored-plan-before-approval.md) — the two
  earlier instances.

## Outcome

_Pending._

## Provenance

Found on 2026-09-12 while closing CV22.DS8.US3, by running the Ariad lifecycle
on a story whose validation evidence had been authored by hand first. Captured
at the Navigator's request after the same session's Debt Review, because the
instance is fixable in place but the rule is not, and the next authored
artifact will meet it again.
