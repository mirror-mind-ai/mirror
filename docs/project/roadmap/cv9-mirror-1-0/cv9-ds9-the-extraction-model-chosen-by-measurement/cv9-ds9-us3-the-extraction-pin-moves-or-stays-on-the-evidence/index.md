[< Parent](../index.md)

# CV9.DS9.US3 — The extraction pin moves, or stays, on the evidence

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a user,
I want to The extraction pin moves, or stays, on the evidence,
So that I can receive the value of this story.

## Outcome

Navigator can validate The extraction pin moves, or stays, on the evidence as an observable behavior.

## Acceptance Behavior

```text
Given the user is ready for The extraction pin moves, or stays, on the evidence
When the user performs the planned action
Then the expected observable behavior is visible
And unrelated Delivery Story scope remains untouched
```

## Scope

- The extraction pin moves, or stays, on the evidence

## Out Of Scope

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

## Validation

Navigator-visible validation route plus automated checks.
