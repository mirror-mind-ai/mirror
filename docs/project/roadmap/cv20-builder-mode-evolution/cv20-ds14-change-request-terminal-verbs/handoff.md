# Handoff — Ariad Builder: missing CR terminal-state verbs (park / reject / promote)

**Date:** 2026-07-17
**Author:** Builder Mode (engineer persona), during a `kia-desktop` Refinement Work session
**Target:** a dedicated Mirror Mind fix session (this repo — `mirror-dev`, clone role `dev`)
**Type:** runtime gap / bug — CLI surface incomplete vs. the domain model
**Paths below** are relative to the Mirror Mind repo root (`src/memory/...`, `.pi/skills/...`).

---

## TL;DR

The Ariad Builder **Change Request (CR)** lifecycle models four terminal states —
`done`, `parked`, `rejected`, `promoted` — and the RS-close logic *and* the
`mm-build` skill both depend on being able to **park / reject / promote** a CR.
But the CLI only wires a verb for `done`. There is **no
`change-request park | reject | promote`**. `discard` is not a substitute — it
*deletes* a captured CR.

**Consequence:** a Navigator who needs to park/reject/promote a CR has no supported
path, and a Refinement Story (RS) that contains such CRs **cannot be cleanly closed
through the CLI**. The same gap exists for RS `parked`.

This was hit live: I had to park a CR via a **direct storage write** to the
production DB because no verb exists (details in *Reproduction* below).

---

## The gap: domain model vs. CLI surface

### The domain models four terminal CR states

```python
# src/memory/storage/builder_workbench.py:12
CHANGE_REQUEST_STATUSES = frozenset({
    "captured", "planned", "active", "implemented", "validated",
    "done", "parked", "rejected", "promoted",
})
# :11  REFINEMENT_STORY_STATUSES = {"draft", "open", "active", "closed", "parked"}
```

### The close-logic treats `{done, parked, rejected, promoted}` as terminal

```python
# src/memory/builder/workbench.py
#   _require_closable_change_requests(...)          ~:438
#   (blocks RS close while any CR is not in the terminal set)   ~:363
#   recommend_next_change_request(...) skips terminal CRs        ~:440
cr.status not in {"done", "parked", "rejected", "promoted"}
```

### The skill explicitly instructs park / reject / promote

`.pi/skills/mm-build/SKILL.md` (Refinement flow section):

> "Do not close an RS while any attached CR remains unfinished; **finish, park,
> reject, or promote each CR first**, then run RS review, coherence, and close in
> order."

### …but the CLI wires only `done`

`src/memory/cli/build.py` — the `change-request` subparser wires exactly:

| Verb | Where (approx.) | Service fn (`src/memory/builder/workbench.py`) | Effect |
|------|-----------------|-----------------------------------------------|--------|
| `capture` | subparser ~:2457 | `capture_change_request` :72 | create |
| `attach` | ~:2478 | `attach_change_request_to_story` :95 | link to RS |
| `discard` | ~:2483 | `discard_change_request` :105 | **DELETE** (captured, non-active only) |
| `select` | loop ~:2487 | `select_change_request` :160 | captured → active |
| `confirm` | loop ~:2487 | `confirm_change_request` :176 | active → (confirmed) |
| `plan` | ~:2495 | `plan_change_request` :191 | record plan |
| `mark-implemented` | ~:2500 | `mark_change_request_implemented` :207 | → implemented |
| `validate` | ~:2508 | `validate_change_request` :231 | → validated (`--close` → done) |
| `done` | ~:2520 | `complete_change_request` :268 | → **done** |

Dispatch: `cmd_change_request_flow` (`cli/build.py:1740`), routed at
`cli/build.py:~2733`. **There is no `park`, `reject`, or `promote`.**

The **only** primitive that can set a terminal state generally is the storage
method — with no service wrapper, no cursor handling, and no surface:

