[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR203 · Route a turn's persona by its subject, and let a turn have none

## Problem

On an active Mirror Mode session the doorman picks each turn's persona with `detectPersona`,
a keyword count with no notion of confidence (`ts/src/mirror/doorman.ts`, `decideDoorman`).
Any keyword that hits another persona switches to it; when nothing hits, `runDelta` keeps the
session's persona (`decision.persona ?? state.persona`). The full load does the same through
reception, the sticky persona and the keywords (`ts/src/mirror/defaultResolution.ts`). So a
turn always has a persona, whether its subject belongs to one or not.

Measured on copies of the maintainer's production data (Nautilus for Mirror sessions,
2026-11-03 to 2026-11-07):

- 550 context deliveries, every one with a persona; none without.
- The persona changed in 183 of 539 consecutive turns, about one in three.
- Personas from unrelated domains answered: on a book-writing Journey, health, customer
  support and QA personas, while the Journey's writing persona, configured only in a local
  routing file the Core does not read, was rarely chosen.
- Two personas cover the same domain (`strategist`, `estrategista`).

The Navigator's criterion, 2026-11-07: an invented or wrong persona is much worse than a
plain answer from the agent. A wrong persona puts a false specialist into the answer; no
persona only loses one domain's lens, while identity, voice and memories still apply.

## Expected Behavior

- A turn carries a persona only when its subject clearly belongs to one. Otherwise it has
  none, and the delivered line already says so (`persona: none`, `answer as the mirror`,
  no signing rule). The line also tells the model, in words the prompt engineer settles,
  not to keep answering or signing as an earlier persona.
- The session's persona is no longer inherited by a turn that does not ask for it.
- The decision is made by a Decisions model through OpenRouter's Decisions API
  (`POST /api/alpha/decisions`), with the OpenRouter key the Core already uses: one Choice
  among the personas (key and description) and one Noul asking whether the subject belongs
  to any of them, in one request. The persona is taken when the Noul is at or above a
  threshold.
- Starting point from the eval: `liquid/d1-ultra`, threshold 0.6. Model and threshold are
  configuration, so `typesafe/jev-1.14` or a later model can replace it without a code
  change.
- A missing key, a timeout, a refusal or a malformed answer gives a turn with no persona.
  The turn never waits on the router beyond a short bound, and never fails because of it.
- The call, its answer and its latency are recorded in `llm_calls`, content-free like the
  embedding row.
- The route is `alpha`: its request and response shapes sit behind one module with a
  contract test, so a change in the shape fails a test, not a turn.

## Impact

Every Mirror Mode turn on every runtime. Cost and latency per turn, from the eval: about
US$ 0.00009 and 0.56 s at the median, 1.1 s at p95, on top of the delivery CR199 already
measures. The persona a session records becomes the last one chosen, not a running default.
Nautilus for Mirror needs its own change to show the agent, not a persona read from the
model's text, when the Core says none.

## Plan Or Decision

Captured 2026-11-07 by the Navigator ("abra a CR201 no Core"; 201 was already taken, and 202 was taken on `main` while this waited), after
the eval in [the eval report](cr203-persona-routing-eval-2026-11-07.md). Not planned.

Open before building:

- Whether the full load (the explicit Mirror form, reception) uses the same router, so the
  two paths cannot disagree. The recommendation is yes.
- Whether a Journey may name a default persona the router falls back to. The eval did not
  test this; it would have turned the book Journey's two wrong picks into right ones.
- The regression set: the 100 labelled turns are the maintainer's private prompts and stay
  out of this public repository. A synthetic set of the same shape, labelled the same way,
  goes into the tests; the private set is rerun locally before a threshold changes.
- The duplicate personas are content, not code: the owner's decision.

## Evidence

- [Persona-routing eval, 2026-11-07](cr203-persona-routing-eval-2026-11-07.md): method,
  every candidate's numbers, held-out validation, latency, cost, limits and conclusions.
- `ts/src/persona/detectPersona.ts`, `ts/src/mirror/doorman.ts` (`decideDoorman`,
  `runDelta`, `deliveredLine`), `ts/src/mirror/defaultResolution.ts`.
- OpenRouter's Decisions API reference (`createApiAlphaDecisions`) and its Jev guide, read
  2026-11-07.

## Outcome

Pending: captured, not planned.
