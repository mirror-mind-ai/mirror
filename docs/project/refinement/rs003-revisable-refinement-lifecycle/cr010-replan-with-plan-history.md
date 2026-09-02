[< RS003](index.md) · [Canonical status](../index.md#change-requests)

# CR010 — Re-plan A Reviewed Change Request Without Destroying Plan History

## Problem

Two defects in the Change Request lifecycle. The first blocks the Plan checkpoint from
doing the one job it exists for. The second means the naive fix for the first would
silently destroy data. They must be considered together.

**A. There is no re-plan transition.** Once a Change Request reaches `planned`, its plan is
frozen and unreachable.

In `src/memory/builder/workbench.py`:

```text
:169  select            -> _require_status(cr.status, {"captured"}, "select")
:185  confirm           -> _require_status(cr.status, {"active"}, "confirm")
:200  plan              -> _require_status(cr.status, {"active"}, "plan")
:221  mark_implemented  -> _require_status(cr.status, {"active", "planned"}, "mark implemented")
:246  validate          -> _require_status(cr.status, {"implemented"}, "validate")
:277  done              -> _require_status(cr.status, {"validated"}, "done")
```

`plan` accepts only `active`. `select` accepts only `captured`. So `planned` is a one-way
door: the only exits are forward to `implemented`, or sideways into the terminal verbs.

The in-codebase precedent already exists. `mark_implemented` at `:221` accepts a set of
prior statuses and branches on which one it received:

```python
_require_status(cr.status, {"active", "planned"}, "mark implemented")
if cr.status == "active":
    _require_confirmed_cr(store, journey, cr.id)
```

Allowing `plan` from `{"active", "planned"}` is the identical shape. This is not a new
pattern being invented; it is an existing pattern not applied consistently.

**B. There is no plan history.** The plan is not stored in a plan field. It is written to
`builder_change_requests.outcome_notes`, a single nullable `TEXT` column that later
transitions overwrite:

```text
:201  plan       -> outcome_notes = summary
:225  implement  -> outcome_notes = detail
:262  validate   -> outcome_notes = evidence
:279  done       -> outcome_notes = notes
```

There is no events table. The schema holds only `builder_change_requests`,
`builder_refinement_stories`, and `builder_refinement_cursors`, and
`builder_refinement_cursors.last_refinement_event` holds a single string — the last event,
not a log.

The codebase already recognises the clobbering and has patched around it three separate
times rather than fixing the storage model. `_terminal_detail` carries this docstring:

```text
``update_change_request_status`` overwrites ``outcome_notes`` on write, so a
terminal verb applied to, e.g., a ``validated`` CR would otherwise clobber
its validation evidence. Prepending preserves it (database-architect review).
```

`_implementation_detail` accepts an optional `plan` argument so a caller may re-supply the
plan and keep it alive one more hop, and `_validation_closure_detail` re-composes evidence
with the done note. Three ad-hoc composition helpers exist because one append-only history
does not. A model that requires callers to re-send prior state to avoid losing it is not a
model; it is a manual backup procedure.

Consequently, simply adding `"planned"` to the `plan` guard would let a re-plan overwrite
the prior plan with no trace — erasing the very artifact that justifies the amendment.
Defect A cannot be fixed correctly without addressing B.

## Expected Behavior

1. A `planned` Change Request can be re-planned in response to review, without deleting the
   record, mislabelling the decision, or capturing a duplicate.
2. Re-planning preserves the superseded plan. The reason for an amendment is legible only
   next to what it replaced.
3. A Change Request at any status can render its full history: what was planned (each
   version), what was implemented, what evidence was accepted, and how it closed.
   `outcome_notes` stops being a single slot with different meanings at different times.
4. The optional `plan` re-supply parameter on `mark_implemented` becomes unnecessary and is
   retired.
5. Existing rows survive the change. Whatever `outcome_notes` currently holds must remain
   readable; for closed Change Requests it is the only record that exists.

## Impact

The Plan checkpoint exists so the Navigator and reviewers can push back before code is
written. It is the cheapest possible place to be wrong. A state machine that freezes the
plan at the exact moment feedback arrives inverts the incentive: the successful outcome of
a good review is a better plan, and the runtime cannot represent one.

In practice it teaches the agent to under-plan so there is less to be wrong about, to delay
`plan` until after the review — which defeats the checkpoint — or to route around the
runtime. All three are worse than the behavior Ariad is trying to produce.

Separately, the audit trail a Change Request appears to provide does not exist. Anyone
reading a closed record to answer "what did we agree to build, and what proof did we
accept?" gets the last sentence written and nothing else.

## Plan Or Decision

Pending. Capture does not authorize a lifecycle or schema change.

Suggested direction, for planning rather than prescription: an append-only event log for
Change Requests, one row per transition carrying journey, change request ID, from-status,
to-status, event kind, payload, and timestamp. `plan` then appends rather than overwrites,
re-planning becomes ordinary, `outcome_notes` reduces to a derived convenience field or is
retired, and the surfaces gain real history to render.

A smaller intermediate step — allowing `plan` from `{"active", "planned"}` and appending
under a `SUPERSEDED` separator inside `outcome_notes` — would unblock the immediate case,
but it encodes history inside a text blob and should be treated as a stopgap with an
explicit revisit trigger, not the destination.

Open question for planning: whether the roadmap-side `plan-item` / `approve-plan` pair has
the same one-way property, since it carries the same intent.

Likely blast radius: `src/memory/builder/workbench.py`,
`src/memory/storage/builder_workbench.py`, `src/memory/db/schema.py` plus a migration, the
Workbench surfaces, and the `mm-build` skill documentation, which currently describes the
lifecycle as strictly linear.

## Evidence

Reported three times from the field before consolidation.

**2026-08-06, `kia-backend` CR052** — an unsealed session cookie, a live
credential-in-cleartext defect, was taken through capture, select, confirm and plan. The
Navigator then asked the `quality-assurance` and `database-architect` personas to review the
recorded plan. The review found real defects in the plan: it asserted a wire-freeze
protection that does not exist in the repository, specified a Navigator validation route
that no fixture could support, and excluded the db test suite on reasoning that conflated
schema change with persistence behavior. The Navigator accepted the corrections and
instructed an amendment. The runtime refused both re-entry paths:

```text
$ uv run python -m memory build change-request plan --journey kia-backend \
    --change-request-id 0ff7b5f7 --summary "PLAN v2 ..."
Error: cannot plan from status planned; expected active

$ uv run python -m memory build change-request select --journey kia-backend \
    --change-request-id 0ff7b5f7
Error: cannot select from status planned; expected captured
```

What was actually done: a new Change Request, `kia-backend` CR075, was captured carrying
the amended plan, and CR052 was left stranded for later disposition. This works but
pollutes the register with duplicate records for one defect, splits the review history
across two records, and requires a human to remember to close the orphan.

**2026-07-25, `kia-desktop` CR079** — an eight-persona plan-and-review panel plus code
verification produced a materially revised plan v2. The same two refusals were observed
verbatim. Field decision (Navigator: Vinícius) was to keep v1 as the plan checkpoint while
v2 governed the work, carrying the delta only as later evidence at `mark-implemented`.

**2026-07-23, `kia-desktop` CR058** — first observation, after a security, QA and DevOps
persona review revised the plan. Workaround used: carry the revised plan via
`mark-implemented --plan`. Cost: the interim `planned` snapshot stays stale and the
plan-of-record cannot be corrected without implementing.

Reproduction:

```text
1. build refinement-story create --journey <j> --title "T"
2. build refinement-story pull --journey <j> --refinement-story-id <rs>
3. build change-request capture --journey <j> --title "T" --body "B" --refinement-story-id <rs>
4. change-request select ; change-request confirm ; change-request plan --summary "v1"
5. change-request plan --summary "v2"  -> Error: cannot plan from status planned; expected active
6. change-request select               -> Error: cannot select from status planned; expected captured
```

Workarounds considered and rejected in the field: `reject` then re-capture records a false
statement in the permanent register; `discard` then re-capture erases the
capture/select/confirm/plan provenance; direct SQLite writes are explicitly forbidden by the
Builder skill.

Guard line numbers and the `outcome_notes` write sites above were re-verified against
`src/memory/builder/workbench.py` at transcription time and still hold.

2026-08-14 — Re-verified against `origin/main` @ `688271f`: no replan verb exists anywhere
in `src/memory/`. Still valid.

## Outcome

Pending.
