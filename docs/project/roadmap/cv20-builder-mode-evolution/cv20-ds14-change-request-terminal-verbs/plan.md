[< Story](index.md)

# Plan — CV20.DS14 Change Request Terminal Verbs (park / reject / promote)

**Status:** 🟡 Planned — plan authored, pending Navigator approval before implementation.
**Design input:** [handoff.md](handoff.md) · **Story card:** [index.md](index.md)
**Reviewed by:** quality-assurance, database-architect, security-engineer,
ai-engineer, devops-engineer, prompt-engineer (findings folded below).

---

## Objective

Give the Navigator supported Builder CLI verbs to move a Change Request (CR) into
its three terminal states the domain already models but the runtime cannot reach —
`parked`, `rejected`, `promoted` — plus the symmetric `refinement-story park`, so a
Refinement Story (RS) holding such a CR closes cleanly instead of forcing an
off-contract storage write to the production DB (the live CR023 incident).

This is a runtime-gap fix, not a new capability: the terminal set is already
authoritative in the RS-close gate and the next-CR recommender. The verbs, one
latent `_flow_event` bug, and the surfaces are the only missing pieces.

## CR terminal-state transition model

```text
captured → active → planned → implemented → validated → done
     └──────────────┴─────────┴────────────┴──────────→ parked | rejected | promoted
                                        (legal from ANY non-terminal state; D4)
```

`done, parked, rejected, promoted` are terminal. A verb applied to a terminal CR
is an error with no state change.

---

## Decisions (settled + revised after multi-persona review)

