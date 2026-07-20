[< CV20 — Builder Mode Evolution](index.md)

# Ariad Dogfooding Ledger

Findings about the **Ariad runtime itself**, discovered while using it on real
journeys. This is not a roadmap and not a project; it is a capture surface so
runtime problems observed during real work are not lost between sessions and can
later be turned into CV20 Change Requests or Delivery Stories.

**Rule for entries:** record what was observed, what was expected, why it
matters, and a concrete suggested fix pointing at the likely CV20 owner. One
finding per problem. Keep evidence verbatim where possible.

## Source Context

Session of **2026-07-15**, dogfooding the **uncle-vinny** Next.js platform
migration (that journey's Chapter 7). Sequence exercised: `build adopt` →
`prepare-templates` → `sync-cursor` → `set-cadence` → `pull-item`
(delivery_story) → `set-flow-unit` → `plan-delivery-story`.

## Severity Legend

- **Blocker** — prevents correct use; must fix before relying on the runtime.
- **Major** — produces wrong/misleading state or breaks a core promise (surface trust, roadmap fidelity).
- **Minor** — confusing or inconsistent, but workable.
- **Enhancement** — would improve the experience; not a defect.

## Summary

| ID | Severity | Area | Likely CV20 owner | Status |
|----|----------|------|-------------------|--------|
| AF-001 | Major | Expand ignores authored candidate-story table | CV20.DS5 (child expansion) | ✅ Fixed (CV20.DS13) |
| AF-002 | Major | Surface reports a file it did not write | CV20.DS4.TS3 (deterministic surfaces) | Open |
| AF-003 | Major | DS plan template thinner than `plan_contract` | CV20.DS5 (DS plan artifact) | Open |
| AF-004 | Minor | Scope-confirmation checkpoint collapses into plan | CV20.DS5 + cadence | Open |
| AF-005 | Minor | Self-nested roadmap tree; child == parent | CV20.DS5 (expansion) | ✅ Fixed (CV20.DS13) |
| AF-006 | Minor | Approve reports "updated story index" but file is unchanged | CV20.DS4.TS3 (deterministic surfaces) | Open |
| AF-007 | Minor | Next-pull recommendation points at a legacy/archived item, ignoring the active chapter sequence | CV20.DS4/DS5 (roadmap awareness) | ✅ Fixed (CV20.DS13) |

## What Worked (calibration)

`adopt`, `prepare-templates`, `sync-cursor`, `set-cadence`, `pull-item`, and
`set-flow-unit` all behaved correctly. The deterministic surface transport
(marked `<<<ARIAD:…>>>` blocks) rendered cleanly and in order every time — the
transport contract itself is solid. The findings below are about *content
fidelity* behind the surfaces, not the surface protocol.

---

## AF-001 — Expand ignores the authored candidate-story table

**Severity:** Major **Status:** ✅ Fixed (CV20.DS13, `f954417`) **Likely owner:** CV20.DS5 (Delivery Story child expansion)

**Resolution.** DS13.TS3 taught `expand_delivery_story` to parse the DS index
`## Candidate Stories` table and materialize one package per missing child with
its real code/title/type; the generic-`US1` fallback now applies only when no
table is present.

**Context.** `build pull-item --item-level delivery_story` for DS-31, whose
`index.md` contains a `## Candidate Stories` table with ten authored rows
(DS-31.TS-1 … TS-10), each with Code, Story, Type, Status.

**Observed.** Expand materialized a single generic child, `US1 Migration
Foundation` (title copied from the Delivery Story), and created
`ds-31-us1-migration-foundation/index.md`. The ten authored rows were ignored.

**Expected.** Expand should ingest the DS index candidate-story table and
materialize children from it — typed as user/technical story via the `Type`
column — or explicitly reconcile against it.

**Impact.** The reviewed, specialist-hardened roadmap (10 packages) and the
runtime cursor (1 placeholder) diverge immediately. Planning risks running off a
placeholder; the child tree carries no real information; the human must
reconcile by hand. This breaks the CV20 promise that the runtime renders the
delivery moment from data rather than making the agent re-derive it.

**Suggested fix.**
- In the Expand handler, parse the `## Candidate Stories` markdown table (stable
  schema: `Code | Story | Type | Status`) and create one child package per row,
  mapping `Type` → `user_story`/`technical_story`.
- Reconcile by code so re-expansion is idempotent (no duplicate `US1`).
- Fall back to generic child generation only when no table is present.
- Offer an explicit override: `pull-item …/expand-item --child <code>` (repeatable)
  to pass codes when the doc has no table.

---

## AF-002 — `ARTIFACTS_MATERIALIZED` reports a file that was not written

**Severity:** Major (surface trust) **Status:** Open **Likely owner:** CV20.DS4.TS3 (deterministic surface delivery)

**Context.** After `plan-delivery-story` for DS-31.

**Observed.** The `ARTIFACTS_MATERIALIZED` surface listed:

```text
✓ created test guide
docs/project/roadmap/ds-31-migration-foundation/test-guide.md
```

No `test-guide.md` existed on disk afterward — only `plan.md` was created and
`index.md` updated. (I authored `test-guide.md` by hand afterward.)

**Expected.** The surface reflects actual filesystem results.

**Impact.** Surfaces are the runtime's trust boundary — the whole point is that
the Navigator can rely on them instead of inferring state from prose. A surface
that claims a write that did not happen is a silent documentation gap and
quietly corrodes trust in every other surface.

**Suggested fix.**
- Build the `ARTIFACTS_MATERIALIZED` surface from the actual return of the
  file-writer (per path: created / updated / skipped), not from the method's
  declared template list.
- Assert existence immediately after writing; only report paths that were
  actually created or updated.
- Regression test: every path named in an `ARTIFACTS_MATERIALIZED` surface must
  exist on disk after the command returns.

---

## AF-003 — DS plan template is thinner than the method's own `plan_contract`

**Severity:** Major **Status:** Open **Likely owner:** CV20.DS5 (DS plan artifact) / template set

**Context.** `plan-delivery-story` materialized `plan.md`.

**Observed.** The generated `plan.md` contained metadata, the objective, the
child list, an approval-gate line, and a boundary line — nothing else. None of
the `plan_contract.required_outputs` (`scope`, `non_goals`,
`acceptance_behavior`, `validation_route`, `implementation_contract`) were
scaffolded. I authored all of them by hand.

**Expected.** The DS-plan template scaffolds headed placeholder sections aligned
to `plan_contract.required_outputs`, so every plan is structurally complete
before a human fills it.

**Impact.** Plan completeness depends on the agent remembering the skill prose
rather than the artifact embodying the method's own declared contract. Plans
will drift in shape across journeys and agents. The runtime already *knows* the
required outputs — the template should reflect them.

**Suggested fix.**
- Generate the plan template from `plan_contract.required_outputs`: emit a
  section header + one-line guidance per required output (Scope, Non-Goals,
  Acceptance Behavior, Validation Route, Implementation Contract / E2E decision,
  Approval Question).
- On `approve-delivery-story-plan`, validate the required sections are non-empty
  and warn (or soft-block) if a plan is being approved with empty contract
  sections.
- Apply the same alignment to the User/Technical Story plan template.

---

## AF-004 — Scope-confirmation checkpoint collapses into plan materialization

**Severity:** Minor (cadence integrity) **Status:** Open **Likely owner:** CV20.DS5 + cadence resolution

**Context.** `set-flow-unit delivery_story` then `plan-delivery-story`, under
`checkpoint` cadence.

**Observed.** A single `plan-delivery-story` invocation emitted **both**
`DELIVERY_STORY_SCOPE_CONFIRMATION` — "Before I create the DS Plan, correct or
add anything: 1. Is this the right scope?" — **and**
`DELIVERY_STORY_PLAN_CHECKPOINT` with `plan.md` already written. The confirmation
posed a pre-plan question after the plan already existed.

**Expected.** Either scope confirmation is a real stop *before* artifacts are
written, or it is not phrased as a pre-plan gate.

**Impact.** The surface implies a gate that did not gate. Under `checkpoint` /
`stepwise` cadence a scope stop is arguably owed before materialization. As-is
it weakens the meaning of a checkpoint.

**Suggested fix.**
- Split scope confirmation into its own step (`confirm-scope`, or emit it on
  `set-flow-unit`) that must be acknowledged before `plan-delivery-story` writes
  artifacts.
- Make it cadence-aware: a real stop under `stepwise`/`checkpoint`; a
  non-blocking "scope recorded" note under `accelerated`/`autonomous`.
- If it is intentionally non-gating, reword it to remove the question so it does
  not read as a gate.

---

## AF-005 — Self-nested roadmap tree; child indistinguishable from parent

**Severity:** Minor **Status:** ✅ Fixed (CV20.DS13, `f954417`) **Likely owner:** CV20.DS5 (expansion) — largely resolved by AF-001

**Resolution.** Closed with AF-001: DS13.TS3 renders children from the candidate
table with their own namespaced codes/titles, so a Delivery Story no longer nests
an identically-coded child under itself.

**Context.** `DELIVERY_STORY_READY` surface after pulling DS-31.

**Observed.**

```text
Where are we in the roadmap?
🟪[DS-31] Migration Foundation
  └─ 🟦[DS-31] Migration Foundation
```

The Delivery Story is nested under itself with an identical code, and the
recommended child (`US1`) reused the parent's title.

**Expected.** Parent DS with distinctly coded and titled children, e.g.
`DS-31 └─ DS-31.TS-1 …`.

**Impact.** The hierarchy is confusing; parent and child are visually
indistinguishable.

**Suggested fix.**
- Render children with their own namespaced codes and titles (`DS-31.US1`,
  `DS-31.TS-n`).
- This mostly resolves once Expand ingests the candidate-story table (AF-001),
  which supplies real child codes/titles.

---

## AF-006 — `approve-delivery-story-plan` reports an update that did not happen

**Severity:** Minor (surface trust) **Status:** Open **Likely owner:** CV20.DS4.TS3 (deterministic surface delivery) — same family as AF-002

**Context.** `build approve-delivery-story-plan` for DS-31.

**Observed.** The `ARTIFACTS_MATERIALIZED` surface listed:

```text
✎ updated story index
docs/project/roadmap/ds-31-migration-foundation/index.md
```

but `git status` immediately afterward showed `index.md` unmodified — no diff. (The same command's `test-guide.md` line said "updated" for a file that already existed only because I had authored it by hand.)

**Expected.** A file is reported as `updated` only when its content actually changed on disk; otherwise report `unchanged` or omit it.

**Impact.** Same class as AF-002: the surface claims a write that did not occur. A Navigator trusting the surface believes the story index was refreshed when it was not. Because the surface is the runtime's trust boundary, false "updated" lines are as corrosive as false "created" lines.

**Suggested fix.** Fold into the AF-002 fix: drive `ARTIFACTS_MATERIALIZED` from the file-writer's real result with a content-diff check — emit `created` only on new files, `updated` only on a real content change, and `unchanged` (or nothing) otherwise. One regression test covering create / update / no-op covers both AF-002 and AF-006.

## AF-007 — Next-pull recommendation points at a legacy item, ignoring the active sequence

**Severity:** Minor **Status:** ✅ Fixed (CV20.DS13, `f954417`) **Likely owner:** CV20.DS4/DS5 (roadmap awareness / pull-candidate logic)

**Resolution.** DS13.TS1 excludes `docs/project/roadmap/legacy/**` from
pull-candidate scanning and reads the DS-grammar backlog, so the next pull is the
next planned `DS-NN`, never an archived legacy CV.

**Context.** After closing DS-31 (`done-delivery-story`), the `PROJECT_POSITION` surface recommended the next pull.

**Observed.**

```text
What looks next?
🟶[CV5] Learning Loop — recommended next pull
Available path
- CV5 — Learning Loop [cv] Planned
  (docs/project/roadmap/legacy/cv5-learning-loop/index.md)
```

The recommended next pull was **CV5 — Learning Loop**, a legacy imported CV under `roadmap/legacy/`, rather than **DS-32** (the next migration Delivery Story in the active Chapter 7 sequence, DS-31 → DS-38 with explicit dependencies).

**Expected.** The recommendation should surface the next unblocked item in the active roadmap sequence (DS-32), and should never point at an archived `legacy/` item.

**Impact.** A Navigator trusting the recommendation would pull the wrong thing — an archived CV instead of the live migration story. The runtime does not read the hand-authored chapter structure or DS dependency ordering; it appears to scan roadmap docs and pick a `Planned` item without excluding the legacy archive.

**Suggested fix.**
- Exclude `docs/project/roadmap/legacy/**` from pull-candidate scanning immediately (archived work is never a next pull).
- Teach the roadmap reader the active method's structure: chapters, DS codes, and the `Dependencies` sections in each DS index, so the recommendation is the next *unblocked* item in sequence.
- When sequencing is ambiguous, recommend nothing rather than an arbitrary `Planned` item.

## Harvest Workflow

When fixing Ariad:

1. Group open findings by CV20 owner (DS4/DS5/cadence/templates).
2. Turn each into a Change Request on the Ariad Refinement Workbench, or a child
   story under the owning CV20 Delivery Story.
3. Add a regression test that encodes the *expected* behavior (several findings
   are cheap to test: surface-vs-disk for AF-002, table-ingestion for AF-001,
   required-sections for AF-003).
4. Mark the finding `Fixed (CV20.DSx.yy)` here with the commit, keeping the
   ledger as the audit trail from dogfooding to fix.

## New Finding Template

```text
## AF-00N — <short title>

**Severity:** …  **Status:** Open  **Likely owner:** CV20.DSx

**Context.** <command / state when observed>
**Observed.** <verbatim evidence where possible>
**Expected.** <what should have happened>
**Impact.** <why it matters>
**Suggested fix.** <concrete change + where>
```
