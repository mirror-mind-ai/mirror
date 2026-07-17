[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S19 — Eval Run Persistence & Trend

**Status:** Done
**Epic:** CV9.E2 Stabilization & Robustness
**Advances:** AI Engineering Audit **AI-11** (persistence half; additional probes
and the model-upgrade playbook stay follow-ups)
**Planned by:** quality-assurance · **Reviewed by:** ai-engineer, database-architect

---

## User-Visible Outcome

`python -m memory eval <name>` currently prints a report and discards it —
`run_eval` builds a rich `EvalReport` and `print_report` throws it away. Every
eval run since the harness existed is unrecoverable. This story makes each run
durable and trendable: `python -m memory eval <name> --history` shows recent
runs, their scores, and which specific probe flipped — so a model or prompt
change ships with evidence, not vibes.

This closes the other half of the interlock CV9.E2.S18 opened: S18 made
two-pass's *cost* visible; this makes its *quality* (`two-pass-dedup`)
trendable. Together they give the AI-20 two-pass revisit both numbers it needs.

## Design Decisions (confirmed)

- **D1 — storage: JSONL, one file per eval, under the mirror home.** Not an
  `eval_runs` DB table — `memory.db` is the user's memory, not developer
  telemetry about model behavior. `<mirror_home>/eval-history/<eval_name>.jsonl`,
  matching the existing operator-artifact pattern (`web/preferences.json`,
  `backups/`, `mirror-logger.log`). No mirror home resolvable → gitignored
  `evals/.history/<eval_name>.jsonl` fallback (eval noise must never be
  committed). Atomic single-line append; no retention policy (a few KB per
  manual run, dozens a year).
- **D2 — per-eval prompt-drift hash, not a coarse whole-file hash.** Each eval
  module declares `EVAL_PROMPTS: tuple[str, ...]` — the actual prompt
  constant(s) its probes exercise, imported from `intelligence/prompts.py`. The
  hash is over their concatenated content. This makes drift **attributable**:
  editing `CURATION_PROMPT` flips extraction's hash but leaves reception
  untouched — a whole-file hash would falsely flag every eval on any prompt
  edit. `routing.py` and `retrieval.py` declare `EVAL_PROMPTS = ()` — they are
  genuinely prompt-free (routing is keyword-based, retrieval is pure math) —
  and the record must show that as an explicit "no prompt dependency," not a
  fake/blank hash.
- **D3 — cost deferred; run window captured.** Pass-rate is the drift signal
  that matters now. But S18 made every LLM/embedding call loggable, so if the
  record captures the run's start/end timestamps, cost becomes a **later**
  `llm_calls`-window query — no re-run, no threading required now.

## Acceptance Criteria

- Every `eval <name>` run appends one JSONL record: `schema_version`, `eval_name`,
  `started_at`/`ended_at`, `model` (or `None` for prompt-free evals),
  `prompt_hash` (or `None`), `score`, `threshold`, `passed`, and per-probe
  `[id, passed, notes]`.
- `eval <name> --history [N]` renders recent runs, most-recent-first, and
  surfaces any probe that flipped pass/fail relative to the previous run — not
  just the aggregate score (a delicate probe regressing must not hide inside an
  aggregate that still clears threshold).
- **Fail-soft**: a persistence error (unwritable path, disk issue) warns and the
  eval's exit code/report are unaffected.
- First run (no history file) and empty `--history` both render a clear message,
  not a crash.
- The reader **tolerates a malformed trailing line** (a crash mid-write must not
  break every future read).
- `EVAL_PROMPTS`/`EVAL_MODEL` declared on all five existing eval modules,
  accurately (`()`/`None` where genuinely prompt-free).

## Scope

In: the record shape, JSONL persistence + fallback, the `--history` reader with
per-probe flip detection, `EVAL_PROMPTS`/`EVAL_MODEL` on existing evals.

Out (follow-ups, named in the audit): additional probes (scene-synthesis
hallucination detector, consolidation, shadow, title/tags/summary, journal), the
model-upgrade playbook doc section, cost-per-run computation, a release-checklist
gate.

## Done Condition

- Eval runs persist per D1–D3; `--history` shows trend + probe-level flips.
- Fail-soft, first-run-clean, malformed-line-tolerant, non-determinism-tolerant
  (every run is recorded as it occurred, never asserted equal to a prior run).
- Unit tests cover the edge matrix using the existing mocked-probe harness
  pattern (`test_runner.py`) — no live LLM required.

## As-built (implementation)

Shipped as planned. One test-design note: `test_eval_modules.py`'s
`EVAL_MODULES` list was missing `evals.retrieval` (a pre-existing gap,
unrelated to persistence) — added it while extending the contract tests for
`EVAL_MODEL`/`EVAL_PROMPTS`, since the new contract specifically needed to
cover retrieval's prompt-free declaration. One test bug caught during RED→GREEN:
double-patching `importlib.import_module` on the same target within one test
caused a mock-resolution error unrelated to production code; fixed with
`side_effect` (a single patch, two return values) — cleaner test design anyway.

## See also

- [Plan](plan.md) · [Test Guide](test-guide.md)
- [AI Engineering Audit — AI-11](../../../../ai-engineering-audit.md)
- [Decisions — 1.0 flag posture (two-pass quality signal)](../../../decisions.md)
- [CV9.E2.S18 — Embedding Call Observability (the cost half)](../cv9-e2-s18-embedding-call-observability/index.md)
