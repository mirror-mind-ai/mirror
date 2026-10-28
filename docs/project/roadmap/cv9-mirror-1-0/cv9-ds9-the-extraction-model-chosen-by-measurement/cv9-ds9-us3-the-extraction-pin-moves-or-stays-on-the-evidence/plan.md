# Plan — CV9.DS9.US3

## Objective

Decide the extraction pin on DS9's evidence, record the decision with that evidence
in the decisions log, and carry the decision through: if the pin moves, one
migration commit that changes the pin, its reasoning default, and the price table
together, behind a fresh baseline and a green `eval --all`, with the docs and the
release note's section that tell a user what changed and how to roll back; if it
stays, a Change Request for Flash Lite's rate limits. Dispose of TS1's D2 and D3.

### The decision this Plan asks for

The Navigator decides the pin at this Plan's approval. The Driver's reading of the
evidence, for the Navigator to confirm or overturn:

**Move to `anthropic/claude-haiku-5.5`, at reasoning `none`.**

For it:

- On the Navigator's own conversations, ranked blind (TS2), Haiku came first on 16 of
  26 surfaces, beat Flash Lite 17–9, and beat Luna 20–6. This is the main evidence,
  because the LLM judge did not stand (0.55 agreement with the Navigator).
- The judge's arithmetic, by the rule fixed before any output was seen, also lands on
  Haiku: both candidates beat Flash Lite, and Haiku wins the head to head 2 surfaces
  to 0.
- On the suite at `none` (TS1), Haiku fixes three of the four probes Flash Lite has
  failed in every recorded run, passes all six blocking probes 14/14, and had no call
  cut off in 714.
- Flash Lite drew HTTP 429 on 31% of TS1's attempts and 8 of 112 of TS2's; Haiku and
  Luna drew none. The move retires D3 for the default pin.
- Fewer invented facts on the Navigator's conversations: 16 flags against Flash
  Lite's 26 across memories, tasks, and summaries (Luna: 3).

Against it, weighed and accepted:

- **Cost:** about 40% more. $1.06 against $0.77 for the production home's last 30
  days, because Haiku's tokenizer counts 1.5× the input. Immaterial at this volume.
- **Latency:** reception, which runs before every Mirror Mode answer, goes from
  0.6/0.8 s to 1.0/1.3 s at p50/p95 (TS1, at `none`). About half a second more on a
  turn that then waits for the answering model.
- **Summaries:** Haiku's are weaker as standalone notes than Luna's (3.58 against
  4.50 of 5), though better than Flash Lite's (2.21). On the suite, Haiku at `none`
  fails `extraction/conversation-summary` in about 10 of 14 runs, opening with "The
  conversation centered on…", the framing CR180 traces to the prompt. The extraction
  module still clears its 0.8 threshold at 10 of 11 probes; the fix is CR180's,
  after this decision, as TS2's Debt Review set. It is the one surface a user reads
  as prose, so the recommendation below sequences CR180 into the same release.
- **Luna** is the better summarizer and the cheaper candidate, but the Navigator
  ranked Haiku above it 20–6, and Luna is the slower one on reception (1.3/3.2 s).

If the Navigator decides **stay**, the Plan's Scope narrows to the decision record and
the Change Request; the sections below mark what applies.

### Two design decisions the Plan fixes

**The reasoning default is a property of the model.** Today, unset
`MEMORY_EXTRACTION_REASONING` sends no reasoning field, whatever the model (TS1's
decision 2: opt-in until a pin needs it). This pin needs it: Haiku reasons by default
and spends the title call's 40-token budget. What was measured is a fact about each
model, not about who named it: Haiku needs `none`, Flash Lite was measured with no
field. The rule after this story:

- A per-model table beside the pins, `MODEL_DEFAULT_REASONING`:
  `anthropic/claude-haiku-5.5 → none`; `google/gemini-2.5-flash-lite` absent, so
  nothing is sent; any model not in the table sends nothing.
- The effective model is resolved first (`MEMORY_EXTRACTION_MODEL` or the default
  pin), then the effort: `MEMORY_EXTRACTION_REASONING` when it names an effort, else
  the table's entry for the effective model, else no field.
- So: unset everything sends Haiku `none`; naming Haiku explicitly sends the same
  request, not a different one; the rollback the playbook promises, setting the
  variable to `google/gemini-2.5-flash-lite`, reproduces exactly the request Flash
  Lite was measured with; an operator pointing at any other model gets today's
  behavior and sets the effort explicitly.
