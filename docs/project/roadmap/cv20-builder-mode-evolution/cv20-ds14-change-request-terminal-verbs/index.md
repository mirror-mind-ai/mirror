[< CV20](../index.md)

# CV20.DS14 — Change Request Terminal Verbs (park / reject / promote)

**Status:** 🟡 Planned — plan authored and revised after a six-persona review
(quality-assurance, database-architect, security-engineer, ai-engineer,
devops-engineer, prompt-engineer). Pending Navigator approval before implementation.
**Delivery Story of:** CV20 — Builder Mode Evolution (follow-up to
[CV20.DS6](../cv20-ds6-refinement-workbench-flow/index.md))
**Design input:** [handoff.md](handoff.md) · **Plan:** [plan.md](plan.md) · **Tests:** [test-guide.md](test-guide.md)

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
   `active_change_request_id = cr.id if cr.status != "done"` (`workbench.py:522`),
   so `parked/rejected/promoted` would surface the just-closed CR as *active*. The
   check must broaden to the full terminal set — a latent bug the new verbs expose.

## Scope

- **Storage** (`builder_workbench.py`): extract `TERMINAL_CHANGE_REQUEST_STATUSES`
  (N4) — no migration (the status `CHECK` already permits all four).
- **Service** (`workbench.py`): `park_/reject_/promote_change_request`, mirroring
  `complete_change_request` — validate CR+RS journey and legal source state (N2),
  write the terminal status with **prepend-preserved** `outcome_notes` (ON) and
  `completed_at` left NULL (N1), **clear the cursor iff this CR is the active one**,
  return a `RefinementFlowEvent`. Reject empty `--reason`/`--revisit-trigger`/`--target`
  (QA-2).
- **Fix `_flow_event`** terminal check (`!= "done"` → full terminal set) via N4.
- **Surfaces**: `CR PARKED / REJECTED / PROMOTED` entries; **progress surface**
  accounts for terminal CRs as resolved (QA-1); **marker fence** on rendered CR
  free-text (SEC); promote body must not overclaim a roadmap move.
- **CLI** (`build.py`): `park/reject/promote` subparsers + dispatch through the
  existing clean-error path, plus the next-CR recommendation (N5).
- **RS park** (`refinement-story park`) — symmetric gap; the droppable scope lever (D-RS).
- **Skill + REFERENCE**: `mm-build/SKILL.md` names real commands + a
  reject/discard/park/promote disambiguation and a "never write storage directly"
  guardrail; `REFERENCE.md` documents the verbs.
- **CR023 verification** — backup-first, read-only (OPS); not a migration.

## Settled decisions (recommendations at plan time)

| ID | Decision |
|----|----------|
| D1 | `promote` is **minimal** — records a `--target` pointer + terminal state; does **not** mutate the roadmap (stays within the "not an autonomous PM" boundary). |
| D2 | `reject` keeps the record + reason (terminal); `discard` stays delete-accidental-capture. `discard` not renamed. |
| D3 | `park` requires `--reason` **and** `--revisit-trigger` (deferred-debt discipline, per DS8). |
| D4 | park/reject/promote legal from **any non-terminal** state; illegal from terminal → clear error. Cursor cleared **iff** the CR is the active one. |
| D5 | CR023 backfill: **verify** the row matches the verb's output; do not migrate/re-emit. |
| D-RS | Include `refinement-story park` (symmetric); first to cut if tightening scope. |
| N1 | `completed_at` stays **NULL** for park/reject/promote; `status ∈ TERMINAL_SET` is the sole terminal authority. |
| N2 | Verbs act on **any CR assigned to an RS in the journey** (need not be active); guard asserts both CR and RS journey. Unassigned CRs use `discard`. |
| ON | `outcome_notes` is **prepend-preserve** on terminal transitions (does not clobber a validated CR's evidence). |
| SEC | Fence Ariad markers (`<<<ARIAD`/`<<<END`/`>>>`) in CR free-text rendered to surfaces. |
| QA-1 | The progress surface counts the full terminal set as resolved — never "remaining" while saying "no actionable CRs." |
| + | N3–N5, QA-2 (empty-text validation), AI (routing probe + fast-follow eval), OPS (backup-first CR023), PAR (Pi/REFERENCE now; Claude/Codex parity follow-up) — see [plan.md](plan.md) for the authoritative decision log. |

## Acceptance criteria (summary)

- Each verb sets its terminal status + prepend-preserved notes (ON), clears the
  cursor iff active, and emits a verbatim `REFINEMENT_FLOW_EVENT`.
- `park` leaves `completed_at=NULL` (N1); `reject` **keeps** the record (contrast:
  `discard` deletes); `promote` records `--target` and leaves the roadmap untouched.
- Empty/whitespace `--reason`/`--revisit-trigger`/`--target` → clear error (QA-2).
- Any verb on a terminal CR, a cross-journey CR, or an unassigned CR errors clearly
  with no state change.
- Parking a **non-active** or cross-RS CR leaves the cursor untouched (the CR023 shape).
- An RS whose CRs are all terminal (incl. parked/rejected/promoted) proceeds
  `review → coherence → close`.
- The `_flow_event` fix reports the terminal state, not "active"; the progress
  surface shows terminal CRs as resolved (QA-1).
- A forged Ariad marker in `--reason` is neutralized in the rendered surface (SEC).
- Skill (with disambiguation + guardrail) and `REFERENCE.md` reference only real verbs.

## Verification

TDD unit tests per verb (valid + each invalid source + empty-text + cross-journey +
unassigned + cursor-clear-when-active + cursor-untouched cross-RS + surface
emission + marker fence); the progress-surface terminal accounting; an RS-close
integration with parked/rejected/promoted CRs; the `_flow_event` terminal-fix
regression; the CR023 backup-first check (manual, read-only). CI green. No eval
(no LLM path). Full matrix in [test-guide.md](test-guide.md).

## See also

- [plan.md](plan.md) — authoritative revised plan and decision log
- [test-guide.md](test-guide.md) — transition matrix, routing probe, CR023 runbook
- [handoff.md](handoff.md) — the original design input
- [CV20.DS6 — Refinement Workbench And Flow](../cv20-ds6-refinement-workbench-flow/index.md)
