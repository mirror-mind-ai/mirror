[< CV9.DS9](../index.md)

# CV9.DS9.TS2 — The candidates judged on the Navigator's own conversations

**Status:** 🟢 In Progress
**Type:** Technical Story

---

## Technical Story

In order to choose the extraction model on what it writes for the person who uses it,
not only on synthetic probes,
as DS9's measurement,
I want Flash Lite, GPT-6 Luna, and Claude Haiku 5.5 run on the Navigator's own
conversations through the product's own functions, and their outputs judged blind,
so that US3 decides the pin on that evidence.

## Outcome

24 ended conversations from the production home, drawn at random with a recorded
seed, with no exclusions: 16 with a journey (at most 5 per journey) and 8 without.
Each conversation gets the surfaces production gives it:

- memories, tasks, title, summary, and tags with a journey;
- title, summary, and tags without one.

Each runs from Flash Lite as it ships and from Luna and Haiku at reasoning `none`,
every model in its own process, its model verified on every call.

Kimi K3.1 Pro, from a fourth family, ranks every surface blind against an anchored
rubric, with the transcript fenced as data. Its prompt is piloted, then frozen by
hash. It judges six conversations twice, and the Navigator ranks six blind to
calibrate it. The evidence reports:

- per-surface pairwise wins, scores, and error flags, and the length–score
  correlation;
- latency, reliability, and cost per model;
- the recommendation, by a rule fixed before any output was seen: a win needs twice
  as many wins as losses.

It holds only numbers and fixed labels, checked before every commit. Transcripts and
outputs stay on the Navigator's machine, and nothing is written to either home.

## Acceptance Behavior

```text
Given the seeded draw of ended conversations, read once and the database closed
When each model runs the product's functions in its own process
Then every traced call carries its arm's model and setting
And every surface has its minimum of complete triples (13 of 16, 20 of 24)
And no llm_calls row in either home names a candidate or the judge

Given the frozen judge prompt and each surface's outputs rendered alike and shuffled
When Kimi K3.1 Pro ranks them blind, six conversations twice
Then its self-consistency is at least 70%, and the Navigator's calibration agrees
  with it on more than 60% of pairwise orderings
And the unblinded results and the recommendation, by the fixed rule, are in this
  package's evidence, which the content check passes
```

## Scope

- `sample.mjs`, `run_arm.sh`, `replay.mjs`, `judge.mjs`, and `score.mjs` in this
  package's evidence. They import the product's functions and use TS1's trace preload
  by path.
- The judge's prompt (the plan's appendix), schema, seeds, and pilot; the Navigator's
  six-conversation calibration.
- The content check before every commit, and the no-candidate-rows query on both
  homes.
- DS9's TS2 row says Kimi K3.1 Pro judged and the Navigator calibrated.

## Out Of Scope

- The pin decision (US3), prompts, product code, reception, and curation.
- Writing anything to either home.
- An eval-harness replay feature (TS1's D1: the kit stays evidence).

## Carried From TS1

Decided by the Navigator on 2026-10-26, when
[TS1](../cv9-ds9-ts1-extraction-calls-carry-a-reasoning-setting-and-the-candidates-are-re-measured-wi/index.md)
was validated:

- **Both candidates run at `MEMORY_EXTRACTION_REASONING=none`.** With it, neither
  candidate's calls were cut off, and both passed every blocking probe.
- **Haiku's summaries are judged with one weakness named.** At `none`, Haiku opened
  "The conversation centered on…" in 10 of 14 runs of the summary probe, as Flash
  Lite always does. It was accepted as measured, not fixed.
- **Latency differs by candidate.** Luna is the slower one: its reception p95 is
  3.2 s, against Haiku's 1.3 s and Flash Lite's 0.8 s.
- **Flash Lite's rate limits must be counted apart.** It drew HTTP 429 on 31% of its
  eval attempts, so a replay counts its failures separately from its answers.

TS1's Debt Review deferred two items to this story's Plan:

- **D1, the measurement kit.** The scripts exist twice, as evidence outside the eval
  harness (the baseline's and TS1's). Decide here whether a replay needs them a third
  time, or whether request tracing becomes an eval-harness feature.
- **D5, the control's threshold.** TS1's control rule ("moved by more than one run in
  seven", on rates) flagged a single failure once rate limits shrank the clean runs.
  State control thresholds in failures, with a minimum number of clean runs.

## Validation

The scripts' self-checks, the per-arm model assertion, the content check, and the
no-candidate-rows query are the automated layer. The Navigator ranks six
conversations blind before seeing any result, reads the evidence, and skims the local
review page with the models revealed. See the [test guide](test-guide.md).
