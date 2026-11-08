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
the eval in [the eval report](cr203-persona-routing-eval-2026-11-07.md).

Planned 2026-11-08. The open questions are settled as follows; the first two are design,
the last two stay with the owner:

- **One router for both paths.** The full load and the delta use the same module, so the
  two paths cannot disagree. Reception keeps its own job (memories, Journey); it stops
  deciding the persona.
- **A Journey may name a default persona.** When the router answers none and the session's
  Journey carries `default_persona` in its metadata, that persona is taken, with the
  ordinary signing rule. This is the Journey's own word, not an inference; a Journey
  without the field changes nothing. In the eval it would have turned the book Journey's
  two wrong picks into right ones.
- **The regression set is synthetic.** The 100 labelled turns are the maintainer's private
  prompts and stay out of this public repository; a synthetic set of the same shape goes
  into the tests, and the private set is rerun locally before a model or threshold changes.
- **The duplicate personas are content**, not code: the owner's decision, outside this CR.

### The build, in order

1. **The route behind one module.** `ts/src/mirror/personaRouter.ts` owns the alpha shape:
   it builds one `POST /api/alpha/decisions` request with one Choice among the personas
   (key and descriptor) and one Noul asking whether the subject belongs to any of them,
   and it parses the answer into `{ persona: string | null }`. The persona is taken only
   when the Noul is at or above the threshold AND the Choice names a known key. A missing
   key, a timeout, a refusal, a malformed body or an unknown key each give none; the
   module never throws into a turn. A contract test pins the request and response shapes
   with recorded bodies, so a change in the alpha route fails a test, not a turn.
2. **Configuration.** `MEMORY_PERSONA_ROUTER_MODEL` (default `liquid/d1-ultra`) and
   `MEMORY_PERSONA_ROUTER_THRESHOLD` (default `0.6`), read as the other provider settings
   are (`ts/src/providers/config.ts`); an invalid value reads as unset. The call runs once,
   bounded at 10 s like reception (`hostProviderEnv`); the eval's p95 is 1.1 s.
3. **The delta stops inheriting.** `decideDoorman` stays pure and stops scoring keywords:
   a delta decision carries the query, and the router is called where providers already
   live, in `runDoorman`, before `runDelta` renders. `runDelta` drops
   `decision.persona ?? state.persona`: the turn's persona is the router's answer, or the
   Journey's default, or none. The session row records that answer, so the recorded
   persona becomes the last one chosen, not a running default.
4. **The full load agrees.** `resolveMirrorDefaults` takes the router's answer over the
   sticky persona and reception's guess; an explicit `--persona` on the Mirror form still
   wins, as the person's own word always does.
5. **The line says none, and says it firmly.** `deliveredLine` with no persona reads
   `persona: none`, `answer as the mirror`, carries no signing rule, and tells the model
   not to keep answering or signing as an earlier persona. The exact words are the prompt
   engineer's and are settled in review before the merge.
6. **The ledger sees the call.** Each router call writes one `llm_calls` row through
   `logLlmCall`, content-free like the embedding row: model, latency, outcome, no prompt
   and no answer.
7. **`detectPersona` retires from the doorman.** The keyword scorer stops deciding turns;
   it is removed with its callers once both paths route through the module. No flag and no
   dual path: a rollback is the release line's, as ever.

### Validation

`ts/test/mirror/personaRouter.test.ts` and the doorman's and resolution's existing suites:

- the contract test pins both shapes with recorded bodies;
- below the threshold, above it, unknown key, malformed body, refusal, timeout and no key
  each land where the table above says, and none of them fails the turn;
- a delta no longer inherits the session's persona; a full load and a delta given the same
  subject choose the same persona;
- the Journey default applies only when the router says none, and only when the Journey
  names one;
- the delivered line with none carries no signing rule and the settled wording;
- one `llm_calls` row per routed turn, content-free;
- a synthetic labelled set runs in the suite; the private 100 are rerun locally and the
  numbers go into this record before the merge.

Mutations, each expected caught: taking the persona below the threshold, keeping the
session's persona on none, ignoring the Journey default, treating an unknown key as a
persona, signing on none, and logging content.

## Evidence

- [Persona-routing eval, 2026-11-07](cr203-persona-routing-eval-2026-11-07.md): method,
  every candidate's numbers, held-out validation, latency, cost, limits and conclusions.
- `ts/src/persona/detectPersona.ts`, `ts/src/mirror/doorman.ts` (`decideDoorman`,
  `runDelta`, `deliveredLine`), `ts/src/mirror/defaultResolution.ts`.
- OpenRouter's Decisions API reference (`createApiAlphaDecisions`) and its Jev guide, read
  2026-11-07.

## Outcome

Pending: planned 2026-11-08, awaiting the Navigator's word to build.
