[< Story](index.md)

# Plan — CV22.DS8.TS1

**Authored:** 2026-09-13 · **Status:** pending Navigator approval

## Objective

Record the `eval` harness ownership decision, and put it where the act that
would delete the harness has to honour it. This story writes documentation
only: no eval code is ported, retired, or run by the Driver.

## The decision being recorded

**The harness transfers to TypeScript, as a DS10 deletion gate — not a DS8
port and not a retirement.** Navigator-approved 2026-09-13 on the evidence
below.

The framing that decided it: this was never "port 3,691 lines or delete
them." **The instrument's subject moved.** The evals were built to measure
prompt behavior in the engine that answers users; since DS8 that engine is
TypeScript for eight of the nine live surfaces.

| Fact | Measurement (2026-09-13) |
|---|---|
| Size | 13 modules, 3,691 lines incl. frozen fixtures; 12 in `--all` (9 live, 3 deterministic); `persistence` is infrastructure |
| Subject under test | **Python.** Every live module imports the Python pipeline function directly (`extract_memories`, `reception`, `propose_consolidation`, `propose_shadow_observations`, `classify_journal_entry`, `generate_conversation_summary`, `generate_scene_synthesis`) |
| Who answers in production | **TypeScript**, for 8 of those 9. `scene` is the exception — reachable only through `web/server.py`, DS10's cutover |
| Is it a live gate? | Yes, in writing: [development guide](../../../../../process/development-guide.md#evals) "Model-behavior release gate" and the [engineering-principles](../../../../../process/engineering-principles.md) definition-of-done checklist |
| Last run | 2026-07-23 (CV9.E2.S30). v0.31.13/14 did not trigger it. **No `eval-history/` exists on this machine** — never run on this home |
| Chronic state | `routing` has failed since v0.31.0 ([D-005](../../../../debt.md#d-005--evalsroutingpy-fixtures-are-stale-against-the-current-persona-catalog), stale persona fixtures); every recorded `--all` is 11/12 under a waiver |
| DS10's plan for it | **None.** DS10's index does not mention `eval`; as written it deletes `evals/` with the Python core and the gate becomes unenforceable, silently |
| Who needs it next | [CR080](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr080-give-the-consolidation-prompt-an-identity-context-it-can-act-on.md), captured 2026-09-13, wants a probe before rewriting the consolidation prompt |

Why a gate rather than a port now:

1. **Nothing before DS10 needs it.** No model-pin or prompt change is
   scheduled. CR080 is the only candidate and can pull the story forward.
2. **The interim gate is valid, with a nameable blind spot.** The prompts are
   byte-identical across engines and digest-pinned (DS7.US10, DS7.US11,
   DS8.US3, DS8.TS2), so a Python probe still measures the prompt text a
   TypeScript command sends. What it cannot see is TS-side parsing, coercion,
   and orchestration — covered by goldens and unit tests, not by evals.
3. **DS10's own rule already demands it.** "Python deletion cannot begin
   merely because the command denominator reaches zero" — every non-command
   runtime surface needs explicit TS ownership first. The harness is such a
   surface; the index simply never said so.
4. **Retiring is not neutral.** It deletes the instrument that closed
   AI-16/AI-22/AI-23/AI-25 and against which the fences were tuned, with no
   replacement and a live request pending.

## Scope

Documentation only, seven files:

1. **`docs/project/decisions.md`** — the decision entry: the subject-moved
   framing, the measurements above, the gate placement, the interim validity
   and its blind spot, and what the transfer retires.
2. **DS10 index** — a new **Eval Harness Deletion Gate** section, in the shape
   the four existing gates use (Workspace/Web, extension compat host, skill
   invocation, projection refresh), plus one Done Condition bullet. DS10 has
   no candidate-story table, so a gate is the authoring form this package
   actually uses; the TS story gets its code when DS10 is pulled and expanded.
   The gate states the harness shape to port (`PROBES` + `THRESHOLD` per
   module, `--all` discovery by capability, JSONL history, thresholds), that
   fixture data becomes engine-neutral JSON, and what the `--all` denominator
   becomes.
3. **Burn-down ledger** — attribution `eval (DS8, live provider)` → DS10 in
   the three places it appears (Denominator note, deferred list, Remainder
   prose), and a History row at closure.
4. **`docs/process/development-guide.md`** — the release gate keeps its force
   and gains the truth about its subject: it measures Python's pipeline, the
   prompts are shared and pinned, the blind spot is TS parsing/orchestration,
   and ownership transfers at DS10. Also names the standing D-005 waiver so a
   reader does not mistake 11/12 for a new regression.
5. **`docs/process/engineering-principles.md`** — "Eight probe modules" is
   stale (twelve), and the list omits `journal`, `title_tags`,
   `conversation_summary`, `retrieval_relevance`. Corrected, with a pointer to
   the transfer. Drift correction in the paragraph this story is already
   rewriting the authority for.
6. **CR080** — one line naming which harness its probe runs on: the Python
   one before the transfer, the TS one after.
7. **`docs/project/debt.md`** — D-005's revisit trigger gains "or retired with
   the harness transfer", since the transfer is where that fixture dies.

## Non-Goals

- **No eval code.** No TS harness, no module port, no fixture conversion, no
  `evals/` deletion, no D-005 fixture fix. All of that is the DS10 story this
  gate authorizes.
- **This story does not close DS8.** It completes DS8's last child and makes
  every DS8 done-condition bullet true; the parent collapse and the
  release-intent question are the Navigator's next decisions, named at Done.
- No change to what the gate *requires* (green `--all` or a recorded waiver) —
  only to what the documentation says it measures.
- No CR080 probe, no prompt change.

## Decisions for the Navigator (approve with the plan)

**D1 — Panel review skipped, by proportionality.** DS8 makes security and
ai-engineer review mandatory "above a small slice". This slice writes no code,
touches no provider, and spends nothing; the ai-engineer lens is already
applied — the evidence table above *is* that review, and it changed the
answer (from "port or retire" to "the subject moved"). Recorded as a skip
rather than a default. Say so if you want the panel anyway.

**D2 — `scene` and `routing` dispositions are named in the gate, not decided
here.** The gate records that `routing` is the obvious retirement (dead since
v0.31.0, and TS has deterministic `detect-persona` goldens from DS2) and that
`scene` follows the web cutover it belongs to. The DS10 story decides them
with its own plan; TS1 only ensures the questions are written down where that
story will read them.

## Acceptance Behavior

```text
Given DS10's index, which today does not mention `eval` at all
When  a future session plans Python deletion and reads DS10's gates
Then  it finds an Eval Harness Deletion Gate that blocks deletion of `evals/`
      until a TypeScript harness owns the release gate
And   `decisions.md` explains why the transfer is DS10's and not DS8's, with the
      measurements the decision rested on
And   the development guide and engineering principles describe the gate's real
      subject, its blind spot, and its standing D-005 waiver
And   the burn-down ledger attributes `eval` to DS10 everywhere it appears
And   CR080 and D-005 name the harness their future work runs against
And   no eval code, fixture, or threshold changed
```

## Validation Route

1. `uv run python scripts/check_doc_links.py` — every relative link and
   **anchor** resolves, and no duplicate roadmap heading codes. Pass: both
   lines clean. (This is the check that caught TS2's `½` anchor; it is the
   authority, not a hand-rolled path walk.)
2. `uv run python scripts/check_skill_command_parity.py` — unchanged and
   green; this story touches no skill, and the check is the tripwire that
   would notice if it had.
3. `git diff --stat` — the diff touches `docs/**` only. No file under `src/`,
   `ts/`, or `evals/` appears. This is the story's core claim, mechanically
   checkable.
4. Navigator read-through of the decision entry and the DS10 gate: does the
   gate, read cold by a future session, actually block the deletion?

**E2E decision: required, narrowed to one run** — `uv run python -m memory
eval --all` once on this home, Navigator-run, a few cents. Not to test the
documentation, but to falsify the decision's own load-bearing assumption: the
entry asserts the Python harness *remains a working interim gate*, and it has
not run since 2026-07-23 or ever on this machine. Expected: 11/12 with
`routing` failing (D-005). If it is materially worse — modules erroring,
several probes flipped — the assumption is false, the interim gate is already
broken, and the transfer becomes urgent rather than DS10-scheduled. That would
change the decision, which is exactly why the run belongs here and not in the
DS10 story. It also leaves this home's first `eval-history/` records.

## Plateaus

One, plus closure. The story is small enough that splitting it would create
handoff cost without a resumable boundary.

| # | Plateau | Ends when |
|---|---|---|
| 1 | The seven documentation edits | link check and skill-parity check green; `git diff --stat` shows `docs/**` only |
| 2 | Navigator validation — the `eval --all` run and the read-through | Navigator accepts, evidence in `validation.md` |
| 3 | Closure — Debt Review, Coherence, Done; DS8 index TS1 → Done and 5/5; ledger History row; DS8 parent collapse and release intent raised, not taken | every DS8 done-condition bullet is true in writing |

## Risks

- **The decision reads as a deferral.** Mitigation: the gate is a *blocker* in
  the document that would otherwise delete the harness, not a backlog note.
  The test in acceptance is the cold read.
- **The `eval --all` run fails badly**, invalidating the interim-gate claim.
  That is the run's purpose. If it happens, stop at Validation and revise the
  decision before Done rather than shipping a wrong entry.
- **Scope creep into fixing D-005** while documenting it. Explicit non-goal;
  the trigger line is the only edit.
- **Stale-documentation drift elsewhere.** The principles paragraph was wrong
  by four modules; other docs may name the harness too. The link check will
  not catch semantic staleness, so the diff stays small and the gate is the
  single authority the others point at.

## Implementation Contract

- Documentation only. No file under `src/`, `ts/`, or `evals/` is touched.
- Use `uv run` for the checks and for the Navigator's eval run.
- Follow the project's own gate-section shape in the DS10 index; do not invent
  a candidate table where the package has none.
- Do not use `git add .`; commit only story-scoped files.
- Descriptive English commit messages explaining why.
- Do not mark DS8 done, do not decide release intent, do not pull the DS10
  story.

## Stop Conditions

- scope_change_detected — any edit outside the seven files, or any eval code change
- plan_rule_conflict — the DS10 gate cannot be written without deciding
  `scene`/`routing` dispositions that belong to the DS10 story
- failing_required_check_without_clear_fix
- navigator_decision_needed — the `eval --all` run contradicts the interim-gate
  assumption, or D1/D2 are unresolved

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