```python
# src/memory/storage/builder_workbench.py:255
Store.update_change_request_status(id, status, *, outcome_notes=None, completed_at=None)
```

### RS has the same hole

`refinement-story` wires only `create / overview / pull / review / coherence /
close` (`cli/build.py:~2527`). `REFINEMENT_STORY_STATUSES` includes `parked`, but
there is no `refinement-story park`.

---

## Why `discard` is not the answer

`discard_change_request` (`workbench.py:105`):
- only accepts a **`captured`** CR,
- refuses the **active** CR,
- **`store.delete_change_request(cr.id)`** — removes the record entirely.

That's for an *accidental* capture. A deliberate defer (`park`) or a decided
*no*  (`reject`) must **keep the record** with a rationale so the story stays
auditable. Deleting loses the decision history.

---

## Reproduction (the live instance that surfaced this)

In a `kia-desktop` session, RS003 ("Security hardening (pre-Febraban)") had
**CR023** (`SE-10b (token): Mint the Kia Backend session token Rust-side for
upload_file`) that the Navigator chose to **park** as a deliberate build-1 defer.

No verb existed, so it was set via the storage API against the **production** DB
(`~/.mirror-minds/vinicius/memory.db`):

```python
mem.store.update_change_request_status(
    "a6be8152",            # CR023
    "parked",
    outcome_notes="<reason + revisit trigger + mechanism caveat>",
)
```

Guards were checked by hand (right journey, still `captured`, **not** the cursor's
active CR, so no cursor update was needed). This produced **valid data** but:
- **bypassed the workbench service** (no validation of legal source state),
- **emitted no `REFINEMENT_FLOW_EVENT` surface** (the normal verbs do),
- would have **left a dangling cursor** if the CR *had* been active.

> **Note for the fix session:** this out-of-band `parked` row exists in prod data
> (journey `kia-desktop`, CR023 = `a6be8152`). A proper `park` verb should produce
> **identical** state (status=`parked`, `outcome_notes` set, `completed_at` null,
> cursor untouched). Verify/normalize it once the verb lands.

---

## Impact

1. **RS close is CLI-unreachable** whenever an RS holds a CR that should be
   parked/rejected/promoted — only `done` is expressible. (RS003 in prod is a live
   example: its remaining CRs are decisions/blocked, several needing `park`.)
2. **The skill promises operations the runtime can't perform**, which pushes the
   agent toward off-contract storage writes (exactly what happened) — inconsistent
   with the Ariad "every transition emits a verbatim surface" contract.
3. **Terminal-but-non-done CRs can only be created out-of-band**, risking cursor
   drift (no active-CR clear) and missing audit surfaces.

---

## Proposed fix (design sketch)

Add three CR terminal-transition verbs that mirror the existing flow pattern
(model → service → CLI → surface), TDD-first per repo convention.

### 1. Service functions — `src/memory/builder/workbench.py`
Analogous to `complete_change_request` (:268). Each must: validate existence +
journey + **legal source status**; write via `update_change_request_status(...,
outcome_notes=...)`; **clear the cursor** `active_change_request_id` if this CR is
active (set `last_refinement_event=change_request_{parked,rejected,promoted}`);
return a `RefinementFlowEvent` and emit its surface.

- `park_change_request(store, *, journey, change_request_id, reason, revisit_trigger)`
  → `parked`. Require **reason + revisit_trigger** (park = deferred debt; mirror
  the Ariad "deferred requires reason + trigger" discipline). Legal from any
  non-terminal state.
- `reject_change_request(store, *, journey, change_request_id, reason)`
  → `rejected`. Require **reason**. Distinct from `discard`: **keeps** the record.
- `promote_change_request(store, *, journey, change_request_id, target, notes)`
  → `promoted`. Require a **promotion target** (the CR outgrew Refinement Work and
  becomes Delivery Work — e.g., a roadmap Delivery Story / new RS). See open
  question on semantics.

