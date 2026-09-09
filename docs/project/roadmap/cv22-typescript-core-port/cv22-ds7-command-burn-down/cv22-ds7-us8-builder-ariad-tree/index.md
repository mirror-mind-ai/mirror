[< Parent](../index.md)

# CV22.DS7.US8 — Builder/Ariad tree

**Status:** 🟡 Planned — authored, not pulled
**Type:** User Story
**Owner:** CV22.DS7 for the whole `build` command surface and the Builder runtime state it writes
**Depends on:** [CV22.DS7.US1](../cv22-ds7-us1-remaining-identity-journey-reads-writes/index.md)
for the journey/identity reads Builder loads; [CV22.DS7.TS1](../cv22-ds7-ts1-ops-utility-tail/index.md)
for the dated-zip `backup` that gates the cursor-state proof;
[CV22.DS7.US7](../cv22-ds7-us7-explorer-mode/index.md) for the named Python
`journey-projection refresh` seam every Builder write reuses

---

## Outcome

`python -m memory build` is answered by the TypeScript core with string-exact
`transport=verbatim` surface parity and behaviorally identical delivery-cursor
transitions, so a Navigator can run a complete Ariad lifecycle — adopt, load,
pull, prepare, plan, approve, implement, validate, review, coherence, done —
without observing which engine answered. `explore story promote`, held on Python
by name since US7, flips with it as a routing entry and nothing else.

## Why This Story Is Different

Every prior DS7 family was a **tool the Navigator points at something else**.
This one is the tool that **runs the story porting it**.

While US8 is in flight, `build plan-item`, `build approve-plan`,
`build validate-item`, `build review-item`, `build coherence-item`, and
`build done-item` are simultaneously (a) the commands under port and (b) the
mechanism executing US8's own lifecycle. Soul and Explorer had no such property:
a defect there produced a wrong surface. A defect here can corrupt the delivery
cursor — persisted runtime state, mid-story, for the story that is doing the
porting.