- An invalid `MEMORY_EXTRACTION_REASONING` reads as unset, so the default pin still
  sends `none`, and the value is reported by `runtime status` and `runtime diagnose`
  (TS1's decision 4). This is the case most easily got wrong in the resolver
  (invalid → nothing, as today), so it is in the acceptance block and the tests.

One resolver returns the effective pair, model and effort, and the transport, the
eval harness (which records the effort at schema 4), and `runtime status` read it.
Two alternatives were rejected: `none` for every model when unset would send Flash
Lite a request it was never measured with on the one path meant to be a rollback;
keying the default on whether the variable is set would make `MEMORY_EXTRACTION_MODEL`
set to its own default value send a different request from leaving it unset.

**D2, the ledger, is captured, not built.** After the swap, the `model` column
already separates the two regimes: every default-pin row ran at `none`, every
Flash Lite row with no reasoning field. The gap left is a call made under an explicit
`MEMORY_EXTRACTION_REASONING`, which the ledger cannot distinguish from the default.
Closing it is a schema migration (019), a column, and five call sites, for a question
no one has asked of the ledger yet. It goes to RS010 as a Change Request, with this
reasoning, so the Navigator can pull it when the question is asked. If the Navigator
wants it built here, it is one additional step and the Plan is amended before
approval.

## Scope

**Both branches:**

1. The decision record in `docs/project/decisions.md`: the decision, the evidence
   (TS1's and TS2's packages, linked), the trade-offs weighed, and the two design
   decisions above, in the log's current voice.
2. TS1's D2 captured as a Change Request in RS010 (`docs/project/refinement/`),
   following the index's capture convention, unassigned.
3. The DS9 candidate table row and this package's `index.md` updated to the decision.
4. A worklog entry.

**Move branch, in one commit (the migration):**

5. `ts/src/providers/config.ts`: `DEFAULT_EXTRACTION_MODEL = "anthropic/claude-haiku-5.5"`,
   a `DEFAULT_EXTRACTION_REASONING = "none"` beside it, and the resolver that returns
   the effective model and effort by the rule above.
6. `ts/src/providers/llm.ts`: `LiveLlmProvider.complete` sends the effective effort
   (still only for roles in `CARRIES_EXTRACTION_REASONING`; `consult` unchanged).
7. `ts/src/providers/cost.ts`: a `MODEL_PRICES` entry for the new pin, at the price
   OpenRouter's catalogue lists on the day of the commit (DS9 recorded $0.10/M in,
   $0.50/M out on 2026-10-26; verified again at implementation, by a read of the
   catalogue). Flash Lite's entry stays, so rolled-back installs stay priced.
8. `ts/evals/harness/runner.ts`: the eval record's `reasoning` is the effective
   effort, so the new pin's records read `reasoning=none` and `--history` labels the
   flip as a model and reasoning change.
9. `ts/src/runtime/status.ts`: the models line shows the effective effort, marked as
   the model's default when it came from the table (`reasoning=none (model default)`).
   `runtime diagnose` is unchanged: an invalid value is reported as today. The models
   line is pinned by `runtime-status.golden.json`; one grep at implementation confirms
   nothing parses it (the updater's status gate reads readiness, not models).
10. Tests and goldens that name the pin or the envelope: `config.test.ts` (the
    resolver's rule, including Haiku named explicitly and an invalid effort on the
    default pin), `llmLive.test.ts` (the envelope with the default pin carries
    `reasoning: { effort: "none" }`; with `MEMORY_EXTRACTION_MODEL` naming Flash Lite
    and no effort it carries no reasoning field), `cost.test.ts` and `cost.golden.json`
    (the new pin priced, Flash Lite still priced), `status.test.ts` and
    `runtime-status.golden.json`, and the tests in `consult`, `loggerRuntime`,
    `diagnose`, and `externalRoutes` that name the pin string.
11. `REFERENCE.md`: the `MEMORY_EXTRACTION_MODEL` and `MEMORY_EXTRACTION_REASONING`
    rows: the new defaults, the rule, and the rollback, operable: the line to put in
    `${XDG_CONFIG_HOME:-~/.config}/mirror/env` (a clone may use its `.env`), and
    `mirror runtime status` as the check that it took. The development guide's
    playbook example line, if its model name no longer illustrates the signal.
12. The release note's section, drafted as `release-note.md` in this story package,
    not under `docs/releases/`: `mirror runtime release-notes latest` picks the
    highest semver filename there, so a `v0.38.0.md` on `main` would describe a
    release nobody can install. The draft moves into `docs/releases/` when DS9
    collapses to a release. Its frame: what a user sees first (memories, tasks, and
    titles from a newer model; background work slightly slower, which they will
    mostly not notice; about 40% more on the OpenRouter bill at typical volume, one
    honest line), the summaries' opening tic if CR180 has not shipped in the same
    release, and the rollback as an escape hatch, not a headline: the env line, the
    file, the status check, and that rolling back restores Flash Lite's rate-limit
    exposure.

**Move branch, the gate (not committed code; evidence in this package):**

13. Fresh baseline: `eval --all` on the current pin in the development home, before
    the pin changes (playbook step 1), so `--history` has a fresh anchor. Flash Lite
    drew 429 on 31% of TS1's attempts, so a module whose window held a rate-limited
    request is dirty: re-run until every module has one clean window, and let TS1's
    14 pooled control runs stand as the regression reference. Correction, made at
    the baseline run: the plan as approved said `reception` has 3 probes and had been
    red on the current pin all along; it has 12, and the baseline passed 9 of 9
    modules with no 429. Flash Lite's standing probe failures (`two-pass-dedup`,
    `conversation-summary`, `open-existential-no-persona`, `title-trivial-empty`)
    leave every module above its threshold.
