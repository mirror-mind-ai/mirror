[< Parent](../index.md)

# CV22.DS10.TS3 — Eval harness transfer to `ts/evals/`

**Status:** 🟡 Planned — pulled 2026-09-22, panel-reviewed the same day, Plan pending Navigator approval
**Type:** Technical Story
**Artifacts:** [plan.md](plan.md) · [test-guide.md](test-guide.md)

---

## Technical Story

In order to retire the Python core without silently dropping the model-behavior
release gate,
As the port owner,
I want the eval harness to live at `ts/evals/` and run against the TypeScript
pipeline through the live transport,
So that a green run means the engine users actually run — and an obeyed
injection probe can no longer hide inside a passing score.

## Outcome

`ts/evals/` carries the Python contract (`PROBES`/`THRESHOLD` per module,
capability discovery, JSONL history, threshold exit code) with injection probes
individually blocking (D-017); every module has a recorded disposition
(`routing` retired, `retrieval` migrated to CI, `retrieval_relevance` kept, eight
live modules ported, `scene` already gone); fixtures are engine-neutral JSON;
the first TS run is diffed per probe against the 2026-09-21 Python records;
the development guide and engineering principles name the TS harness; then
`evals/`, its tests, and `python -m memory eval` are deleted and
`scripts/check_retired_surfaces.py` asserts it.

## Acceptance Behavior

```text
Given OPENROUTER_API_KEY is configured
When  `npm run eval -- --all` runs from ts/
Then  nine modules run under one suite_run_id, each probe reports, a failed
      blocking probe fails its module regardless of score, one schema-3 record
      per module is appended to the same <mirror_home>/eval-history/ the Python
      records occupy, and the exit code is 0 iff every module passed
And   evals/ and tests/unit/memory/evals/ no longer exist, the eval entry is
      gone from src/memory/__main__.py, and existing history files are untouched
```

## Scope

See [plan.md](plan.md) §Scope A–F. In one line: harness core, blocking probes,
JSON fixtures, dispositions, history rule, docs and deletion.

## Out Of Scope

New probes, prompt or threshold changes, a judge-LLM, any change to a TS
pipeline function, eval in CI, a front-door route, D-010, schema version 3,
`ts/parity/` deletion (TS5).

## Gate Items (from the [DS10 package](../index.md#eval-harness-deletion-gate))

1. TS harness at `ts/evals/` carrying the Python contract;
2. run against the live transport, fixtures engine-neutral;
3. each module's disposition explicit, including the `scene.jsonl` question;
4. injection probes individually blocking (D-017);
5. development guide and engineering principles name the TS harness;
6. delete `evals/` and the `eval` entry only after 1–5 hold.

## Validation

[test-guide.md](test-guide.md). The keyless route is free and runnable after
plateau 2; the full live run is Navigator-run once at plateau 5.

## Where To Resume

Plan authored and panel-reviewed 2026-09-22 (ai-engineer, prompt-engineer,
devops-engineer, database-architect, quality-assurance; five findings folded —
see [plan.md §Review](plan.md#review)). Awaiting Navigator approval of the four
decisions in [plan.md](plan.md#decisions-this-plan-asks-the-navigator-to-take).
