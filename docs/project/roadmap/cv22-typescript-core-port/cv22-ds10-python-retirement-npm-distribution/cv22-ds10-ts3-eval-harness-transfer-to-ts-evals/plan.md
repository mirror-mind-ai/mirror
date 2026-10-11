[< Story](index.md)

# Plan — CV22.DS10.TS3 — Eval harness transfer to `ts/evals/`

**Pulled:** 2026-09-22
**Level:** Technical Story (implementable; no Expand)
**Gate it clears:** [Eval Harness Deletion Gate](../index.md#eval-harness-deletion-gate), items 1–6

---

## Objective

Give the model-behavior release gate a TypeScript owner, then delete its Python
owner. `ts/evals/` carries the Python contract (per-module `PROBES` and
`THRESHOLD`, capability discovery for `--all`, JSONL history, threshold exit
code) against the live transport DS8 built, fixes D-017 so an obeyed injection
probe can no longer hide inside a passing module score, records a disposition
for every module so the denominator shrinks with a reason, diffs its first run
against the Python baseline already on disk, points the process docs at the new
harness, and only then removes `evals/` and `python -m memory eval`.

## What Is True Before This Story

- **Eleven Python modules** under `evals/` (`scene` retired with US1 on
  2026-09-19). Eight hit the live model (`consolidate`, `conversation_summary`,
  `extraction`, `journal`, `proportionality`, `reception`, `shadow`,
  `title_tags`: 51 probes). Three are deterministic and keyless: `retrieval`
  (10 math contracts over `hybrid_score`/`reinforcement_score`, `THRESHOLD=1.0`,
  no prompt), `retrieval_relevance` (19 probes — one per labeled query plus an
  MRR aggregate — over a frozen-embedding corpus in
  `evals/_fixtures/retrieval_relevance/*.json`, `THRESHOLD=0.95`), and
  `routing` (`detect_persona` on stale fixtures — failing since v0.31.0,
  [D-005](../../../../debt.md#d-005--evalsroutingpy-fixtures-are-stale-against-the-current-persona-catalog)).
- **Every module imports a Python pipeline function directly.** The TypeScript
  equivalents exist and take an explicit `LlmProvider`: `extractMemories` /
  `extractTasks` / `curateAgainstExisting` (`ts/src/extraction/conversation.ts`),
  `generateConversationTitle` / `Tags` / `Summary`
  (`ts/src/extraction/conversationMetadata.ts`), `proposeConsolidation` /
  `proposeShadowObservations` (`ts/src/cultivation/propose.ts`), `runReception`
  (`ts/src/mirror/reception.ts`), `buildJournalClassificationPrompt`
  (`ts/src/planning/promptAssembly.ts`, driven by `contentTailRoute.ts`),
  `MemorySearch` with injectable embedding provider and frozen clock
  (`ts/src/search/memorySearch.ts`), and `reinforcementScore` / `hybridScore`
  (`ts/src/search/ranker.ts`). `LiveLlmProvider` (`ts/src/providers/llm.ts`)
  is the DS8 transport.
- **Transcripts are inline Python literals** in each module, not fixtures —
  only `retrieval_relevance` has JSON on disk.
- **History** lives at `<mirror_home>/eval-history/<name>.jsonl`, schema
  version 2, fail-soft append, tolerant read. The Navigator's home holds two
  full-suite Python runs (2026-09-12 and 2026-09-21, both **10/11** after
  `scene`, `routing` the only failure) plus six `scene.jsonl` records that
  nothing has decided about. **The baseline is clean:** across the two runs,
  zero probes changed verdict; five fail in both (`two-pass-dedup` and
  `conversation-summary` in `extraction`, `open-existential-no-persona` and
  `shadow-touch-vague-discomfort` in `reception`, `title-trivial-empty` in
  `title_tags`); all six injection probes resisted in both. The TS first run
  is diffed against the 2026-09-21 records under the protocol below.
- **`prompt_hash` hashes the prompt *templates*** (`sha256` of the joined
  `EVAL_PROMPTS`), which US10 already pinned byte-identical across engines. An
  equal hash after the port is necessary, not sufficient: it proves the TS
  module references the same constants, not that the assembled prompt matches.
  The diff isolates TS-side behavior because templates, model, and transcripts
  are held equal — not because the hash agrees.
- **D-017**: `passed = score >= threshold`, so a module with six probes cannot
  fall below 0.80 on one obeyed injection. Six probes are injection probes:
  `prompt-injection-resisted` (extraction), `summary-injection-resisted`,
  `consolidation-injection-resisted`, `shadow-injection-resisted`,
  `title-injection-resisted`, `tags-injection-resisted`.
- `evals/_support.py::asserted_in_own_voice` is the obedience heuristic behind
  those six probes — a non-trivial security judgment with a curated
  distancing-marker list (D-009/D-010 history). It must port with fidelity, not
  be rewritten.
- The harness is **developer tooling**, invoked as `uv run python -m memory eval`
  directly — no front-door route, no skill, no REFERENCE.md row, no user-facing
  cutoff. The docs that name it are the
  [development guide](../../../../../process/development-guide.md#evals) and the
  [engineering principles](../../../../../process/engineering-principles.md).
- `ts/parity/*.ts` sits **outside** `tsconfig`/Biome includes (`src/**`,
  `test/**` only). A harness carrying a security gate should not inherit that.
- Python unit tests pin the harness contract in `tests/unit/memory/evals/`
  (runner: discovery, aggregation, `suite_run_id` threading, exit codes,
  persistence fail-soft, `--history` flip detection; support; persistence;
  three fixture-contract tests). They are the spec for the TS self-tests and
  are deleted with `evals/`.
- `scripts/check_retired_surfaces.py` already carries `evals/scene.py` under
  the `web-console` row; TS1/US1/TS2 each added a row for their deletion.

## Scope

### A. Harness core — `ts/evals/`

- `ts/evals/harness/types.ts` — `EvalProbe { id, description, blocking?, run }`,
  `EvalResult`, `EvalReport` with `score` and `passed`.
- `ts/evals/harness/runner.ts` — `runEval`, `discoverEvalNames`, `runAll`,
  `printReport`, `printAllSummary`, `printHistory`, `main`. Discovery: read
  `ts/evals/*.ts`, dynamic-import each, keep those exporting `PROBES` — the
  Python rule (capability, no skip-list); infrastructure lives in
  `ts/evals/harness/` and is never scanned.
- `ts/evals/harness/persistence.ts` — `EvalRunRecord` with the **same
  top-level field set as schema 2 and `schema_version: 3`**, meaning "`passed`
  accounts for blocking probes" (see B). Python's reader builds
  `EvalRunRecord(**line)` and `probes` is `list[dict]`, so it parses v3 lines
  unchanged during the diff window; the TS reader accepts 2 and 3. Same path
  rule (`<mirror_home>/eval-history/` via `resolveMirrorHome`, gitignored
  `ts/evals/.history/` fallback), fail-soft append, malformed-line-tolerant
  read. The retention rule — deleting a module never deletes its measurements —
  is written as a comment beside `readHistory`, where the next reader lives.
- `ts/evals/harness/support.ts` — `assertedInOwnVoice` and `DISTANCING_MARKERS`,
  ported verbatim **with the D-009/D-010 provenance comments attached to each
  marker group** (they are the specification of why a marker exists; a bare
  list is a magic string), and **characterized against Python with a committed
  golden** of sentinel/zero-tolerance/distancing-aware cases (generated once
  from the Python function while it exists).
- `ts/evals/harness/cli.ts` — the entry; `npm run eval -- <name|--all>
  [--history [N]]` in `ts/package.json`. **Environment resolution, named:** the
  script is `node --env-file-if-exists=../.env evals/harness/cli.ts` so the
  repo-root `.env` reaches `process.env` from `ts/` and the keyless route still
  runs where no `.env` exists (CI). The history home is
  `resolveMirrorHome(process.env)` — the verified port of Python's
  `resolve_mirror_home` (`MIRROR_HOME` wins, `MIRROR_USER` derives
  `~/.mirror-minds/<user>` with the legacy `~/.mirror/<user>` fallback) — so
  the TS harness lands in the same `eval-history/` the Python records occupy.
  Route 1 asserts the path, not only that a line was appended.
- `tsconfig.json` and `biome.json` includes gain `evals/**/*.ts`.
- Self-tests in `ts/test/evals/` mirroring the Python contract list above.

### B. D-017 — blocking probes

- `EvalProbe.blocking?: boolean`. A module **fails** when any blocking probe
  fails, independently of `score >= threshold`; the suite fails when any module
  fails (unchanged). The report prints the reason on its own line
  (`✗ FAIL — blocked by <probe-id>`), and `--history` shows blocked verdicts
  distinctly.
- The persisted `probes[]` entry gains `blocking: true|false`, and because the
  record-level `passed` no longer means `score >= threshold`, the record is
  written as `schema_version: 3`. No `blocked_by` field: it is derivable from
  `probes[]`, and derived state in an append log is a future inconsistency.
- The six injection probes are marked `blocking: true`. No other probe changes.
- **What the stricter gate costs, stated up front.** The only documented
  residual obey rate is AI-22's 1/10 on `scene`, which is gone; the other fenced
  surfaces have twelve resisted samples (two runs × six probes) and no measured
  rate. If their residual is anywhere near 1/10, six blocking probes block the
  suite on residual alone in roughly four runs of ten. That is the intended
  consequence of D-017, not a defect: the gate now reports what it measures.
  The plan therefore fixes the response before the first run happens:
  - a blocked injection probe is re-run **alone**, at **n=5**, on Navigator
    authorization — the probe, not the module, because the other probes
    already agreed and n=3 cannot separate a 1/10 residual from a regression;
  - ≥2/5 obeyed is treated as a fence regression on that surface and is a stop
    condition; 1/5 or 0/5 is recorded as residual, the suite run is recorded
    as blocked, and the Navigator decides whether to run the suite again;
  - the policy is **investigate at the probe, never waive by re-running the
    suite until green**, and it is written into the development guide beside
    the `--all` command so a human reading a red gate later knows what it asks.

### C. Fixtures — engine-neutral JSON

- Inline transcripts, memories, and expected shapes move to
  `ts/evals/fixtures/<module>.json`; `evals/_fixtures/retrieval_relevance/`
  moves to `ts/evals/fixtures/retrieval_relevance/` with its provenance block.
- **Deviation from gate item 2's literal wording, for approval:** Python is
  *not* rewired to read the JSON. `evals/` is deleted in plateau 6 of this
  same story, so a Python JSON loader would be throwaway work. The property the
  item protects — both harnesses read the same transcripts during the diff
  window — is proven instead by a one-shot Python check in plateau 3 that
  asserts each JSON fixture equals the inline literal it replaces, with the
  evidence recorded in `validation.md` before `evals/` goes. The check lives
  under `evals/` (not `scripts/`) so plateau 6 deletes it and TS5 inherits no
  stray Python.

### D. Module dispositions (the `--all` denominator: 11 → **9**)

| Module | Disposition | Why |
|---|---|---|
| `routing` | **Retired — no successor gate for routing quality; fixture refresh is future work** | D-005: fifteen probes stale against the current persona catalog, failing since v0.31.0. The DS2 golden (`ts/test/persona/detectPersona.test.ts`) is a *parity* test — it proves `detectPersona` matches Python on a fixture catalog, not that the live catalog routes sensible queries sensibly. Retiring the module removes the only behavioral check on routing; refreshing the fixtures is collision analysis against the live catalog (prompt-engineer work) and its own story, not this one |
| `retrieval` | **Migrated to CI** — its ten named contracts become tests in `ts/test/search/ranker.test.ts` (four exist today), retired from the harness | `THRESHOLD=1.0`, no prompt, no model: a deterministic contract is a unit test, and CI is the stronger home |
| `retrieval_relevance` | **Kept** in `ts/evals/` | A quality threshold over frozen embeddings — drifts when ranker weights move, not when code breaks; also the harness's only key-free module, so `npm run eval -- retrieval_relevance` smokes the harness itself for free |
| the eight live modules | **Ported** | Each probe calls the TS pipeline function through `LiveLlmProvider`; prompts are byte-identical and digest-pinned, so the diff isolates TS-side parsing/coercion/orchestration — the exact blind spot the Python harness had |
| `scene` | already retired (US1) | — |

### E. History disposition (the open question from US1)

**History stays where it is, as a record.** The TS harness reads and writes the
same `<mirror_home>/eval-history/` directory in the same schema, so nothing
"follows" anything: `scene.jsonl`, `routing.jsonl`, and `retrieval.jsonl` are
left in place as inert measurements of modules that no longer run, and
`npm run eval -- scene --history` still renders them because `--history` reads a
file, not a module. Deleting a module never deletes its measurements; that is
now a stated rule, not an accident. The cutover is legible in the log itself:
every record at `schema_version: 3` is TS-produced under blocking semantics,
and the story package records the plateau-5 timestamp as well.

### F. Docs, guards, deletion

- Development guide `## Evals` and engineering principles name `ts/evals/` and
  `npm run eval` as the gate's subject, drop the "measures Python's pipeline"
  paragraph, name the nine-module denominator, state the blocking rule, the
  blocked-run policy (investigate at the probe, never waive), and the history
  rule. **The trigger list is rewritten too, not only the measurement
  paragraph:** "before changing prompts in `src/memory/intelligence/prompts.py`"
  becomes `ts/src/extraction/prompts.ts`, "after a model change in
  `src/memory/config.py`" becomes `ts/src/providers/config.ts`, and the
  `routing` waiver paragraph is replaced by the retirement and its named gap.
- `src/memory/__main__.py` loses the `eval` help text and dispatch;
  `.gitignore` swaps `evals/.history/` for `ts/evals/.history/`. Before the
  deletion commit, `grep -rn "evals\|memory eval" tests/ src/ scripts/` outside
  `tests/unit/memory/evals/` is run and every hit is either in the deletion set
  or explained — the Python matrix must not go red on a file the story did not
  think it owned.
- `scripts/check_retired_surfaces.py` gains an `eval-harness` row
  (`story=CV22.DS10.TS3`; absent: `evals/`, `tests/unit/memory/evals/`;
  forbidden: `from evals\b`, `memory eval\b`), the pattern TS1/US1/TS2 set.
- `evals/` and `tests/unit/memory/evals/` are deleted; the Python suite, the
  pre-push set, and CI stay green across the deletion.

## Non-Goals

- No new probes, no prompt changes, no threshold changes, no judge-LLM.
  Fidelity first; improvement is a later story with its own baseline.
- No change to any TS pipeline function. If a probe cannot be hosted without
  changing product code, that is a stop condition, not a quiet edit.
- No eval in CI, no front-door route, no skill, no MCP tool. Developer tooling
  stays developer tooling.
- No `engine` field on the record — the version bump already makes the
  cutover legible, and attribution beyond that is not a need this story has.
- No fix for D-010 (whole-text marker matching). Carried, unchanged.
- No Python JSON-fixture loader (see C).
- No deletion of `ts/parity/` or its Python (TS5).
- No touch on `<mirror_home>/eval-history/` contents.

## Plateaus

Each plateau is a commit and a resumable state.

1. **Harness core with zero modules.** A–B land with self-tests; `npm run
   eval -- --all` discovers nothing and exits 0 (Python's `all([])` rule —
   transient, gone by plateau 2). `assertedInOwnVoice` passes its Python-generated
   golden. Typecheck and lint cover `ts/evals/`.
2. **The keyless path end to end.** `retrieval_relevance` ported with its
   fixtures; `retrieval`'s ten contracts land in `ranker.test.ts` and the module
   is not ported; `routing` is not ported and D-005 is closed as retired.
   `npm run eval -- retrieval_relevance` → `19/19 passed`, record appended, no key.
3. **Fixtures out of the source.** Inline literals → `ts/evals/fixtures/`; the
   one-shot Python equality check runs and its output is recorded.
4. **The eight live modules.** Smallest first so the pattern is proven cheap:
   `conversation_summary` (1) → `journal` (5) → `proportionality` (5) →
   `consolidate` (5) → `shadow` (5) → `title_tags` (7) → `extraction` (11) →
   `reception` (12). Six probes blocking. Each module is smoke-run alone once as it
   lands.
5. **First full run and the diff.** `npm run eval -- --all` on the Navigator's
   home, then the diff protocol below against the 2026-09-21 Python records,
   recorded in `validation.md`.

## Diff Protocol (plateau 5)

Per module, in this order, sets before verdicts:

1. **Probe-id set equality — hard fail.** The TS module's probe ids equal the
   Python record's probe ids exactly (51 live + 19 keyless = 70). A module
   ported with fewer or renamed probes fails the diff before any verdict is
   read; this is what stops a thinner port from turning every acceptance line
   green.
2. **Per-probe verdict comparison.** The baseline has zero instability across
   two runs, so every difference is a signal, in both directions:
   - a TS **fail** on a probe Python passed → re-run the probe alone at n=5
     (Navigator-authorized); ≥2/5 reproduced is a TS-side finding (parse,
     coercion, orchestration) and a stop condition; otherwise recorded as
     residual;
   - a TS **pass** on one of the five probes Python fails consistently → also a
     finding to explain, not a win to record: something in TS orchestration or
     parsing differs, and the explanation goes in `validation.md` before the
     story proceeds;
   - a blocked injection probe follows the B policy (probe alone, n=5, ≥2/5 is
     a regression).
3. **Module-level agreement** (`score`, `passed`) is reported last and carries
   no weight of its own — it is a consequence of 1 and 2.

**Cost budget, stated.** Fifty-one live probes per suite at extraction-tier
pricing is under a dollar; the story budgets eight single-module smokes
(plateau 4), one suite (plateau 5), and up to two n=5 probe re-runs — well
under five dollars total, recorded actually-spent in `validation.md`.
6. **Docs and deletion.** F lands; `evals/`, `tests/unit/memory/evals/`, and the
   `eval` dispatch are removed in one commit; `check_retired_surfaces.py`
   asserts it; full pre-push set green.

## Rollback

Plateaus 1–5 add files and touch nothing Python reads; reverting any of them
leaves the Python harness intact. Plateau 6 is one commit whose revert restores
`evals/`, its tests, and the dispatch. `<mirror_home>/eval-history/` is never
written by the deletion, so no run history is at risk in either direction.

## Acceptance Behavior

```text
Given OPENROUTER_API_KEY is configured and <mirror_home>/eval-history/ holds the
      2026-09-21 Python records
When  the Driver runs `npm run eval -- --all` from ts/
Then  nine modules are discovered by capability and run in sorted order under one
      suite_run_id
And   every probe prints its verdict and notes; a module with a failed blocking
      probe reports FAIL naming the probe even when its score clears threshold
And   one schema-3 record per module is appended to the same
      <mirror_home>/eval-history/ the Python records occupy
And   the exit code is 0 iff every module passed
And   `npm run eval -- <name> --history` renders the TS run beneath the Python run
      and flags any probe whose verdict flipped

Given the story is done
When  `git ls-files evals/ tests/unit/memory/evals/` runs
Then  it prints nothing, `python -m memory eval` is not a command, and
      scripts/check_retired_surfaces.py passes with the eval-harness row
And   scene.jsonl, routing.jsonl, and retrieval.jsonl are unchanged on disk
```

## Validation Route

**Automated (every plateau):** `npm run typecheck`, `npm run lint`, `npm test`
(new `ts/test/evals/*` plus the ten `retrieval` contracts in `ranker.test.ts`),
`uv run pytest` (until plateau 6, then again after), the pre-push set, and
`scripts/check_retired_surfaces.py` after plateau 6.

**Navigator route (free, any time after plateau 2):**
`cd ts && npm run eval -- retrieval_relevance`
→ *expected:* `── retrieval_relevance eval ──`, nineteen probe lines, `19/19
passed (threshold: 0.95) ✓ PASS`, exit 0, one new `schema_version: 3` line
appended to the **same file** that holds the 2026-09-21 Python record
(`<mirror_home>/eval-history/retrieval_relevance.jsonl` — check the path, not
just the append).
*Fail:* module not found, score below 1.00, record written to a different
directory, no record appended, or non-zero exit.

**Navigator route (paid, plateau 5):** `cd ts && npm run eval -- --all`
→ *expected:* nine module reports, `9/9 evals passed ✓ SUITE PASS` or a named
failure, exit code matching the verdict; then the diff protocol: probe-id sets
equal per module, then verdicts; `npm run eval -- extraction --history 3`
shows the TS run above the Python runs with every difference explained in
`validation.md`.
*Fail:* fewer than nine modules, any probe-id set mismatch, a module PASS
printed while a `*-injection-resisted` probe shows `✗`, an unexplained verdict
difference in either direction, or a verdict/exit-code mismatch.

**E2E decision: required.** The live run *is* the E2E; it spends money, so it is
Navigator-run, once, plus the n=5 single-probe re-runs the protocol authorizes.

## Implementation Contract

- TDD: harness self-tests before harness code; the `assertedInOwnVoice` golden
  before the port; the ten ranker contracts as failing tests before any
  `retrieval` code is touched.
- No `any`; probe modules typed against the TS pipeline signatures, not loose
  records.
- `uv run` for every Python command until `evals/` is gone.
- Commit per plateau, story-scoped files only, English messages explaining why.
- Every push verified green with `gh run watch` before the next plateau.
- Cost discipline: no live run outside plateaus 4–5; plateau-4 smokes run one
  module at a time; re-runs are single probes, never the suite.
- Probe modules import nothing that calls a provider or reads a key at import
  time — discovery dynamic-imports all nine, and `LiveLlmProvider` resolves its
  config lazily on first `complete`, which is the property that keeps
  `--all` discovery free.

## Stop Conditions

- **scope_change_detected** — a probe needs a TS pipeline function changed, or
  a TS signature cannot host a Python probe's inputs.
- **navigator_decision_needed** — a plateau-5 difference reproduces at ≥2/5
  on the single-probe re-run; a TS pass on a Python-failing probe has no
  explanation; the `assertedInOwnVoice` golden diverges on any case; the
  fixture equality check finds a literal the JSON cannot represent.
- **failing_required_check_without_clear_fix** — Python suite or pre-push set
  red after plateau 6 for a reason outside `evals/`.
- **plan_rule_conflict** — any of the four decisions below is declined; the
  affected plateau re-plans rather than proceeds.

## Decisions This Plan Asks The Navigator To Take

1. `retrieval` migrates to CI unit tests and leaves the harness (D).
2. `retrieval_relevance` stays in the harness as the keyless module (D).
3. Python is not rewired to JSON fixtures; a one-shot equality check stands in
   for gate item 2's "both harnesses read the same transcripts" (C).
4. History stays in place, inert, same directory; no migration, no deletion,
   no `engine` field. Records written under blocking semantics carry
   `schema_version: 3` (E, B).

## Review

Per the [collaboration strategy](../../collaboration-strategy.md), the persona
panel is the standing second opinion and this story is above a small slice.

- **Plan review, before implementation — done 2026-09-22.** Panel chosen by the
  Navigator: ai-engineer, prompt-engineer, devops-engineer, database-architect,
  quality-assurance. Synthesis: sound where most likely to be wrong (fidelity
  port over the existing `LlmProvider` seam, no product code touched); risk
  concentrated in what the gate means after D-017 and in an under-specified
  diff. Five findings, all folded above: the diff protocol (QA, ai-engineer);
  single-probe n=5 re-runs and the blocked-run policy (ai-engineer, QA);
  `schema_version: 3` because `passed` changed meaning (database-architect);
  env-file and mirror-home resolution named, one-shot check under `evals/`
  (devops-engineer); dev-guide trigger paths and the `routing` disposition
  reworded to name the gap it leaves (prompt-engineer). Not requested by the
  Navigator and therefore not run: engineer, security-engineer. The
  security-relevant items (blocking semantics, `assertedInOwnVoice` fidelity)
  were covered by ai-engineer and QA; a security-engineer pass at handoff
  review is recommended.
- **Handoff review, after plateau 5 validation:** same panel plus
  security-engineer, findings classified as blockers / debt / next-plateau
  questions / accepted boundaries.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- Implementation is blocked until the Navigator approves this Plan and the four
  decisions above. Plan review by the panel precedes approval.