### 2. CLI wiring — `src/memory/cli/build.py`
Add `park` / `reject` / `promote` subparsers to `change_request_sub` (near :2483)
with the required args; extend `cmd_change_request_flow` (:1740) or add handlers;
add dispatch (near :2733).

### 3. Surfaces — `src/memory/builder/workbench_surfaces.py`
Render `CR PARKED / REJECTED / PROMOTED` events in the same compact
`<<<ARIAD:REFINEMENT_FLOW_EVENT>>> … <<<END:…>>>` marker format used by
`SELECTED` / `CONFIRMED` / `VALIDATED` / `DONE`.

### 4. RS parity (recommended)
Add `refinement-story park` (`parked`) for the symmetric RS gap.

### 5. Skill + docs
- `.pi/skills/mm-build/SKILL.md`: the "finish, park, reject, or promote" clause
  must reference the **actual commands** (currently it references operations with
  no verb).
- `REFERENCE.md`: CLI reference for the new verbs.
- Any runtime-interface spec under `docs/product/specs/`.

---

## Acceptance criteria

- `uv run python -m memory build change-request park --journey <j> --change-request-id <id> --reason "…" --revisit-trigger "…"`
  sets `parked`, records the note, **clears the cursor if active**, and emits a
  verbatim `REFINEMENT_FLOW_EVENT`. Same for `reject` (`--reason`) and `promote`
  (`--target` / `--notes`).
- **Illegal transitions** fail with a clear error (e.g. cannot park a `done` CR).
- An RS whose CRs are all terminal (including `parked` / `rejected` / `promoted`)
  can proceed `review → coherence → close`.
- **TDD**: unit tests per transition (valid + invalid source state, cursor-clear
  path, surface emission); CI green before done.
- Skill + `REFERENCE.md` updated; **no CLI text references an operation the runtime
  lacks**.

---

## Open questions / decisions for the fix session

1. **`promote` semantics.** Does `promoted` mean *promoted to a roadmap Delivery
   Story* (create/link a roadmap item) or just *moved out of the RS*? Define the
   `--target` contract and whether it mutates the roadmap.
2. **`reject` vs `discard`.** Confirm: `reject` = keep-with-rationale (terminal);
   `discard` = delete an accidental capture. Should `discard` be tightened or
   renamed to reduce confusion?
3. **`park` required fields.** Require `--revisit-trigger` (recommended — matches
   deferred-debt discipline) or optional?
4. **Legal source states per verb.** e.g. can you `promote` a `captured` CR, or
   must it be at least `confirmed`? Can you `park` an `active`/`implemented` CR
   (and should that also reset the cursor)?
5. **Backfill.** The CR023 prod `park` was done via storage. Verify it matches the
   new verb's output and decide whether to normalize/re-emit.

---

## Appendix — exact references

| Ref | Path |
|-----|------|
| CR status enum | `src/memory/storage/builder_workbench.py:12` |
| RS status enum | `src/memory/storage/builder_workbench.py:11` |
| Status write primitive | `src/memory/storage/builder_workbench.py:255` (`update_change_request_status`) |
| Close-gate / terminal set | `src/memory/builder/workbench.py:~363`, `~438` (`_require_closable_change_requests`), `~440` (`recommend_next_change_request`) |
| `discard` (deletes) | `src/memory/builder/workbench.py:105` |
| `done` service fn | `src/memory/builder/workbench.py:268` (`complete_change_request`) |
| CR flow dispatch | `src/memory/cli/build.py:1740` (`cmd_change_request_flow`) |
| CR subparsers | `src/memory/cli/build.py:~2457`–`~2525` |
| CR / RS command dispatch | `src/memory/cli/build.py:~2703` (RS), `~2733` (CR) |
| Skill clause | `.pi/skills/mm-build/SKILL.md` (Refinement flow: "finish, park, reject, or promote") |
| Live instance | journey `kia-desktop`, CR023 = `a6be8152`, parked via storage 2026-07-17 |
