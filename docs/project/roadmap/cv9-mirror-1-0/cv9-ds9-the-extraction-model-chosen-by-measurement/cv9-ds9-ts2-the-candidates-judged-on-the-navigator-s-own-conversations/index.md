[< Parent](../index.md)

# CV9.DS9.TS2 — The candidates judged on the Navigator's own conversations

**Status:** 🟡 Planned
**Type:** Technical Story

---

## Technical Story

In order to support the delivery capability,
As an engineering team/system component,
I want to The candidates judged on the Navigator's own conversations,
So that the expected technical outcome is available.

## Outcome

Navigator can validate The candidates judged on the Navigator's own conversations as an observable behavior.

## Acceptance Behavior

```text
Given the system is ready for The candidates judged on the Navigator's own conversations
When the planned technical change is applied
Then the expected technical outcome is observable
And unrelated Delivery Story scope remains untouched
```

## Scope

- The candidates judged on the Navigator's own conversations

## Out Of Scope

- Sibling Delivery Story scope.

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

Navigator-visible validation route plus automated checks.