| ID | Decision | Source |
|----|----------|--------|
| D1 | `promote` is **minimal** — records a `--target` pointer + terminal state; does **not** mutate the roadmap. | index (settled) |
| D2 | `reject` keeps the record + reason (terminal); `discard` stays delete-accidental-capture. `discard` not renamed. | index (settled) |
| D3 | `park` requires `--reason` **and** `--revisit-trigger` (deferred-debt discipline). | index (settled) |
| D4 | park/reject/promote legal from **any non-terminal** state; terminal source → clear error; cursor cleared **iff** the CR is the active one. | index (settled) |
| D5 | CR023 backfill: **verify** the row matches the verb's output; do not migrate/re-emit. Park output must be `status=parked`, `completed_at=NULL`. | index (settled) |
| D-RS | Include `refinement-story park` (symmetric). **Scope lever:** first to cut if the DS must shrink. | index (settled) |
| **N1** | `completed_at` stays **NULL** for park/reject/promote (only `done` stamps it). `status ∈ TERMINAL_SET` is the **sole** terminal authority; `completed_at` means "done-specifically" and is documented as such. | ai-engineer seam + database-architect |
| **N2** | Verbs operate on **any CR assigned to an RS in the journey** — the CR need not be the active one, and its RS need not be the active RS. Guard asserts `cr.journey == journey` **and** `story.journey == journey`. Unassigned CRs are out (use `discard`). | engineer + security-engineer |
| **N3** | Terminal-exit events map to the `done_note` ribbon stage for v1 (minor cosmetic imprecision for early-stage parks is accepted). | engineer |
| **N4** | Extract `TERMINAL_CHANGE_REQUEST_STATUSES` in storage; reuse it in the close-gate, next-CR recommender, `_flow_event`, and the new guards — one authoritative definition, and the fix site for the `_flow_event` bug. | engineer + database-architect |
| **N5** | After a terminal verb, print the RS progress surface + next-CR recommendation (parity with `done`). | engineer |
| **ON** | `outcome_notes` on terminal transitions is **prepend-preserve**: the new terminal note is prepended and the prior lifecycle note kept, so parking a `validated` CR does not clobber its validation evidence. | database-architect |
| **SEC** | Fence Ariad marker tokens (`<<<ARIAD`, `<<<END`, `>>>`) in CR free-text rendered into surfaces; cover it with a malicious-input test. Precedent: CV9.E2.S29. | security-engineer |
| **QA-1** | The RS progress surface counts the **full terminal set** as resolved and never renders a terminal CR as "remaining" while also saying "no actionable CRs." | quality-assurance |
| **QA-2** | Reject empty/whitespace `--reason` / `--revisit-trigger` / `--target` (mirror `discard`'s guard). | quality-assurance |
| **AI** | Verb-routing safety = skill disambiguation + a "never write storage directly" guardrail in DS14, plus a **manual routing probe** in Navigator validation. The automated LLM verb-routing eval is **registered as a fast-follow**, not built inside DS14. | ai-engineer + prompt-engineer |
| **OPS** | CR023 reconciliation runs a **backup-first runbook**: `mm-backup` → read-only diff → decide → restore = rollback. | devops-engineer |
| **PAR** | DS14 updates the **Pi** skill + single-source `REFERENCE.md`. Refinement Work is Pi-only in the skills today; the Claude/Codex Refinement-skill parity gap is **registered as a follow-up**, not silently deferred. | devops-engineer + prompt-engineer |

---

## Product behavior (new commands)

```bash
uv run python -m memory build change-request park \
  --journey <slug> --change-request-id <cr-id> \
  --reason "<why deferred>" --revisit-trigger "<what reopens it>"

uv run python -m memory build change-request reject \
  --journey <slug> --change-request-id <cr-id> --reason "<decided no>"

uv run python -m memory build change-request promote \
  --journey <slug> --change-request-id <cr-id> \
  --target "<delivery target, e.g. DS-xx / new RS>" [--notes "<note>"]

# scope lever (D-RS)
uv run python -m memory build refinement-story park \
  --journey <slug> --refinement-story-id <rs-id> --reason "<why>" --revisit-trigger "<trigger>"
```

Each command renders the verbatim `<<<ARIAD:REFINEMENT_FLOW_EVENT>>>` surface, then
(N5) the RS progress + next-CR recommendation.

---

## Design & implementation scope

Mirror the existing `complete_change_request` vertical slice (model → service → CLI
→ surface), TDD-first.

### 1. Storage — `src/memory/storage/builder_workbench.py`
- Add `TERMINAL_CHANGE_REQUEST_STATUSES = frozenset({"done","parked","rejected","promoted"})` next to `CHANGE_REQUEST_STATUSES` (N4). No schema/migration — the status `CHECK` (`schema.py:109`) already permits all four.

### 2. Service — `src/memory/builder/workbench.py`
- `park_change_request(store, *, journey, change_request_id, reason, revisit_trigger)` → `parked`.
- `reject_change_request(store, *, journey, change_request_id, reason)` → `rejected`.
- `promote_change_request(store, *, journey, change_request_id, target, notes=None)` → `promoted`.
- New guard `_require_terminable_cr(...)` (N2): CR exists; `cr.journey == journey`; CR is assigned (`refinement_story_id is not None`, else a clear "discard an unassigned capture" error); story exists and `story.journey == journey`; `cr.status not in TERMINAL_CHANGE_REQUEST_STATUSES` (else terminal-source error).
- `_require_text(value, field)` (QA-2): strip + reject empty.
- `_terminal_detail(new_note, existing_notes)` (ON): prepend the new note, preserve the prior (`"<new>\nPrior note: <existing>"`).
- Write via `update_change_request_status(cr.id, <terminal>, outcome_notes=detail)` — **omit `completed_at`** so it stays NULL (N1). Note: storage uses `COALESCE(?, outcome_notes)`, so the composed `detail` overwrites — hence prepend-preserve is done in the service before the call.
- `_clear_active_cr_if_current(...)`: read the cursor; **only if** `cursor.active_change_request_id == cr.id`, rewrite it with `active_change_request_id=None` and `last_refinement_event=change_request_{parked,rejected,promoted}`; otherwise leave the cursor untouched (the CR023 non-active shape).
- **Fix `_flow_event`** (N4): `active_change_request_id = cr.id if cr is not None and cr.status not in TERMINAL_CHANGE_REQUEST_STATUSES else None`.
- Reuse the constant in `_require_closable_change_requests` and `recommend_next_change_request`.

### 3. Surfaces — `src/memory/builder/workbench_surfaces.py`
- Add the three events to `_event_icon` (🟫 / 🟥 / 🔷, reusing `_STATUS_MARKS`), `_human_event_phase` (Parked / Rejected / Promoted), `_event_body`, and `_change_request_ribbon_stage` → `done_note` (N3). Add matching entries to any other event→text dict a terminal event can reach (`_current_phase`, `_next_conversational_move`) so no `.get(...)` fallback misfires.
- **Promote body must not overclaim** (prompt-engineer): "promoted out of Refinement Work," never "moved to the roadmap."
- **Progress surface fix** (QA-1): `_progress_bar` / `_progress_icon` / `done_count` / legend account for the full terminal set as *resolved* (distinct marks: done vs parked/rejected/promoted). Invariant: `recommend_next_change_request(...) is None` ⇔ every CR is terminal ⇔ the surface shows all resolved and never a "remaining" mark.
- **Marker fence** (SEC): neutralize `<<<ARIAD` / `<<<END` / `>>>` in card content at the render boundary (covers `reason`/`notes`/`title`/`body`). The legit wrapper added by `wrap_ariad_surface` is unaffected.

### 4. CLI — `src/memory/cli/build.py`
- Add `park` / `reject` / `promote` subparsers under `change_request_sub` with the required args (park: reason + revisit-trigger; reject: reason; promote: target + optional notes).
- Add `park` (`refinement-story park`: reason + revisit-trigger) under `refinement_story_sub`.
- Extend the CR dispatch set to include the three verbs → `cmd_change_request_flow`; add `elif` branches routing through `_print_refinement_event` (inherits the existing `ValueError → clean exit(1)` path).
- Extend `_print_next_cr_recommendation` (N5) to fire on `change_request_{parked,rejected,promoted}` as well as `change_request_done`.

### 5. Skill + docs
- `.pi/skills/mm-build/SKILL.md`: add the real commands to the Refinement block; fix the line-385 clause to reference them; add a **reject-vs-discard-vs-park-vs-promote disambiguation with examples**; add the guardrail *"if a needed transition has no verb, stop and report — never write storage directly."*
- `REFERENCE.md`: add park/reject/promote (+ RS park) signatures.
- Check `docs/product/specs/` for any CR-verb enumeration to update.

### 6. CR023 reconciliation runbook (OPS) — manual, read-only
1. `uv run python -m memory backup` (or `mm-backup`) the production DB first.
2. Read-only diff: fetch CR023 (`a6be8152`, journey `kia-desktop`) and compare its row to what `park` now produces (`status=parked`, `outcome_notes` present, `completed_at=NULL`, cursor untouched).
3. If it matches → done (D5, no migration). If it diverges → decide with the Navigator; the backup is the rollback.

---

## Out of scope

- No roadmap mutation on `promote` (D1); no autonomous follow-on Delivery Story creation.
- No new column or migration; `completed_at` stays as-is (N1).
- No append-only CR note history (the `outcome_notes` single-column model stays; ON only prepends). A durable per-CR note trail is CV20.DS12 territory.
- No automated LLM verb-routing eval in DS14 (AI: registered as a fast-follow).
- No Claude/Codex Refinement-skill parity work (PAR: registered as a follow-up).
- No redesign of the CR-cycle ribbon for terminal exits beyond the `done_note` mapping (N3).

## Acceptance criteria

- Each verb sets its terminal status + prepend-preserved notes, clears the cursor **iff** the CR is active, leaves it untouched otherwise (incl. the cross-RS case), and emits a verbatim `REFINEMENT_FLOW_EVENT`.
- `park` leaves `completed_at=NULL`; `reject` keeps the record (contrast `discard` deletes); `promote` records `--target` and leaves the roadmap untouched.
- Empty/whitespace `--reason`/`--revisit-trigger`/`--target` → clear error, no write (QA-2).
- Any verb on a terminal CR, a cross-journey CR, or an unassigned CR → clear error, no state change.
- `_flow_event` reports `active_change_request_id=None` for a terminal CR (regression).
- An RS whose CRs are all terminal (incl. parked/rejected/promoted) proceeds `review → coherence → close`.
- The progress surface shows terminal CRs as resolved, consistent with "no actionable CRs" (QA-1).
- A forged marker in `--reason` is neutralized in the rendered surface (SEC).
- Skill + `REFERENCE.md` reference only real verbs, with the disambiguation + guardrail present.

## Validation plan

Automated:

```bash
uv run pytest tests/unit/memory/storage/test_builder_workbench_store.py \
  tests/unit/memory/builder/test_workbench.py \
  tests/unit/memory/builder/test_workbench_surfaces.py \
  tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/storage src/memory/builder src/memory/cli/build.py tests
uv run ruff format --check src/memory/storage src/memory/builder src/memory/cli/build.py tests
uv run mypy src/memory/storage src/memory/builder src/memory/cli/build.py
git diff --check
```

Navigator validation + manual checks: see [test-guide.md](test-guide.md) (transition
matrix, routing probe, CR023 backup-first reconciliation). No LLM path in the verbs →
no eval gate for the service; the routing probe is manual, with the automated eval as
a fast-follow.

## Approval gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- Implementation remains blocked until Navigator approval of this plan.