This is not a reason to defer the story. It is a reason to fix the operating
protocol before implementation starts, which is what the
[Self-Hosting Protocol](#self-hosting-protocol) below does.

**The original deferral rationale has expired.** DS7's risk-first ordering put
this story last because the Builder tree was a *moving oracle* — CV20/CV21 work
growing on `main` under a second author. Since the 2026-09-07 single-owner
decision that source is gone, and the repository confirms it: no commit on
`origin/main` ahead of this branch touches `src/memory/builder/` or
`src/memory/cli/build.py`, and the last Builder change on `main` was 2026-09-02.
What remains is size, and the answer to size is slicing, not sequencing.

## Surface Inventory

`src/memory/cli/build.py` declares **29 subcommands**, two of which are nested
groups, for **42 leaves**. The implementation is `src/memory/builder/` — 27
modules, 9,703 lines — plus the 3,156-line CLI, plus shared surface helpers
under `src/memory/surfaces/`.

| # | Group | Leaves | Count | Principal Python modules |
|---|-------|--------|------:|--------------------------|
| 1 | Method and adoption | `inspect-method`, `adopt`, `prepare-templates`, `sync-cursor` | 4 | `method_inspection.py`, `method_adoption.py`, `method_definition.py`, `ariad_method.py`, `template_generation.py` |
| 2 | Session and orientation | `load`, `pull-candidates`, `check-implementation` | 3 | `home_surface.py`, `resume_surface.py`, `resume_state.py`, `pull_candidates.py`, `roadmap_position.py`, `roadmap_grammar.py`, `story_paths.py` |
| 3 | Story lifecycle | `pull-item`, `prepare-item`, `plan-item`, `approve-plan`, `validate-item`, `review-item`, `coherence-item`, `done-item` | 8 | `lifecycle.py` (2,303 lines), `delivery_cursor.py`, `artifact_surfaces.py` |
| 4 | Delivery Story lifecycle | `plan-delivery-story`, `approve-delivery-story-plan`, `validate-delivery-story`, `review-delivery-story`, `coherence-delivery-story`, `done-delivery-story` | 6 | `delivery_story_plan.py`, `delivery_story_closure.py`, `delivery_story_roadmap_closure.py` |
| 5 | Cadence, flow, and authority | `set-cadence`, `set-flow-unit`, `release-intent`, `cancel-plan-preauthorization`, `cancel-delivery-story-plan-preauthorization` | 5 | `flow_unit.py`, `release_intent.py`, `plan_preauthorization.py`, `story_plan_preauthorization.py` |
| 6 | Continuation | `continue-lifecycle` | 1 | `lifecycle.py`, `lifecycle_ribbon.py` |
| 7 | Refinement Workbench (legacy SQLite) | `refinement-story create\|overview\|park\|pull`; `change-request attach\|capture\|discard\|done\|mark-implemented\|park\|plan\|promote\|reject\|resume\|validate` | 15 | `workbench.py`, `workbench_surfaces.py` |

Groups 1–6 are **27 leaves**. Group 7 is **15 leaves** and is the subject of the
first open decision below.

## Open Decisions For Plan Review

These are Navigator decisions, recorded here so the multi-persona Plan review
argues about them instead of discovering them. The single-owner rule applies:
they are taken at plan time and written down, because nobody else will confirm
them.

### D1 — Port or retire the SQLite Refinement Workbench (15 of 42 leaves)

CV20.DS6 delivered the SQLite Workbench. **CV20.DS12 (done) delivered the
document-first Workbench and made one project index the canonical RS/CR
authority.** `mm-build` routes accordingly: file-first when
`docs/project/refinement/index.md` exists, legacy SQLite only when it does not.
This project itself moved to the file-first authority — `docs/project/refinement/index.md`
is the record CR068 and CR071 live in.

So group 7 is 15 leaves of a **superseded** storage model, and porting it means
paying full parity cost for a legacy path. The options:

1. **Port at parity** — safest for journeys that never adopted the document-first
   Workbench; costs roughly a third of the story.
2. **Retire in DS10 with a documented cutoff**, as `migrate-legacy` and
   `memory-rehearse-migration` already are, leaving Python as the compatibility
   answer until deletion. Drops US8 from 42 to 27 leaves.
3. **Port a read-only subset** so existing SQLite rows stay inspectable, and
   retire the mutating verbs.

This decision must be made **before** slicing, because it changes the story's
size by a third. It is not a Driver decision.

### D2 — Cursor state authority during the transition

The delivery cursor is runtime state both engines can write. Unlike the Journey
projection (US7), there is no cross-process lock — the seam is the database, and
DS6 gave TypeScript custody of it. The Plan must state explicitly whether a
half-flipped `build` may interleave engine writes on one cursor within a single
lifecycle, or whether the gate is all-or-nothing like Soul's and Explorer's.
Recommendation carried into Plan review: **all-or-nothing**, for the same reason
Soul used it — a half-flipped lifecycle cannot be reviewed in a live session.

### D3 — Interactive and irreversible seams

`build` renders approval checkpoints that gate irreversible actions. The Plan
must name, per leaf, which refusals are load-bearing safety properties requiring
their own goldens: preauthorization receipt mismatch, Plan completeness checks,
`check-implementation` guard, Debt Review `pay_now` routing, and the authored
roadmap closure preflight in `done-delivery-story`.

## Seam Boundaries

Named explicitly so no plan can claim they were ambiguous.

| Boundary | US8 owns | US8 does not own |
|---|---|---|
| **Journey projection** | Calling the named Python `journey-projection refresh` seam from the **20 `request_projection_refresh` call sites** in `builder/` (`workbench.py` 6, `lifecycle.py` 5, `delivery_story_closure.py` 4, `delivery_story_plan.py` 2, `delivery_cursor.py` 2, `story_plan_preauthorization.py` 1), reusing US7's contract unchanged | Porting the publisher. Publication stays Python-owned until the `fcntl.flock` dual-writer window closes — TS5, and DS10 deletion |
| **DS8 live provider** | Nothing: `build` makes no LLM call | — |
| **DS9 MCP** | The CLI surface only | `python -m memory mcp` |
| **DS10 retirement** | Emptying the `build` command surface | Deleting Python, the `memory → mirror` rename, npm packaging |
| **CV20 feature work** | Re-homing whatever CV20 has landed at the oracle snapshot taken at Pull | Re-speccing Ariad. This is parity, not redesign |

## Self-Hosting Protocol

Blocking constraints for the Plan, derived from the property that this story
ports its own execution machinery:

1. **The executing session runs on Python.** US8's own Ariad lifecycle is driven
   with `MIRROR_TS_BUILD=0` set in the session executing the story, until
   Navigator validation. The story never depends on the code under test to record
   its own state.
2. **Back up before every cursor-writing experiment.** `backup` is on TS since
   TS1; the dated zip is the restore route if a cursor transition is corrupted
   mid-slice.
3. **The flip is the last plateau**, after every leaf is ported and graded — not
   incrementally per group.
4. **The revert must be exercised from a broken TS core**, not only from a
   working one. `MIRROR_TS_BUILD=0` has to reach Python when `ts/` fails to
   build, load, or throws at startup; otherwise the escape hatch is theoretical
   exactly when it is needed. This is a new check the earlier families never
   needed.
5. **Cursor parity is graded as a transition sequence**, not as an end state. Two
   engines can agree on the final row and disagree on every intermediate
   generation, receipt, and pending-confirmation value.

## Slice Sequence For Future Pull

Dependency-ordered, each slice a resumable plateau with a written handoff. Slice
count assumes D1 resolves to retire or defer group 7; add a slice if it resolves
to port.

1. **Read-only orientation** — `inspect-method`, `pull-candidates`, `load`
   (resume/home surfaces), `check-implementation`. Pure rendering plus cursor
   reads; establishes the surface-parity harness for `<<<ARIAD:...>>>` marked
   blocks. Highest surface volume, lowest write risk.
2. **Method and cursor writes** — `adopt`, `prepare-templates`, `sync-cursor`.
   First writes; first copy-backed cursor probe.
3. **Story lifecycle** — `pull-item` (including Expand and the candidate-table
   grammar), `prepare-item`, `plan-item`, `approve-plan`. Story-package artifact
   materialization, including the `if not path.exists()` preservation rule.
4. **Story closure** — `validate-item`, `review-item`, `coherence-item`,
   `done-item`, plus the reentry rules Coherence and Debt Review carry.
5. **Delivery Story lifecycle** — the six DS-level leaves and the authored
   roadmap closure preflight.
6. **Cadence and authority** — `set-cadence`, `set-flow-unit`, `release-intent`,
   both preauthorization cancels, `continue-lifecycle`. Security-sensitive:
   authority receipts are single-use, generation-bound, and must not be
   reconstructible.
7. **Flip** — routing entry, two-level allowlist (`build` has nested groups
   exactly like `explore`), the three `mm-build` skill copies, `explore story
   promote` released to TS, ledger update.

## Required Implementation Evidence

1. String-exact goldens for every `transport=verbatim` surface, including the
   `<<<ARIAD:...>>>` begin/end markers — a re-indent or rewrap is a failure.
2. Delivery-cursor transition goldens graded as **ordered sequences**, covering
   pending confirmations, generation bumps, and every refusal path.
3. Copy-backed write probes for cursor state, artifact materialization on a
   scratch project, and the preservation rule for authored `index.md`/`plan.md`.
4. A projection-seam assertion in the same shape US7 required: assert the
   **published file**, never a log line, because the delegation is best-effort
   and a broken seam is silent.
5. A full-lifecycle E2E smoke through the real front door on a disposable home —
   adopt → load → pull → prepare → plan → approve → validate → review →
   coherence → done — run with **no gate in the environment**, so it proves the
   shipped default.
6. Two-level allowlist tests refusing an unknown `build <sub>` and an unknown
   `build change-request <action>` separately.
7. Revert exercised from a deliberately broken TS core (protocol item 4).
8. Every ported Python oracle registered in `ts/parity/oracle-baseline.json`, and
   every generator in the CI determinism gate.
9. Front-door redaction check: `build` arguments carry plan text, review
   summaries, and validation evidence — none of it may reach `front-door.log`.

## Revert Contract

`MIRROR_TS_BUILD=0` returns the whole family to Python with no code change and
no data migration. The gate covers the family deliberately, per D2. Subcommands
are allowlisted **by name** at both levels, so a subcommand Python grows later
reaches Python instead of inheriting the route — the CR055 rule.

## Done Condition

- All in-scope leaves answer from TS ungated, with the flip checklist green and
  recorded in the [burn-down ledger](../burn-down-ledger.md).
- A complete Ariad lifecycle was executed end to end on TS and was
  indistinguishable from Python to the Navigator.
- Delivery-cursor transitions are byte-identical as ordered sequences, not only
  as end states.
- The revert reaches Python from a broken TS core.
- `explore story promote` is released to TS and US7's ledger row updated.
- D1, D2, and D3 are resolved and recorded near the roadmap.
- No Ariad semantics changed. Parity, not redesign.

## Out Of Scope

- Porting the Journey projection publisher (TS5, then DS10 deletion).
- Any live-provider work: `build` makes no model call.
- MCP (DS9), web process, Python deletion, rename, npm (DS10).
- Re-speccing the Ariad method DSL, adding lifecycle stages, or changing cadence
  semantics.
- New Builder features. Once TS takes custody, new Builder work lands in TS —
  but not inside this story.
