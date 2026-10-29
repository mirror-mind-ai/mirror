[< CV9.DS9](../index.md)

# CV9.DS9.US3 — The extraction pin moves, or stays, on the evidence

**Status:** ✅ Done
**Type:** User Story

---

## User Story

As a person whose conversations Mirror turns into memories, tasks, titles,
summaries, and tags,
I want the model behind those calls chosen on what DS9 measured, on the eval suite
and on my own conversations, and the choice recorded with its evidence,
so that the product writes the better memories the measurement found, and I can
read why the pin moved, or why it stayed, and roll it back if it moved.

## Outcome

The decision is in the decisions log with the evidence it rests on: TS1's
re-measurement at reasoning off and TS2's replay of the Navigator's own
conversations, with the Navigator's blind rankings as the main evidence.

If the pin moves, the move is one migration, in one commit:

- `DEFAULT_EXTRACTION_MODEL`, the reasoning effort each model sends when
  `MEMORY_EXTRACTION_REASONING` is unset (a per-model table: Haiku `none`, Flash
  Lite nothing), and `MODEL_PRICES` change together;
- `eval --all` is green on the new pin in the development home's eval history, by a
  rule fixed before the run, after a fresh baseline on the old one, as the release
  gate requires;
- `runtime status` shows the new pin and the effort it sends;
- `REFERENCE.md` describes the new defaults and the rollback, operably: the line,
  the file it goes in, and the check; set `MEMORY_EXTRACTION_MODEL` to the old pin
  and the request is the one the old pin was measured with;
- the release note's section is drafted in this package, for the release that
  carries the swap: what a user sees and how to roll back;
- a dated follow-up in Done reads the ledger a week later: reception latency, cost,
  and non-200 calls against the plan's numbers.

If the pin stays, nothing in the code changes, and Flash Lite's rate-limit exposure
(TS1's D3) is captured as a Change Request.

Either way, the ledger's gap (TS1's D2: `llm_calls` cannot say which reasoning
setting a call carried) is decided: built here or captured as a Change Request.

## Acceptance Behavior

```text
Given DS9's evidence: TS1's reasoning-off runs and TS2's replay
When the Navigator decides the pin at this story's Plan approval
Then the decisions log records the decision, the evidence, and the trade-offs weighed
And the DS9 candidate table and this package carry the same decision

Given the pin moved
When Mirror makes any extraction-family call with no environment override
Then the request names the new pin and carries the effort decided for it
And the ledger prices the call from MODEL_PRICES, never null
And `runtime status` names the pin and the effort on its models line
And `eval --all` on the new pin is green by the plan's rule, and its records name the pin and the effort

Given the pin moved and a user names the new pin explicitly, or sets an effort that is not one
When Mirror makes an extraction-family call
Then the request is the same as with nothing set: the new pin at its default effort

Given the pin moved and a user sets MEMORY_EXTRACTION_MODEL to the old pin
When Mirror makes an extraction-family call
Then the request is the old pin's, with no reasoning field, as it was before the swap
And `REFERENCE.md` and the release note say so

Given the pin stayed
When the story closes
Then no code changed, and a Change Request names Flash Lite's rate-limit exposure
```

## Scope

- The decision, recorded in `docs/project/decisions.md` with its evidence.
- If it moves: the pin, the per-model reasoning default, and the price table in one
  commit; the fresh baseline and the green `eval --all`; `runtime status`;
  `REFERENCE.md`; the release note's draft in this package; the tests and goldens
  that name the pin; the post-swap ledger follow-up.
- If it stays: the Change Request for Flash Lite's rate limits.
- The disposition of TS1's D2 (the ledger) and D3 (the rate limits).

## Out Of Scope

- A model per surface, prompt changes (CR180 stays a Change Request), the embedding
  pin, `consult`'s catalogue, and provider routing or fallback: DS9's non-goals.
- The release itself: version bump, tag, stable promotion, push, and publication are
  separate gates, and DS9's release intent is recorded at the Delivery Story.
- Sibling Delivery Story scope.

## Carried From TS1

TS1's Debt Review (2026-10-26) deferred two items to this story's Plan:

- **D2, the ledger.** `llm_calls` cannot tell which calls ran with which reasoning
  setting. That matters once the default changes here.
- **D3, Flash Lite's rate limits.** Flash Lite drew HTTP 429 on 31% of its eval
  attempts across TS1's runs, and the development home logged one rate-limited
  reception on 2026-10-25. The production home's log shows none. If the pin stays, capture this as a Change Request.

## Carried From TS2

TS2's result, accepted as measured by the Navigator on 2026-10-28
([evidence](../cv9-ds9-ts2-the-candidates-judged-on-the-navigator-s-own-conversations/evidence/2026-10-26-replay/README.md)):

- **The Navigator's own blind rankings are the main evidence.** The blind judge does
  not stand: it agreed with itself (0.83) but not with the Navigator (0.55). On the 26
  surfaces of six conversations the Navigator ranked:
  - Haiku came first 16 times;
  - Haiku beat Flash Lite 17–9;
  - Haiku beat Luna 20–6.
- **The judge's arithmetic points the same way:** both candidates beat Flash Lite, and
  Haiku is ahead of Luna.
- **The trade-offs to weigh against Flash Lite:**
  - Haiku costs about 40% more: $1.06 against $0.77 for the production home's last 30
    days.
  - Its reception is about 0.5 s slower at p95 (TS1).
  - Its summaries are weaker as standalone notes. That is partly the prompt's doing
    ([CR180](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr180-the-summary-prompt-s-opening-rule-invites-the-framing-its-standalone-rule-forbids.md)),
    not only the model's.
- **Either candidate runs at reasoning `none`** (TS1).

## Decision

Decided 2026-10-28 at Plan approval: **move to `anthropic/claude-haiku-5.5` at reasoning
`none`.** The record, with its evidence and the reasoning-default rule, is in the
[decisions log](../../../decisions.md#the-extraction-pin-moves-to-claude-haiku-55-at-reasoning-none-and-a-pins-reasoning-default-is-the-models);
the gate in [evidence/2026-10-28-gate](evidence/2026-10-28-gate/README.md); the
release-note section in [v0.38.0's release note](../../../../releases/v0.38.0.md). D2 is
[CR181](../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr181-the-ledger-cannot-say-which-reasoning-effort-a-call-carried.md);
D3 is retired by the move for the default pin.

## Validation

Navigator-visible validation route plus automated checks: see
[plan.md](plan.md) and [test-guide.md](test-guide.md).
