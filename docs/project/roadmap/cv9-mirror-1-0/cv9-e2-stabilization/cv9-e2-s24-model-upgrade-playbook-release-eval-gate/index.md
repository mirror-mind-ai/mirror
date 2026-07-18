[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S24 — Model-Upgrade Playbook & Release Eval Gate (AI-11 item 3)

**Status:** Done
**Epic:** CV9.E2 Stabilization & Robustness
**Advances:** AI Engineering Audit **AI-11** (item 3 — the eval suite exists but
nothing runs it as a whole and no gate uses it)
**Found & fixed in-cycle:** an inline comment on the `.gitignore` pattern line
silently disabled the `evals/.history/` ignore since CV9.E2.S19
**Planned by:** quality-assurance · **Reviewed by:** ai-engineer,
prompt-engineer, devops-engineer, database-architect

---

## User-Visible Outcome

Before this story there was no way to run the eval suite as a whole — only
`eval <name>`, one module at a time, eight separate commands with eight exit
codes a human had to aggregate by eye. AI-11's headline complaint — *"no gate
uses them"* — stayed literally true no matter how many probes were added.

This story delivers the gate as a real command plus the migration procedure
that uses it:

- **`eval --all`** discovers every eval module by capability and runs the whole
  suite, exiting non-zero if any eval fails and naming which ones.
- **A model-upgrade playbook** in the development guide: baseline → swap → re-run
  → per-probe diff, with the noise-vs-regression distinction made explicit.
- **A release gate**: a model-pin or prompt change must clear a green
  `eval --all` (or a recorded waiver) before release.

AI-11 item 1 (persistence, S19) and item 3 (this story) are now done. AI-11
stays open only for item 2's two remaining surface probes: **journal
classification** and **title/tags quality**.

## Grounded facts (verified in source)

- **The suite existed but had no aggregate runner.** `evals/runner.py`'s `main`
  took a single `<name>` (plus `--history`); there was no full-suite mode.
- **Discovery by capability is possible without a hand-list.** Every real eval
  module exposes a top-level `PROBES` list; infra modules (`runner`,
  `persistence`, `types`, `_support`) do not — so `hasattr(module, "PROBES")`
  is a sufficient, drift-proof filter. Eight modules qualify today:
  `consolidate`, `extraction`, `proportionality`, `reception`, `retrieval`,
  `routing`, `scene`, `shadow`.
- **Eval modules are import-safe.** They define constants, fixtures, and
  `PROBES` at import; the model call happens only inside `probe.run()`. So
  importing every module for discovery touches no network.
- **The S19 history record supports the comparison — with one gap.** Each
  `eval <name>` run appends one `EvalRunRecord` (`model`, `prompt_hash`,
  `score`, per-probe results) to `<mirror_home>/eval-history/<name>.jsonl`.
  A single `eval --all` invocation therefore writes eight independent records
  across eight files with **nothing correlating them** — the "which full pass
  did I run at release time?" query was unanswerable.
- **`prompt_hash` + `model` already encode the regression signal.** For a pure
  model swap, `prompt_hash` is unchanged and only `model` differs — so a probe
  flip under those conditions is model-attributable, not prompt-attributable.
- **`retrieval` is the one fully hermetic eval** (pure scoring math, no network,
  no DB) — usable to exercise the real aggregation path in a unit test.

## Scope

**In:**

- `eval --all` in `evals/runner.py`: `discover_eval_names()`, `run_all()`,
  `print_all_summary()`, incremental per-eval printing, exit 0 iff every eval
  passes.
- `suite_run_id` on `EvalRunRecord` (additive, `schema_version` → 2) so one
  `--all` run is a queryable set; threaded through `run_eval`.
- Model-upgrade playbook + release gate in `development-guide.md`; stale eval
  list fixed in `engineering-principles.md` §7, gate named in the §10 gate
  table and Definition of Done.
- The `.gitignore` fix for `evals/.history/`.
- CLI help update; unit tests; roadmap/audit/worklog coherence.

**Out (named follow-ups):**

- **Journal and title/tags probes** — remaining AI-11 item 2 surfaces; AI-11
  stays open for them.
- **Aggregate cost line on `--all`** (tie to the AI-09 cost authority) — deferred
  until the authority reads cleanly at suite level.
- **Nightly non-blocking scheduled `eval --all` in CI** — devops-lens option,
  radar, not this story.
- **eval-history retention/rollup** — additive later (same class as the
  `llm_calls` growth radar item); registered, not built.
- **`--all --history` (whole-suite trend)** and an `--all --deep` cost split.

## Acceptance Criteria

- `eval --all` runs exactly the modules exposing `PROBES` (contract test),
  excludes infra, exit code 0 iff **all** pass, aggregate summary **names**
  failing evals.
- A probe/module runtime failure is counted as a named failure, never silently
  dropped (existing per-probe `try/except` verified to cover this).
- One shared `suite_run_id` stamped into every record of an `--all` run;
  standalone `eval <name>` leaves it `None`; pre-v2 history lines without the
  field still parse.
- A **keyless real-mechanism smoke** exercises `run_all` over the hermetic
  `retrieval` eval (real report objects, not mocks).
- Playbook present with the baseline-first step front-loaded, the
  `prompt_hash`/`model` invariant, and the single-run-smoke vs n≥5 distinction;
  release gate stated imperatively with named triggers and a waiver path.
- Full keyless suite green; ruff/format clean; mypy at the D-006 baseline with
  every touched file clean.

## Done Condition

- All new unit tests green in CI (no live LLM); full suite green.
- `eval --all` verified live for discovery (8 modules) and the real
  `retrieval` path verified end-to-end (schema_version 2, `suite_run_id` null
  for a standalone run).
- Docs, roadmap row, AI-11 audit status, and worklog updated in the same cycle.

## As-built (implementation and verification)

Shipped as planned. The one deviation from a pure docs-first reading of AI-11
item 3 was the Navigator-confirmed decision to build `eval --all` (Plan B) so
the gate is a real command with one aggregate exit code, not eight
hand-aggregated ones — the difference between a documented aspiration and a gate.

**Runner.** `discover_eval_names()` lists every `evals/*.py` exposing `PROBES`
(sorted; infra excluded for free, no skip-list to drift). `run_all(names,
runner=run_eval, on_report=None)` mints one `suite_run_id`, runs each eval
under it, streams reports through `on_report` for incremental CLI printing, and
returns them in order; `runner` is injectable so the aggregation seam is tested
with no network. `print_all_summary()` names failing evals rather than printing
a bare count. `main` handles `--all` before `--history` (precedence is
deterministic). The whole suite always runs — a red eval never aborts the rest.

**Persistence (database-architect).** `EvalRunRecord.suite_run_id: str | None =
None` added with a default and `schema_version` bumped to 2 — additive to the
append-only JSONL, so pre-v2 lines (no field) still parse via
`EvalRunRecord(**json.loads(line))`. Verified by a legacy-line read test. The
`prompt_hash`-equal + `model`-changed + probe-flip invariant that the playbook
leans on falls straight out of the existing S19 fields; no new provenance was
needed.

**Tests.** New coverage in `test_runner.py` (discovery contract + infra
exclusion, `run_all` ordering/one-id/callback, the real-`retrieval` mechanism
smoke, `--all` exit code 0/1 and failing-name summary, `--all` precedence over
`--history`, `suite_run_id` threading) and `test_persistence.py` (round-trip,
standalone-None, legacy-parse). Full keyless suite green; the sole
`evals/runner.py` mypy error is the pre-existing line-44 `getattr` baseline
(D-006), confirmed unchanged by stashing the touched files (109 either way).

**Live verification.** `discover_eval_names()` returns the eight modules sorted.
`eval retrieval` in a fallback home wrote a record with `schema_version=2`,
`suite_run_id=null`, `model=null` (prompt-free), 10/10 probes passing.

**Found & fixed in-cycle (a real bug, not mine, surfaced by running the eval).**
`.gitignore` line 3 carried an inline comment on the pattern line
(`evals/.history/  # CV9.E2.S19: …`). Git treats trailing text after a pattern
as **part of the pattern**, so `evals/.history/` was never actually ignored
since S19 — eval run noise could have been committed. Fixed by moving the
comment to its own line; `git check-ignore` now confirms the match. This is
exactly the kind of silent operational gap the devops lens named.

## See also

- [Plan](plan.md) · [Test Guide](test-guide.md)
- [AI Engineering Audit — AI-11](../../../../ai-engineering-audit.md)
- [CV9.E2.S19 — Eval Run Persistence & Trend (the history record this gate reads)](../cv9-e2-s19-eval-run-persistence/index.md)
- [Development Guide — Model upgrade playbook](../../../../../process/development-guide.md#model-upgrade-playbook)
