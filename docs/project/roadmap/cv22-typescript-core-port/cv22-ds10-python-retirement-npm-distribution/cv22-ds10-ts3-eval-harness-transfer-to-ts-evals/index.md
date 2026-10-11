[< Parent](../index.md)

# CV22.DS10.TS3 — Eval harness transfer to `ts/evals/`

**Status:** 🟢 Validated and reviewed — all 6 plateaus done, Validation accepted, Debt Review closed with three deferrals, handoff pass done 2026-09-22; awaiting Coherence and Done
**Type:** Technical Story
**Artifacts:** [plan.md](plan.md) · [test-guide.md](test-guide.md) · [validation.md](validation.md) · [review.md](review.md)

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
| 4 | The eight live modules | ✅ this commit | 51 live probes; every module's score, model, and `prompt_hash` match Python |
| 5 | First full run and the diff | ✅ this commit | `9/9 SUITE PASS`; **70/70 probe verdicts identical to Python**, zero differences in either direction — [validation.md](validation.md) |
| 6 | Docs and deletion | ✅ this commit | `evals/` + 252 tests + the `eval` entry gone; `eval-harness` row asserts it; all suites green |

### Plateau 6 evidence

**Deleted:** `evals/` and `tests/unit/memory/evals/` — 32 files, 252 Python
tests (2540 → 2288), plus the `eval` help text and dispatch in
`src/memory/__main__.py`. `python -m memory eval --all` now answers
`Unknown command: eval` and exits 1.

**Docs now name the TypeScript harness**, not just in the measurement
paragraph but in the places that tell a reader what to *do*: the trigger list
points at `ts/src/extraction/prompts.ts` and `ts/src/providers/config.ts`, the
model-upgrade playbook swaps the pin in the TS config, the architecture tree
lists `ts/evals/`, and the "which gate sustains each rule" section counts nine
modules and records that six of them are blocking. The blocked-run policy and
the history-retention rule are written where the commands are, so a human
reading a red gate months from now knows what it asks of them.

**The retired-surface check earned its place immediately.** It failed on first
run against a stale sentence in `ts/evals/harness/fixture.ts` claiming that
`_check_fixture_equality.py` "keeps these honest while Python exists" — true
when written, false three commits later. Fixed by correcting the prose, not by
adding an exemption: an exemption claims a mention is correct, and that one was
not.

**History is untouched**, as the retention rule promises: `scene.jsonl`,
`routing.jsonl`, and `retrieval.jsonl` remain at their original sizes, and
`npm run eval -- scene --history` still renders a module that no longer exists.

### Plateau 4 evidence — per-module smokes against Python's baseline

Each module smoke-run alone as it landed, one at a time. Python scores are the
2026-09-21 records in `<mirror_home>/eval-history/`.

| module | TS | Python | `prompt_hash` | failing probes |
|---|---|---|---|---|
| `conversation_summary` | 1/1 ✓ | 1.00 | match | — |
| `journal` | 5/5 ✓ | 1.00 | match | — |
| `proportionality` | 5/5 ✓ | 1.00 | match | — |
| `consolidate` | 5/5 ✓ | 1.00 | match | — |
| `shadow` | 5/5 ✓ | 1.00 | match | — |
| `title_tags` | 6/7 = 0.86 ✓ | 0.86 | match | `title-trivial-empty` — **same as Python** |
| `extraction` | 9/11 = 0.82 ✓ | 0.82 | match | `two-pass-dedup`, `conversation-summary` — **same as Python** |
| `reception` | 10/12 = 0.83 ✓ | 0.83 | match | `open-existential-no-persona`, `shadow-touch-vague-discomfort` — **same as Python** |

Every `prompt_hash` and pinned model is identical to Python's record, and every
failing probe is one of the five already failing in both recorded Python runs.
No TS-side parse, coercion, or orchestration difference surfaced — which is
the blind spot the transfer exists to close.

All six blocking injection probes resisted. The first one is worth reading for
what it proves about the ported heuristic: the summary came back as *"the AI
was instructed to disregard the initial pleasantry..."*, which trips the D-009
narrator-frame markers and is scored as resistance rather than compliance —
the distancing-aware judgment working on live output, not on a golden.

**One divergence recorded, not silently resolved.** `reception`'s catalogue
loader mirrors the Python EVAL's `_load_metadata` (`content[:200]` plus
`routing_keywords`), not TypeScript's production `resolveMirrorDefaults`, which
prefers a generated descriptor when one exists. Matching the eval keeps the
plateau-5 diff meaningful; whether the eval should instead measure the
production path is a real question and belongs to a later story, since changing
it now would move the numbers for a reason unrelated to the port.

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

## Lifecycle Record

| stage | outcome |
|---|---|
| Validation | **passed**, Navigator accepted 2026-09-22 — [validation.md](validation.md) |
| Debt Review | **defer** × 3 — D-020 (no spend recorded), D-021 (reception loader diverges; routing has no gate), D-022 (blocking probes read "resisted" on an unanswered provider). **Paid:** D-017. **Dropped:** D-005 — [review.md](review.md) |
| Handoff review | narrowed security-engineer pass, a recorded decision rather than a default; no blockers, one medium finding (D-022) |
| Coherence | pending |
| Done | pending |

## Where To Resume

Coherence, then Done. Done needs a history action (six plateau commits plus the
lifecycle commits, all pushed and CI-green), a roadmap update (DS10 moves to
4/8; this package and the DS10 index already say Done for TS3), and a next
recommendation (TS4, retire the unported surfaces with cutoffs).

Three ledger items carry forward with triggers; none blocks the next story.
D-022 is the one to remember: a green injection verdict currently cannot tell
resistance from an outage, and the verification command that should fail
(`OPENROUTER_API_KEY=invalid npm run eval -- title_tags`) today passes.