14. After the swap: `eval --all` on the new pin in the development home. The rule for
    green, fixed before the run: a single run is the release smoke. Green is every
    blocking probe passing and every module at or above its threshold. A module that
    misses is re-run n≥5 (playbook step 5), and clears if the majority of those runs
    clear it. Two misses are known noise at `none` from TS1 and are not regressions
    unless the re-run says so: `extraction/conversation-summary` (4/14, module still
    10/11) and `reception/open-existential-no-persona` (11/14; reception has 12
    probes, so the module stays green either way). Any other flip is a
    candidate regression and gets the same n≥5 before it is called one. Both runs'
    summaries go in `evidence/` here, numbers and probe names only.
15. Post-swap observation, recorded as a dated follow-up in this story's Done: a week
    after the swap, from the development home's `llm_calls`, reception p50/p95
    latency, the 30-day cost, and the count of non-200 calls, against the plan's
    numbers (1.0/1.3 s, about $1, none). The ledger already records all three. A
    backfill is the one burst path, and Haiku counts 1.5× the tokens, so non-200
    matters there as much as latency.

**Stay branch:**

5'. TS1's D3 captured as a Change Request in RS010: Flash Lite's rate-limit exposure,
    with TS1's and TS2's counts, unassigned.

## Non-Goals

- Prompt changes, including CR180's fix for the summary opening: a DS9 non-goal, and
  it would break the `prompt_hash` invariant the gate's comparison rests on.
  Recommendation, not scope: sequence CR180 as its own change with its own eval,
  after the swap commit and inside the release that carries the pin, so the user meets
  the new model and a summary that reads as a note together.
- The ledger column for the reasoning setting (D2): captured, as above.
- A model per surface, `consult`'s catalogue, the embedding pin, provider routing or
  fallback.
- The release: version bump, tag, promotion, push, and GitHub publication. DS9's
  release intent is not recorded yet; recording it is a Delivery Story act, not this
  story's.
- Changing TS1's or TS2's evidence packages.
- Do not silently absorb adjacent roadmap work.

## Acceptance Behavior

