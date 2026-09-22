[< Parent](../index.md)

# CV22.DS10.TS3 — Eval harness transfer to `ts/evals/`

**Status:** 🟢 In Progress — pulled, panel-reviewed, and approved 2026-09-22; plateaus 1–3 of 6 done
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

## Plateau Progress

| # | Plateau | State | Evidence |
|---|---|---|---|
| 1 | Harness core, zero modules | ✅ `e1de1321` | 54 tests; `--history scene` renders the retired module's Python records from the real home |
| 2 | Keyless path end to end | ✅ `908bf28c` | `19/19`, MRR 0.9074; per-probe diff vs Python identical; `retrieval` → CI, `routing` retired |
| 3 | Fixtures out of the source | ✅ this commit | 51/51 probe inputs captured and verified against live Python |
| 4 | The eight live modules | ⬜ next | — |
| 5 | First full run and the diff | ⬜ | — |
| 6 | Docs and deletion | ⬜ | — |

### Plateau 3 evidence

Fixtures are **captured, not transcribed**. Every `memory.*` callable each
module imported is replaced by a recorder, every probe is executed offline, and
the arguments it passed are written to `ts/evals/fixtures/captured/`. What the
fixture holds is by construction what Python fed the pipeline.

| module | probes | pipeline calls | blocking | auto-generated fields normalized |
|---|---:|---:|---:|---:|
| `conversation_summary` | 1 | 1 | 1 | 2 |
| `journal` | 5 | 5 | 0 | 0 |
| `proportionality` | 5 | 5 | 0 | 34 |
| `consolidate` | 5 | 5 | 1 | 0 |
| `shadow` | 5 | 5 | 1 | 3 |
| `title_tags` | 7 | 7 | 2 | 16 |
| `extraction` | 11 | 11 | 1 | 88 |
| `reception` | 12 | 12 | 0 | 0 |
| **total** | **51** | **51** | **6** | |

Six blocking probes, matching the six injection probes the Plan named.

`uv run python -m evals._check_fixture_equality` → *51/51 probes compared
against live Python inputs; clean.* Verified to actually detect drift: a
one-word edit to a `journal` transcript fails the check by probe id and exits
1; reverting returns it to 0.

**Scope of the check, stated honestly.** It proves the *inputs* match. It
cannot prove *expectations* match, because those live in each probe's
assertion rather than in the data — so, like Python, the TS modules carry
their assertions in code and read only transcripts from the fixture. A misread
expectation is caught by the plateau-5 per-probe verdict diff, where the TS
probe would disagree with the Python record on identical input.

**Two non-determinism traps found and closed.** `Message`/`Memory` are
pydantic models whose `id` and `created_at` carry default factories, so a
naive capture differed on every run. Rather than guess which fields are
auto-generated — `shadow` sets real ids its assertions depend on — the capture
runs twice and normalizes exactly what moved. The second run reloads the
module, because `shadow` builds an `Identity` at import time that two captures
in one process would share while a fresh process would not.

**Redaction.** `reception` passes the live persona and journey catalogue read
from the production database. That is the Navigator's own data and it drifts
with the catalogue, so only the query is captured; both engines keep reading
the catalogue at runtime, as Python does.

## Where To Resume

Plateau 4: port the eight live modules, smallest first, each reading its
captured fixture and carrying its assertions in code. Six probes marked
`blocking`. No live call has been made yet — plateaus 1–3 cost nothing.
