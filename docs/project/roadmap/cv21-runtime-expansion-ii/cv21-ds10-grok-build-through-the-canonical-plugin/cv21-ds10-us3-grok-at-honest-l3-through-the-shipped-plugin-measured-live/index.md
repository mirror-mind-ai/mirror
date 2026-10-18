[< CV21.DS10 Grok Build Through The Canonical Plugin](../index.md)

# CV21.DS10.US3 — Grok at honest L3 through the shipped plugin, measured live

**Status:** ✅ Done
**Type:** User Story
**Delivery Story:** CV21.DS10 — Grok Build Through The Canonical Plugin

---

## User Story

As a person who runs Mirror on Grok Build through the two steps `mirror init` prints,
I want Mirror's parity claim for Grok to rest on a measurement of the installed binary
through that install — what reaches the model, what is logged, how a session closes —
So that the docs tell me honestly what my mirror does on Grok, and what it does not,
with the version and date it was measured on.

## Outcome

Grok Build's honest parity is measured on grok 1.0.62 through US1's two steps and
recorded with version, binary, date, model, and cost: the 25 skills advertised; the
Operating Instructions reaching the model through the home rule and not through the
plugin's SessionStart context (a no-rule baseline proves the route); the two injection
negatives re-confirmed by canary hooks; every prompt and reply logged as `grok_build`
with the reply carrying its turn id and the session-end Stop silent; the conversation
closed at exit within Grok's 1.5 s bound with `close_tail_pending` set, no LLM call
at the close, and the tail finished at the next start with a provider key — DS4.TS2
measured on Grok for the first time; Mirror Mode on `/mm-mirror` in the TUI, the
question logged without its form and the `◇` answer as its reply. Headless sessions
measure what they can by field; one short TUI session measures the slash form and the
interactive exit. The result — L3 — goes to decisions.md and the roadmap; TS4 writes
the docs from it. A failing check is a named finding for the Debt Review, not a fix in
this story.

## Acceptance Behavior

```text
Given the scratch HOME wired by US1's two steps, a probe hook set, and a provider key
When headless R0 (no rule) and R1 (the rule) run with the same prompt
Then R0 answers UNKNOWN / NONE and R1 answers the four modes and ◇ / NONE

Given any session has ended
When check reads the scratch database and the probe capture
Then the conversation and its runtime session carry grok_build, each prompt has one
     reply with its promptId, the session-end Stop added nothing, ended_at is within
     1.5 s of SessionEnd, close_tail_pending is 1, a backup is newer than ended_at,
     and the ledger holds no LLM call at the close

When finish runs, or the next session starts
Then Finished deferred close tails: 1, a title and a summary, the flag gone

Given the TUI session's /mm-mirror turn
Then a ◇ answer appears, is logged as the reply to a question logged without its form,
     and the 25 mm-* skills were advertised as slash commands
```

## Scope

- The route: `setup`, `headless` (R0, R1, R2 with checks), `check`, `finish`, `tui`,
  `untouched`, `clean`; `probe.mjs` — in [plan.md](plan.md).
- decisions.md, the DS10 candidate row, the CV21 row.

## Out Of Scope

- Raising Grok above L3; `run_terminal_cmd` auto-approved in headless mode.
- TS2's attachment question (closed); `review-copy` (DS5); README, REFERENCE, the
  parity matrix, the contract's Grok reference implementation (TS4, DS11).
- Any change to the hooks, the plugin, or the close tail.

## Validation

Driver: `checkDocLinks`; the headless sessions and every `check`/`finish`.
Navigator: the TUI session from the printed command, every summary read, `untouched`
— details in [test-guide.md](test-guide.md).