```text
Given DS9's evidence and the Navigator's decision at Plan approval
When the story closes
Then `docs/project/decisions.md` records the decision, the evidence, the trade-offs,
  and the reasoning-default rule
And the DS9 candidate table and this package say the same thing
And RS010 holds a captured Change Request for D2

Given the pin moved, no environment override, and an extraction-family call
When `LiveLlmProvider.complete` builds the request
Then the body names `anthropic/claude-haiku-5.5` and carries `reasoning: { effort: "none" }`
And a `consult` call carries no reasoning field
And `computeCost` prices the call, never null

Given the pin moved and `MEMORY_EXTRACTION_MODEL=google/gemini-2.5-flash-lite`
When an extraction-family call is built
Then the body names Flash Lite and carries no reasoning field
And `computeCost` still prices it

Given the pin moved and `MEMORY_EXTRACTION_MODEL=anthropic/claude-haiku-5.5` set explicitly
When an extraction-family call is built
Then the body is the same as with no override: Haiku, `reasoning: { effort: "none" }`

Given the pin moved and `MEMORY_EXTRACTION_REASONING=low`
When an extraction-family call is built on either pin
Then the body carries `reasoning: { effort: "low" }`

Given the pin moved, no model override, and `MEMORY_EXTRACTION_REASONING=off`
When an extraction-family call is built
Then the body carries `reasoning: { effort: "none" }`, the model's default
And `runtime status` reports `reasoning=invalid (off)` and `runtime diagnose` reports it

Given the pin moved
When `mirror runtime status` runs with no override
Then its models line reads `extraction=anthropic/claude-haiku-5.5, reasoning=none (model default), ...`

Given the pin moved
When `npm run eval -- --all` runs in the development home
Then it is green by the rule step 14 fixes: every blocking probe passes, every module
  clears its threshold, or clears it in the majority of an n≥5 re-run,
  and each record names the new pin and `reasoning=none`
And `eval extraction --history` shows the flip labeled as a model and reasoning change
  against the fresh Flash Lite baseline

Given the pin stayed
When the story closes
Then no file under `ts/` changed, and RS010 holds a captured Change Request for D3
```

## Validation Route

**Automated (Driver, before Navigator validation):**

- `npm test` green, including the updated goldens.
- `npm run check` (lint and types) green.
- Fresh baseline `eval --all` on Flash Lite (clean windows, per step 13), then
  `eval --all` on Haiku at `none` judged by step 14's rule, both in the development
  home; `eval extraction --history` shows the labeled flip. Summaries in this
  package's `evidence/`.

**Navigator-visible route (move branch):**

1. In the development home, run `mirror runtime status`.
   - Expected: the models line names `anthropic/claude-haiku-5.5` and
     `reasoning=none (model default)`.
   - Pass: both appear. Fail: either is missing or names Flash Lite.
2. Have one conversation with at least one substantive exchange (not a trivial one,
   which earns no title by design) end in a Pi session on the development home, with
   no override set, then read `llm_calls` (`mirror runtime status` or a direct query).
   - Expected: the new rows name `anthropic/claude-haiku-5.5`, carry a non-null
     `cost_usd`, and the conversation has a title, tags, and a summary.
   - Pass: all three. Fail: a null cost, a Flash Lite row, or an untitled
     conversation. An empty title is a fail, not a retry: it was the symptom TS1
     chased.
3. Set `MEMORY_EXTRACTION_MODEL=google/gemini-2.5-flash-lite`, run
   `mirror runtime status`.
   - Expected: the models line names Flash Lite with no reasoning clause.
   - Pass: as expected. Fail: a reasoning clause appears.
4. Read the decision entry in `docs/project/decisions.md` and `release-note.md` in
   this package, and confirm they say what the Navigator decided and why, and that
   the rollback names the file and the check.

**Navigator-visible route (stay branch):** read the decision entry and the two
Change Requests in RS010's index.

**E2E decision:** required: step 2 is the end-to-end check, a real conversation
through the real transport on the new pin. It costs a few cents.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable: the resolver
  and the envelope first, red then green.
- Keep changes scoped to `CV9.DS9.US3`.
- The migration commit (steps 5–11) is one commit; the release-note draft, the
  decision record, the Change Request, and the evidence are their own commits. Do not use git add .; commit only
  story-scoped files.
- The eval runs write to the development home's eval history and nowhere else; no
  scratch home, since this is the real swap. Nothing is written to the production
  home.
- Follow the project's development guide: docs/process/development-guide.md,
  including the model upgrade playbook's order: baseline, swap, re-run, diff per
  probe, confirm flips, then commit.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- `eval --all` on the new pin is not green by step 14's rule after the n≥5 re-run:
  stop, show the probe, and ask whether to record a waiver, pull CR180 first, or stay.
- The fresh baseline cannot get a clean window on a module after three attempts:
  stop and ask whether TS1's pooled control stands alone as the baseline.
- OpenRouter's catalogue prices the new pin differently from DS9's record: record
  the price seen and continue; if the model is no longer listed, stop.
- The Navigator's decision at approval is neither move nor stay as written here (for
  example Luna, or Haiku at another effort): amend this Plan before approval.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- the approval names the branch: move to Haiku at `none`, or stay
- implementation remains blocked until Navigator approval.
