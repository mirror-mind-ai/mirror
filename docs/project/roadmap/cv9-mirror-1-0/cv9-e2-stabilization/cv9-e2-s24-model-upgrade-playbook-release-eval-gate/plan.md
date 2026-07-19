[< CV9.E2.S24](index.md)

# CV9.E2.S24 — Plan

## Problem

AI-11 has three fix items. Item 1 (persist eval reports) shipped as S19. Item 2
(probes for uncovered surfaces) shipped scene (S20), shadow (S22), and
consolidation (S23). **Item 3 is unaddressed**: there is no way to run the suite
as a whole, and no gate uses it. Until a gate exists, AI-11's core complaint —
*"no gate uses them"* — is true regardless of probe count.

## The decision: docs-only vs. a real command

Item 3's literal text is "run eval suite" + "make a full eval pass an explicit
release-checklist item." That reads as documentation. But a gate that is eight
hand-copied `eval <name>` commands with eight human-aggregated exit codes is
exactly the brittle, skippable shape AI-11 criticizes.

**Chosen (Navigator-confirmed): Plan B** — build `eval --all` so the gate is one
command with one aggregate exit code, then point the playbook and release
checklist at it. Small, well-bounded, and it makes the docs honest.

## Design

### `eval --all` (engineer)

- `discover_eval_names()` — an eval is any `evals/*.py` exposing `PROBES`.
  Discovery by capability, not a hand-list, so journal/title-tags probes (item 2)
  join the gate automatically when they land, and infra modules are excluded for
  free. Import-safe (model calls live in `probe.run()`, not import).
- `run_all(names, runner=run_eval, on_report=None)` — mint one `suite_run_id`,
  run each eval under it, stream reports via `on_report` for incremental CLI
  output, return them in order. `runner` injectable → the aggregation seam is
  unit-testable with no network. The whole suite always runs (no fail-fast).
- `print_all_summary(reports)` — names failing evals, never a bare count.
- `main` handles `--all` before `--history` (deterministic precedence); exit 0
  iff every eval passes.

### `suite_run_id` (database-architect)

One `eval --all` invocation writes eight independent records; nothing tied them
together, so "which full pass did I run at release time?" was unanswerable. Add
`suite_run_id: str | None = None` to `EvalRunRecord` (additive, `schema_version`
→ 2). Default preserves backward read compatibility for pre-v2 lines. The
`prompt_hash`-equal + `model`-changed + probe-flip = model-attributable
regression invariant needs no new field — it already falls out of S19.

### Playbook + gate (prompt-engineer, ai-engineer, devops-engineer)

- **Baseline-first, front-loaded** — the most-skipped step; the comparison
  depends on it (ai-engineer).
- **Single-run smoke vs n≥5** — a single `--all` is a release smoke; evals are
  non-deterministic, so confirm a flipped probe with n≥5 before calling it a
  regression (ai-engineer).
- **Imperative, falsifiable gate wording** with named triggers
  (`EXTRACTION_MODEL`, `EMBEDDING_MODEL`, `prompts.py`) and a conscious-waiver
  path — "no green, no release" (prompt-engineer, quality-assurance).
- **Stop hand-listing eval names in prose** where the command can carry the
  truth; fix the already-drifted §7 list as proof of the failure mode
  (prompt-engineer).
- **Rollback** = revert the pin commit, or the `MEMORY_EXTRACTION_MODEL` env
  override for an installed user (devops-engineer).

## TDD

Deterministic, no-network tests: discovery contract + infra exclusion,
`run_all` ordering/one-id/callback, `--all` exit code 0/1 and failing-name
summary, `--all` precedence over `--history`, `suite_run_id` threading,
persistence round-trip + legacy-parse. Plus QA's **real-mechanism smoke**:
`run_all(["retrieval"])` with the real runner (hermetic eval — no network, no
DB) so the plumbing is proven on real `EvalReport` objects, not mocks.

The live `eval --all` is a human release step — **not** added to CI (evals cost
money and are non-deterministic; keyless CI is a standing principle).

## Lens ledger (what each review changed)

- **quality-assurance (refined):** acceptance criteria; named-failure summary;
  the keyless real-mechanism smoke; discovery contract test; conscious-waiver
  path in the gate; `--all --history` precedence edge.
- **ai-engineer:** baseline→swap→re-run→per-probe diff; single-run vs n≥5;
  aggregate cost deferred, not forgotten.
- **prompt-engineer:** imperative/falsifiable gate wording; front-loaded
  baseline; stop-hand-listing (fix §7 as evidence); a concrete `--history` flip
  example.
- **devops-engineer:** exit code as the operational contract; isolation and
  rollback in the playbook; nightly-CI option named as radar.
- **database-architect:** `suite_run_id` correlation; the `prompt_hash`/`model`
  regression invariant; retention named as additive debt; keep JSONL (no DB
  table).

## Risks

- **Over-scope creep** — mitigated by WIP discipline: cost line, nightly CI,
  retention, `--deep` all deferred with named homes.
- **Discovery contract test brittleness** — intentional: adding an eval must
  consciously join the gate. The test is the checkpoint, matching "critical
  journeys grow deliberately."
