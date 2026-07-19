[< CV20](../index.md)

# CV20.DS14 — Change Request Terminal Verbs (park / reject / promote)

**Status:** 🟡 Planned — surfaced from a `kia-desktop` session handoff; not yet
prioritized. Design settled at the plan level (QA-authored); `plan.md` /
`test-guide.md` are authored when this DS is pulled.
**Delivery Story of:** CV20 — Builder Mode Evolution (follow-up to
[CV20.DS6](../cv20-ds6-refinement-workbench-flow/index.md))
**Design input:** [handoff.md](handoff.md)

---

## User-visible outcome

A Navigator can **park**, **reject**, or **promote** a Change Request through the
Builder CLI — the three terminal states the domain already models but the runtime
cannot reach — so a Refinement Story holding such a CR can be closed cleanly
instead of forcing an off-contract storage write to the production DB.

## Problem (verified in code)

The CR lifecycle models four terminal states (`done, parked, rejected,
promoted`; `builder_workbench.py:12`) and the RS-close gate
(`_require_closable_change_requests`, `workbench.py:440`) and the `mm-build` skill
both depend on park/reject/promote. But the CLI wires only `done`
(`cli/build.py`), and `discard` **deletes** a captured CR (`workbench.py:127`) — no
substitute for a deliberate defer or a decided *no*. This was hit live: CR023
(`a6be8152`, journey `kia-desktop`) had to be parked via a raw storage write.

## Two gotchas found during planning (beyond the handoff)

1. **The flow-event surface enumerates events.** `render_refinement_flow_event_surface`
   has hardcoded icon/label/description dicts (`workbench_surfaces.py:149–205`) —
   the three new events need entries there; it is not generic.
2. **`_flow_event` mis-flags terminal CRs as active.** It sets
   `active_change_request_id = cr.id if cr.status != "done"` (`workbench.py:527`),
   so `parked/rejected/promoted` would surface the just-closed CR as *active*. The
   check must broaden to the full terminal set — a latent bug the new verbs expose.

## Scope

- **Service** (`workbench.py`): `park_/reject_/promote_change_request`, mirroring
  `complete_change_request` (`:268`) — validate journey + legal source state, write
  the terminal status with `outcome_notes`, **clear the cursor iff this CR is the
  active one**, return a `RefinementFlowEvent`.
- **Fix `_flow_event`** terminal check (`!= "done"` → full terminal set).
- **Surfaces**: `CR PARKED / REJECTED / PROMOTED` entries.
- **CLI** (`build.py`): `park/reject/promote` subparsers + dispatch, emitting the
  verbatim `REFINEMENT_FLOW_EVENT`.
- **RS park** (`refinement-story park`) — symmetric gap; the droppable scope lever.
- **Skill + REFERENCE**: `mm-build/SKILL.md` must name real commands; document the verbs.
- **Prod CR023 verification** (read-only, not a migration).

## Settled decisions (recommendations at plan time)

| ID | Decision |
|----|----------|
| D1 | `promote` is **minimal** — records a `--target` pointer + terminal state; does **not** mutate the roadmap (stays within the "not an autonomous PM" boundary). |
| D2 | `reject` keeps the record + reason (terminal); `discard` stays delete-accidental-capture. `discard` not renamed. |
| D3 | `park` requires `--reason` **and** `--revisit-trigger` (deferred-debt discipline, per DS8). |
| D4 | park/reject/promote legal from **any non-terminal** state; illegal from terminal → clear error. Cursor cleared **iff** the CR is the active one. |
| D5 | CR023 backfill: **verify** the row matches the verb's output; do not migrate/re-emit. |
| D-RS | Include `refinement-story park` (symmetric); first to cut if tightening scope. |

## Acceptance criteria (summary)

- Each verb sets its terminal status + notes, clears the cursor iff active, and
  emits a verbatim `REFINEMENT_FLOW_EVENT`.
- `reject` **keeps** the record (contrast: `discard` deletes).
- `promote` records `--target` and leaves the roadmap untouched.
- Any verb on a terminal CR errors clearly with no state change.
- Parking a **non-active** CR leaves the cursor untouched (the CR023 shape).
- An RS whose CRs are all terminal (incl. parked/rejected/promoted) proceeds
  `review → coherence → close`.
- The surface shows the terminal state, not "active" (the `_flow_event` fix).
- Skill and REFERENCE reference only real verbs.

## Verification

TDD unit tests per verb (valid + each invalid source + cursor-clear-when-active +
cursor-untouched-when-not + surface emission); an RS-close integration with a
parked CR; the `_flow_event` terminal-fix regression; the CR023 prod check
(manual, read-only). CI green. No eval (no LLM path).

## See also

- [handoff.md](handoff.md) — the original design input
- [CV20.DS6 — Refinement Workbench And Flow](../cv20-ds6-refinement-workbench-flow/index.md)
