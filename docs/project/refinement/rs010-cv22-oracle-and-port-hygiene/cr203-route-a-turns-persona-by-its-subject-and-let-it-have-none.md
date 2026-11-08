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

## Implementation

Built 2026-11-08, on the plan above.

- **`ts/src/mirror/personaRouter.ts`** owns the route. `decisionsRequest` builds the eval's
  body (the request bounded to 2,000 characters, each persona's text to 280 in the Choice and
  90 in the Noul's list); `readDecisionsAnswer` reads the answer against the personas offered
  and the threshold (inclusive); `LivePersonaRouter` posts it once to
  `https://openrouter.ai/api/alpha/decisions`, bounded by `MEMORY_LLM_TIMEOUT_RECEPTION`, with
  no retry, and never throws. `routeTurnPersona` is the one rule both paths call: the router's
  answer when it names a persona that exists, else `journeyDefaultPersona`, else none.
- **Configuration** (`ts/src/providers/config.ts`): `MEMORY_PERSONA_ROUTER_MODEL` and
  `MEMORY_PERSONA_ROUTER_THRESHOLD`, an empty or invalid value reading as unset. A host
  (`deliverMirrorContext`) passes no environment, so it routes with the defaults.
- **The delta** (`doorman.ts`): `decideDoorman` no longer scores keywords and stays pure;
  `runDelta` routes the persona and embeds the prompt side by side (`Promise.all`), so the
  routing call does not add to the delivery CR199 measures. The session row records the
  turn's answer, none included.
- **Which persona sections the conversation holds** is a new session list,
  `doorman_personas`, beside the delivered memories: a section is delivered the first time
  its persona answers, a full load starts the list with its own persona, and a compaction
  clears it. Before, "the session's persona" stood for that, and a turn with none would have
  made a writer, none, writer sequence deliver the writer's section twice.
- **The full load** (`defaultResolution.ts`): the persona the person named, else
  `routeTurnPersona` once the Journey is resolved; a load without a query makes no call and
  takes the Journey's default. Neither the sticky persona nor reception's pick decides any
  more, and `writeMirrorState` records a load's none instead of keeping the earlier persona.
- **The line** (`deliveredLine`): with no persona it reads
  `answer as the mirror; no persona this turn: do not sign, and do not answer as an earlier persona`
  (`NO_PERSONA_CLAUSE`). Nautilus for Mirror reads "no persona" as a first line without
  `sign ◇`, which this keeps.
- **The ledger**: one `llm_calls` row per call made, `role = persona_routing`, with the
  model, latency and the cost the route reports, and an empty prompt and response in every
  logging mode.
- **Replay**: `MIRROR_TS_PERSONA_ROUTER_REPLAY` names recorded Decisions bodies a replay run
  answers from, read through `readDecisionsAnswer`; without it a replay routes nothing. The
  hook and front-door suites route through it.

### Where the build departs from the plan

- **Each persona is offered with its own `description` first**, then its generated
  descriptor, then the start of its content. Built descriptor-first, the rerun below gave 6
  wrong picks where the eval gave 2: 11 of the 28 production personas had no descriptor and
  were offered a heading. The eval had offered the description; with it first, 3 wrong.
- **`detectPersona` leaves turn routing only.** The `detect-persona` command, the MCP
  `detect_persona` tool and the package export stay: they are public surfaces of their own,
  and removing them is a separate decision.
- **Reception's prompt is unchanged.** It still lists the personas, because its bytes are
  digest-pinned; only its pick is ignored. Trimming the prompt is its own change.
- **No command sets a Journey's `default_persona` yet.** The read is built and tested; the
  setter (a command and a host call) is a follow-up.
- **The none clause is a draft**, for the prompt engineer to settle; it is one constant.
- **A full load's worst case grows**: reception, then routing, each bounded at 10 s. A delta
  is unchanged at about 10 s, since its two calls run together.

## Validation

- `ts/test/mirror/personaRouter.test.ts` (14): the request pinned against the eval's body
  and its bounds; the answer at, below and above the threshold, an unknown persona, nine
  malformed bodies; the live router's single bounded call with the key it was given; the
  settings and invalid thresholds; no key, no personas and a failed call; the description,
  descriptor and content order; the Journey default and when it counts; the ledger without
  content in `full` mode; the replay router and which router each transport gets.
- `doorman.test.ts` (23): a delta never inherits; none says none and records none; the
  Journey default with and without a router; a section once across writer, none, writer, the
  full load and a compaction; the routing call made beside the embedding (a router that
  answers only once the embedding has started); a full load with none clears the earlier
  persona; the line with and without a persona.
- `defaultResolution.test.ts`, `deliverContext.test.ts`, `mirrorModeCli.test.ts` and the
  Claude and Antigravity hook suites: reception no longer decides; the sticky persona and
  keywords no longer decide; a named persona is not routed; no query, no call; the command
  path records none on a turn that asks for no persona.
- **Mutations**: 24 tried, 23 caught. The survivor drops the guard that skips a ledger row
  for a call never made; `llm_calls.model` is `NOT NULL`, so the row fails and is swallowed
  either way: equivalent.
- `npm test`, clean environment, throwaway `HOME`: 3,838 of 3,842 pass, 3 skipped; the one
  failure, `the two cores describe a broken index with the same driver text`, fails the same
  way on `main` on the maintainer's machine. `tsc` and Biome clean.
- **The private 100, rerun through this code** (`LivePersonaRouter` and `routablePersonas`
  on a copy of the production home, 28 personas, `liquid/d1-ultra` at 0.6), 2026-11-08:

  | Run | Right | Wrong | Missed | Persona chosen | p50 / p95 | Cost per turn |
  |---|---|---|---|---|---|---|
  | The eval, 2026-11-07 | 94 | 2 | 4 | n/a | 0.56 / 1.12 s | US$ 0.000092 |
  | This code, descriptor first | 91 | 6 | 3 | 44 | 0.66 / 1.49 s | US$ 0.000089 |
  | **This code, description first** | **93** | **3** | **4** | 36 | 0.61 / 1.32 s | US$ 0.000081 |

  The built router agrees with the eval's pick on 95 of 100 turns. Two of its three wrong
  picks are the book Journey's writing persona on turns that ask for none: the case a
  Journey default resolves, once one can be set.

## Evidence

- [Persona-routing eval, 2026-11-07](cr203-persona-routing-eval-2026-11-07.md): method,
  every candidate's numbers, held-out validation, latency, cost, limits and conclusions.
- `ts/src/persona/detectPersona.ts`, `ts/src/mirror/doorman.ts` (`decideDoorman`,
  `runDelta`, `deliveredLine`), `ts/src/mirror/defaultResolution.ts`.
- OpenRouter's Decisions API reference (`createApiAlphaDecisions`) and its Jev guide, read
  2026-11-07.

## Outcome

Built 2026-11-08 on the plan the Navigator approved ("aprovo o plano, faça o merge do #63 e
implemente"); released together with CR204, as the Navigator chose.
