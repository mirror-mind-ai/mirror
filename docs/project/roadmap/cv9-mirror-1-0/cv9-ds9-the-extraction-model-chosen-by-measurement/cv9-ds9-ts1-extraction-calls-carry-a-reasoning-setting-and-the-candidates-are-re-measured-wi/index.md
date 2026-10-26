[< CV9.DS9](../index.md)

# CV9.DS9.TS1 — Extraction calls carry a reasoning setting, and the candidates are re-measured with reasoning off

**Status:** 🟢 In Progress
**Type:** Technical Story

---

## Technical Story

In order to judge the candidate extraction models on their answers rather than on a
token budget their reasoning spends,
as the transport every extraction-family call goes through,
I want to carry an operator-chosen reasoning setting to OpenRouter, sending today's
request unchanged when none is chosen and nothing at all when the value is not one
OpenRouter defines,
so that GPT-6 Luna and Claude Haiku 5.5 can be measured, and later run, with reasoning
off.

## Outcome

`MEMORY_EXTRACTION_REASONING` names an OpenRouter reasoning effort (`none` turns
reasoning off). When it is set, every extraction-family call sends
`reasoning: { effort }`. `consult` never does, because it picks its own model. When it
is unset, the request is byte for byte what it is today.

A value OpenRouter does not define, such as `off`, sends nothing and fails nothing.
`mirror runtime status` shows it as invalid and `mirror runtime diagnose` reports it.
A failing call would count as an extraction attempt, and three attempts quarantine a
conversation for good
([CR178](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr178-a-configuration-error-counts-as-an-extraction-attempt-and-nothing-releases-a-quarantine.md)).

The setting shows wherever an operator looks:

- `mirror runtime status` shows a set value next to the extraction model;
- every model-backed eval record carries it next to `model`;
- `eval <name> --history` labels a probe flip across a model or reasoning change, so
  a change of configuration is not read as noise.

With the setting in place, the suite is run again. Flash Lite runs as it ships, as the
same-time control, and Luna and Haiku run at `none`, seven runs each. The comparison
with the [2026-10-26 baseline](../evidence/2026-10-26-baseline/README.md) holds the
candidates to four criteria:

1. all six blocking probes pass in every clean run, with real answers;
2. no answer is cut off at its token budget, or each one that is is named;
3. the four probes Flash Lite has always failed are counted against the reasoning-on
   baseline;
4. Flash Lite's own results match its baseline.

TS1 says whether reasoning off is safe and whether the candidates' gains survive it.
The quality verdict is TS2's.

## Acceptance Behavior

```text
Given MEMORY_EXTRACTION_REASONING is unset
When any extraction-family call is made
Then the request body and the status line are exactly today's

Given MEMORY_EXTRACTION_REASONING=none
When an extraction-family call is made
Then the request body also carries reasoning: { effort: "none" }
And a consult call carries no reasoning field

Given MEMORY_EXTRACTION_REASONING=off
When an extraction-family call is made
Then it is made without a reasoning field, and nothing fails
And runtime status shows reasoning=invalid (off), and runtime diagnose reports it

Given Luna and Haiku at MEMORY_EXTRACTION_REASONING=none
When eval --all runs seven times per model, with Flash Lite as the control
Then each candidate passes all six blocking probes in 7 of 7 clean runs, none vacuous
And no title call is cut off at its budget, or each one that is is named
And the comparison with the baseline is recorded in this story's evidence
```

## Scope

- `readExtractionReasoning()` beside the model pins: it reads the variable, never
  throws, and reports an invalid value.
- A per-role table, checked by the compiler, of which roles carry the setting; the
  `reasoning` field in `LiveLlmProvider.complete()`.
- The setting in `mirror runtime status`, in a `runtime diagnose` finding when
  invalid, in the eval run record, and in `eval <name> --history`, with flips across a
  change of configuration labelled.
- REFERENCE gains a Model Pins table: `MEMORY_EXTRACTION_MODEL`,
  `MEMORY_EMBEDDING_MODEL`, the new variable, and where each is read from. The model
  upgrade playbook names the setting.
- The re-measurement, its four pass criteria, and its evidence in this package.

## Out Of Scope

- Changing the default pin, giving it a default reasoning setting, or recording the
  setting in the `llm_calls` ledger (US3).
- The comparison on the Navigator's own conversations (TS2).
- Configuration errors in general counting as extraction attempts, and releasing a
  quarantine (CR178).
- Prompts, `temperature`, per-role token budgets, a `low` arm, and a per-role
  reasoning setting.

## Result (2026-10-26)

Implemented at `4a74f098`, and re-measured at that commit in two sets of seven runs
per model ([evidence](evidence/2026-10-26-reasoning-off/README.md), $0.25).

**Met:**

- **Criterion 1:** with reasoning off, both candidates passed all six blocking
  probes in 14 of 14 runs, with real answers.
- **Criterion 2:** none of their 1,428 calls was cut off at its budget.
- **Luna at `none`** kept every fix it had and improved two: `two-pass-dedup` from
  2/7 to 7/14, and `open-existential-no-persona` from 5/7 to 14/14.
- **Latency fell for both candidates.** Haiku's reception p95 is 1.3 s, against
  3.0 s with reasoning on.

**Two stop conditions were met.** No further arm ran, and the Navigator decided
both on 2026-10-26:

1. **Haiku at `none` lost the `conversation-summary` fix:** 6/7 with reasoning on,
   4/14 off. Every failure opens "The conversation centered on…", Flash Lite's own
   failure. **Decided: accepted as measured.** Both candidates go to TS2 at `none`,
   and Haiku's summaries are judged there with this weakness named. A `low` arm and
   a per-role setting stay available to US3 if TS2 favors Haiku.
2. **The control moved twice in a row:** Flash Lite's `tags-exclude-noise` went
   from 7/7 to 5/6 and then 6/7, with the same tag ("canonical fix") counted as noise
   each time. Flash Lite also drew HTTP 429 on 31% of its attempts. **Decided: the
   comparison is accepted.** `tags-exclude-noise` is recorded as unstable for Flash
   Lite, as `reception/shadow-touch-vague-discomfort` already was.

Validated by the Navigator on 2026-10-26.

## Validation

The automated suite pins the request bodies, the reader, the role table, the record,
the status line, and the diagnose finding. The frozen `runtime-status` and
`runtime-diagnose` goldens pass unedited. The re-measurement against the live
provider is the end-to-end check: the Navigator reads its comparison and reproduces
one module run in a scratch home. See the [test guide](test-guide.md).
