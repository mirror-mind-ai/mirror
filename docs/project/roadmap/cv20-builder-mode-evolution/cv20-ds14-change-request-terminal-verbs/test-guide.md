[< Story](index.md)

# Test Guide — CV20.DS14 Change Request Terminal Verbs

TDD-first. No LLM path in the verbs, so the service/CLI/surface layers are covered by
deterministic tests; the verb-routing behavior is covered by a manual Navigator probe
(automated eval is a registered fast-follow).

## Automated tests

### Service — `tests/unit/memory/builder/test_workbench.py`

Per verb (`park`, `reject`, `promote`) unless noted:

- **Valid transition from each legal source** — from `captured`, `active`, `planned`,
  `implemented`, `validated`: status becomes the terminal value; `outcome_notes` is set.
- **Terminal source → error** — each verb from `done`/`parked`/`rejected`/`promoted`
  raises, with no state change (parametrized matrix).
- **Empty/whitespace inputs → error** (QA-2) — `park` with blank `--reason` or blank
  `--revisit-trigger`; `reject` with blank `--reason`; `promote` with blank `--target`.
- **Cross-journey → error** — CR of journey A parked under journey B.
- **Unassigned CR → error** (N2) — a captured CR with `refinement_story_id is None`
  raises the "discard an unassigned capture" message.
- **Cursor cleared when active** — the CR is the cursor's active CR → after the verb,
  `active_change_request_id is None`, `last_refinement_event == change_request_<verb>`.
- **Cursor untouched when not active** — a different CR is active in the same RS → cursor
  unchanged.
- **Cross-RS cursor untouched** — active cursor points at RS-A's CR; park a CR in RS-B →
  RS-A cursor untouched (the CR023 shape).
- **`completed_at` stays NULL** (N1) — park/reject/promote leave `completed_at` NULL;
  contrast a `done` CR which stamps it.
- **`outcome_notes` prepend-preserve** (ON) — park a `validated` CR carrying validation
  evidence → the resulting `outcome_notes` contains the park note **and** the prior
  evidence (`Prior note:` retained).

`_flow_event` regression:

- A terminal CR yields `active_change_request_id=None` (covers the `!= "done"` → full
  terminal-set fix for all of parked/rejected/promoted).

RS-close integration:

- An RS whose CRs are all terminal — including one `parked`, one `rejected`, one
  `promoted` — proceeds `review → coherence → close` with no "unfinished CR" error.

### Surfaces — `tests/unit/memory/builder/test_workbench_surfaces.py`

- Each terminal event renders a marked `<<<ARIAD:REFINEMENT_FLOW_EVENT>>> … <<<END:…>>>`
  block with the correct icon (🟫/🟥/🔷), phase label (Parked/Rejected/Promoted), and body.
- **Promote body** does not contain "roadmap"/"moved to" (prompt-engineer).
- **Progress surface** (QA-1): with a mix of `done` + `parked` + `rejected` + remaining
  non-terminal CRs, terminal CRs render as resolved marks (not the "remaining" mark), the
  resolved count includes the terminal set, and when every CR is terminal the surface says
  "no actionable CRs" with **zero** remaining marks.
- **Marker fence** (SEC): a `--reason` containing `<<<END:REFINEMENT_FLOW_EVENT>>>` (and a
  forged `<<<ARIAD:…>>>`) is neutralized in the rendered card — the output contains exactly
  one begin/end marker pair for the real surface.

### Storage — `tests/unit/memory/storage/test_builder_workbench_store.py`

- `TERMINAL_CHANGE_REQUEST_STATUSES` exported and equal to `{done,parked,rejected,promoted}`.

### CLI e2e — `tests/unit/memory/cli/test_build.py`

Drive the **argparse path** (`python -m memory build change-request …`), not the service
directly:

- `park`/`reject`/`promote` on a valid CR → prints the surface, exit 0, then the progress +
  next-CR recommendation (N5).
- Illegal transition (terminal source) → clean stderr message, **exit 1** (no traceback).
- Missing required arg (e.g. `promote` without `--target`) → argparse **exit 2**.
- `refinement-story park` valid → surface + exit 0 (scope lever; skip if D-RS is cut).

## E2E decision

**Required.** Rationale: DS14 spans storage → service → CLI → surface and unblocks RS
closure; a fixture-only route would not prove the argparse wiring or the cross-surface
progress accounting. A single end-to-end Navigator route below satisfies it.

## Navigator validation

Route (run in Builder Mode on a sandbox journey after reset):

```text
Create a refinement story for terminal-verb validation.
Capture three CRs in it: A (park me), B (reject me), C (promote me).
Pull that refinement story.
Park CR A: reason "deferred to build 2", revisit trigger "when the API ships".
Reject CR B: reason "decided against — duplicate of A".
Promote CR C: target "DS-xx", notes "outgrew refinement".
Show the refinement story overview.
Review, check coherence, and close the refinement story.
```

- **Expected observation:** three distinct terminal surfaces; overview shows A/B/C with
  parked/rejected/promoted marks; the RS closes without an "unfinished CR" error; the
  progress surface never shows a terminal CR as "remaining."
- **Pass:** all three verbs succeed, the RS reaches `closed`, surfaces render verbatim.
- **Fail:** any off-contract write needed, a terminal CR shown as remaining/active, a
  traceback on an illegal transition, or the RS refuses to close.

### Routing probe (manual — AI/prompt disambiguation)

Feed representative phrases and confirm the agent selects the right verb (not `discard`):

| Phrase | Expected verb |
|--------|---------------|
| "park this for build 2, reopen when the API ships" | `park` |
| "we're not doing this one" | `reject` |
| "this was captured by mistake" | `discard` (delete) |
| "this outgrew refinement — it's a delivery story" | `promote` |

Pass: 4/4 correct, and `reject` never routes to `discard`. Failures feed the fast-follow eval.

### CR023 reconciliation (manual, read-only — OPS)

1. Back up the production DB (`mm-backup`) **before** anything.
2. Read-only compare CR023 (`a6be8152`, `kia-desktop`) to the `park` output shape
   (`status=parked`, `outcome_notes` set, `completed_at=NULL`, cursor untouched).
3. Matches → done. Diverges → decide with the Navigator; backup is the rollback.

## Validation evidence

Pending implementation and validation.
