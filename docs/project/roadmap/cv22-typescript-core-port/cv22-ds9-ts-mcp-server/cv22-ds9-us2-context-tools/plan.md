# Plan — CV22.DS9.US2

## Objective

Port the seven MCP tool handlers to TypeScript at byte-identical payload parity, over the
capabilities DS2–DS8 already delivered, graded by a golden generated from the real Python
handlers against a seeded fixture database — and resolve, before porting it, the one tool
whose oracle behavior is a defect rather than a contract.

---

## Terrain (facts read from code and measured, not from the index)

1. **Five of the seven are wiring; two need a small read model.** TS has
   `loadMirrorContext` (`mirror/context.ts`), `searchMemories` (`search/memorySearch.ts`),
   `listRecentConversationSummaries` (`conversation/listing.ts`),
   `findConversationByIdPrefix` + `getMessagesForConversation` (`conversation/recall.ts`),
   `detectPersona` (`persona/detectPersona.ts`), and `getMemoriesByJourney`
   (`journey/journeyStatus.ts`). It does **not** have structured `list_journeys()` dicts —
   `listActiveMirrorJourneys` returns a rendered string — nor the `get_journey_status()`
   dict. Both are small; both are ported here, not reconstructed from renderers.
   The review sharpened this: `identity/journeyListing.ts` already ports the `**Status:**`
   extraction (`extractStatus`) and a `key/status/description` row for the `list` command —
   a *different* shape from `list_journeys()`' `id/name/description(150)/status/metadata`,
   so the new read model **reuses `extractStatus`** rather than becoming a third copy of
   that regex. And `journey/journeyStatus.ts`'s `getMemoriesByJourney` projects only
   `created_at, title` for the status renderer; `journey_status` needs the seven
   `_memory_to_dict` fields, so it is a new read, not a reuse.
2. **The payload encoder is not `wire.ts`.** Tool text is
   `json.dumps(value, ensure_ascii=False, indent=2, default=str)` — pretty-printed, inside
   the response string. `JSON.stringify(v, null, 2)` matches its layout (measured: same
   newlines, same `": "`, same `[]`/`{}` for empties) and differs in **exactly one place**.
3. **Whole floats.** Python renders `2.0`; JavaScript renders `2`. Measured on the real
   database: `detect_persona("...fix a bug in the database schema")` → `database-architect
   score=2.0`, `engineer score=1.0`. Persona scores are whole floats **routinely**, and
   `search_memories` scores `1.0` on an exact hit. JavaScript cannot recover the distinction
   (`1.0 === 1`), so float-ness must be declared by the mapper, per field — D2.
4. **`journey_status` is a defect, not a contract.** `get_journey_status()` returns a dict
   holding Pydantic `Memory` and `Conversation` *objects*; `_json`'s `default=str` renders
   them through Pydantic's `__str__` as `key='value' key='value'` text, **including
   `embedding=b'...'`** — the raw vector bytes. Measured on the real database: one memory
   renders to 19,686 characters; `journey_status` with no slug returns **3,205,993 bytes
   (~800K tokens) carrying 126 embedding blobs**, for 21 journeys. No client can consume it,
   no model can hold it, and porting it faithfully means porting Pydantic's `__str__` plus
   Python's `repr()` of `str` and `bytes` — D1.
5. **`list_journeys` returns more than its docstring says.** The docstring promises
   `id, name, description`; the code returns `list_journeys()` filtered on `status ==
   "active"`, so the payload also carries `status` and the `metadata` dict. The port follows
   the code.
6. **`search_memories` has four paths.** With `query`: hybrid search under the embedding
   provider, `log_access=False`, results mapped through `_memory_to_dict` plus `score`.
   Without: `journey` → `get_by_journey`, else `layer` → `get_by_layer`, else `type` →
   `get_by_type`, else `ValueError`; all sliced `[:limit]`. Filter paths are deterministic
   reads; the query path is provider-crossing.
7. **`mirror_context` fans out.** `load_mirror_context(query=...)` reaches attachment search
   (embedding) and every `mirror-context-v1` extension provider. TS's `loadMirrorContext`
   takes an `embeddingProvider` and a pre-resolved `extensionContext` string; the front door
   resolves that string through TS2's contract. The tool must reuse that resolver — D4.
8. **`limit` semantics are already recorded.** `recall_conversation` `limit=0` → whole
   transcript (`messages[-0:]`), negative → odd slices; `search_memories` `limit=0` → empty.
   US1's threat model owns the finding; TS1 caps. US2 reproduces the oracle — D5.
9. **Reinforcement differs per tool.** `_search_memories` passes `log_access=False` (AI-12);
   `_mirror_context` calls `load_mirror_context` with defaults, a genuine context load. TS
   must preserve both, separately — D6.
10. **`tags` is a JSON string, not a list.** `Memory.tags: str | None  # JSON array`. The
    payload carries the string verbatim; a port that helpfully parses it changes the bytes.
11. **`default=str` has no honest port.** Python's fallback renders any non-serializable
    value through `str()`; JavaScript's `String()` of an arbitrary object yields
    `[object Object]`, never the same bytes. After D1 none of the seven payloads contains
    such a value, so the TS encoder **throws** on anything that is not JSON-representable —
    the loud failure lands in the golden test, not in a client.
12. **Python's reads for `journey_status` are wasteful, and the port must not copy the
    waste.** `get_memories_by_journey` is `SELECT * ... ORDER BY created_at DESC` with **no
    LIMIT** — every memory of the journey, embedding blobs included, loaded so that Python
    can slice `[:10]` and render seven fields. With no slug that is 2N+1 queries over 21
    journeys. TS reproduces the *result* (`LIMIT 10`, seven columns, no blob), not the query
    shape — the US9 D7 precedent. Neither Python query carries a tie-break beyond the
    timestamp; see D9 for what that means for the fixture.

---

## Decisions Taken At Plan Time

**D1 — `journey_status`: fix the oracle first, then port the fixed shape.**
*Navigator decision; recommendation follows.* Three options:

- (a) Port the accident faithfully — Pydantic `__str__`, Python `repr()` of `str` and
  `bytes`. Ships 3 MB of binary garbage to agents at perfect parity. Rejected.
- (b) **Fix Python first.** In `src/memory/mcp/tools.py` — the handler, not the service —
  map `recent_memories` through the existing `_memory_to_dict` (which already omits the
  embedding) and `recent_conversations` through a new `_conversation_to_dict` (`id`, `title`,
  `started_at`, `ended_at`, `persona`, `journey`, `message_count`). Re-baseline
  `oracle-baseline.json` consciously, in the same commit. Then port the fixed shape.
  Under the moving-target rule this is Python exercising product authority over a surface
  TS has not strangled yet, and the parity scope it creates is *this story*. Recommended.
- (c) TS diverges under the superset rule and Python stays as is. The engines then
  disagree on a live tool until DS10, and TS2's "no client notices" carries an asterisk.

(b) also closes a real exposure: today one unslugged call hands an agent every journey's
memory content plus vector bytes. The threat model (US1 plan, item 1) is amended to name
`journey_status` as the widest call on the surface; TS1 decides whether it needs a cap
beyond D1's fix.

**D2 — Float-ness is declared at the mapper, once, with a runtime marker.** The first
draft said "branded type"; the engineer lens caught that a brand is erased at compile time —
`pyFloat(2)` would reach the encoder as the number `2`, indistinguishable from an int. So
`PyFloat` is a small **class** (`new PyFloat(n)`), and the encoder renders `instanceof
PyFloat` with Python's `float.__repr__` rules (`2.0` for whole values, shortest round-trip
otherwise — which `Number.prototype.toString` already gives for non-whole values). Mappers
wrap exactly the fields the oracle types as `float`: `score` in `search_memories` and
`detect_persona`. Rejected: a per-encoder field-name allowlist (a name collision in a nested
object would misrender), and rendering *every* whole number as `x.0` (ids and counts are
ints).

**D3 — The query path is graded under replay, the filter paths against the fixture.** The
generator monkeypatches `generate_embedding` to a deterministic vector keyed by query text;
memory embeddings are seeded as deterministic vectors; the TS test injects a replay
`EmbeddingProvider` returning the same vector. This is the DS5 pattern. Ranking parity
itself is DS1/DS2's proven property and is not re-proven here — the golden grades the
*payload* over that ranking.

**D4 — `mirror_context` reuses the front door's extension-context resolution.** The tool
calls whatever `mirrorModeRoute` calls to produce `extensionContext`; it does not open the
`mirror-context-v1` contract a second time. In the golden no extension is installed, and the
generator asserts that (an installed extension would make the oracle machine-dependent).

**D5 — `limit` is reproduced exactly, including `limit=0` on `recall_conversation` returning
the whole transcript.** The golden records it; TS1 caps it; the gap stays visible.

**D6 — CORRECTED AT IMPLEMENTATION (2026-09-17): neither tool reinforces.** The plan
assumed `mirror_context` reinforced, reading AI-12's note that "Builder context load keeps
the default and still reinforces" as covering it. Measured against the Python oracle on a
seeded fixture, that is wrong: the *Builder* load runs a memory search, whereas
`load_mirror_context` assembles identity layers and searches **attachments**, which have no
reinforcement path at all. Python writes zero `memory_access_log` rows for both tools, and
the port matches. The asymmetry the plan was protecting is real but lives elsewhere
(`search_memories` opts out explicitly; the Builder load does not), so the tests assert
zero rows for both tools plus one test proving the opt-out is load-bearing — the same query
through the default path *must* write rows, or "writes nothing" would also pass if search
were broken. Original text follows.

**D6 (as planned) — Reinforcement is asserted per tool, Python against TypeScript, on two copies.** The
first draft compared `mirror_context` to "what the CLI's `mirror load` writes" — and the
CLI's load *is* `loadMirrorContext`, so that test would have compared TS to itself. The
quality-assurance lens caught the tautology. The honest oracle is Python: take two copies
of the same fixture, run the Python tool on A and the TS tool on B, and diff the
reinforcement state as `(memory_id, access_count)` pairs — never `last_accessed_at`, which
differs by wall clock (database-architect). Two tests: `search_memories(query)` leaves both
copies unchanged; `mirror_context` changes both identically.

**D7 — `tags` travels as the stored string.** No parsing, no normalization.

**D8 — One Python-JSON encoder, not two.** US1's `wire.ts` encodes the envelope compactly
with Python's separators; US2 needs the same semantics pretty-printed with `indent=2` plus
the float rule. Shipping them as two modules is the duplication the engineer lens refuses:
`wire.ts` is folded into `payload.ts` as `pythonJson(value, { indent })`, `encodeJsonLine`
remains as a one-line alias so US1's tests and call sites do not move, and the float rule
applies to both (the envelope carries no floats, so it is harmless there and consistent).

**D10 — The ranked query path is graded on order and fields exactly, score to 1e-6.**
*Navigator decision, 2026-09-17.* Python's `np.dot` over float32 arrays accumulates **in
float32**; JavaScript has no float32 arithmetic and widens to double. Identical vectors
therefore yield scores that agree to ~7 significant digits and then diverge — measured at
3.6e-08 on the fixture. Options weighed: reproduce numpy's pairwise float32 summation in JS
(reverse-engineering an implementation detail numpy may change), round the payload (a
deliberate divergence that *hides* rather than records), or scope the claim. The Navigator
chose to scope it.

So for the two `search_memories` query cases — and only those — result count, order, and
every non-score field are compared byte for byte, and the score must fall within 1e-6.
Everything else in this story, filter paths included, stays byte-identical. Mutation-proven:
reversing the ranking, shifting a score by 0.01, and dropping the AI-12 opt-out each fail.

**Where this exception must travel:** the US2 and DS9 indexes, and any later statement that
the MCP surface is byte-identical to Python — including DS10's deletion rationale. Ordering
is the contract a model can act on; an 8th-significant-digit difference in a relevance hint
is not.

**D11 — Fixture vectors are 1536-dimensional, derived from a seed on both engines.** The
first fixture used 8 dimensions, which Python accepts and TypeScript rejects:
`generateEmbeddingSafely` enforces `EMBEDDING_DIMENSIONS = 1536` and degrades the search to
lexical-only on a mismatch. Every TS score was therefore missing its semantic term while the
test reported parity of a *degraded* search against a full one. Vectors are now production
width and computed from `embedding_seed` by a formula both sides implement, so the golden
stays 29 KB instead of carrying a megabyte of floats.

**D9 — The fixture is one ordered seed read by both engines, carried in the golden.** Neither
Python query has a tie-break beyond `created_at DESC` / `started_at DESC`, so equal
timestamps order by rowid — that is, by insertion order. Two independently seeded databases
would disagree on ties. The DS6 pattern applies: the golden carries the seed rows *in
order*, the Python generator inserts them in that order, and the TS test bootstraps its own
database and inserts them in the same order. The seed deliberately includes `created_at`
ties among memories and `started_at` ties among conversations, so the tie-break is graded
rather than assumed.

---

## Scope

Five plateaus, in two groups.

**Group A — the encoder and the deterministic five.**

**Plateau 1 — Freeze the oracle.** `ts/parity/generate_mcp_tools_golden.py` seeds a fixture
database from an **ordered seed list the golden itself carries** (D9): journeys across
statuses with metadata and >150-char descriptions; memories across types/layers/journeys
with JSON-string tags, null fields, non-ASCII content, deterministic embeddings, and
`created_at` ties; conversations with messages and `started_at` ties; personas whose
keywords give whole-number scores. It then drives the seven **real** handlers over a case
list and records each payload string.
Cases include no-argument, filter-only, unknown slug/prefix, `limit=0` and negative limits,
non-ASCII query, and — for `journey_status` — with slug and without. **If D1 is (b), the
Python fix lands in this plateau, first, with the oracle re-baselined in the same commit**,
so the golden records the fixed shape and never the defect. Register in `tests.yml`.

**Plateau 2 — `payload.ts`.** One Python-JSON encoder (D8) absorbing `wire.ts`, with the
`PyFloat` runtime marker (D2), unit-tested against Python-generated number cases (`2.0`,
`0.85`, `0.1+0.2`, `-0.0`, `1e22`, ints, null), the throw on non-JSON values (terrain 11),
and US1's envelope tests still green through the alias.

**Plateau 3 — The deterministic five.** `list_journeys` (port the dict read model, D5 of
terrain: status + metadata included), `journey_status` (port the dict read model in its
D1 shape), `list_conversations`, `recall_conversation` (with D5's limit semantics),
`detect_persona`. Graded per case against the golden.

**Group B — the provider-crossing two.**

**Plateau 4 — `search_memories` and `mirror_context`.** Query path under the replay
provider; filter paths over `getMemoriesByJourney` and the `by_layer` / `by_type` reads
(added if absent); `mirror_context` through `loadMirrorContext` with the replay provider and
D4's resolver. D6's two reinforcement tests on a database copy.

**Plateau 5 — Wired end to end.** `defaultRegistry()` returns real handlers; the US1
framing transcript is extended with one call per tool and replayed through both spawned
servers on the fixture database, byte-diffed. The `search_memories` query case is excluded
from the two-process diff (it would need a live provider on both sides) and covered by the
plateau-4 replay test instead.

---

## D12 — The server opens the database read-only, and spend goes uncounted until TS2

*Navigator decision, 2026-09-17, option (d).* Wiring the registry surfaced that
`search_memories` with a query is not a pure read: `logQueryEmbeddingAttempt` records an
`llm_calls` row (AI-09/D-003), as Python does in production. So `main.ts` needs a handle,
and the three obvious ways to open one were all unattractive:

- **(a) writable + `ensureBackup`**, as the front door does for `memories --search` — keeps
  DS4 discipline, but measured at **399 ms and a 49.3 MB snapshot per launch** on the
  owner's database, paid every time a client spawns the process;
- **(b) read-only** — strongest posture, but the ledger write fails at runtime;
- **(c) writable without the backup gate** — no cost, but narrows a safety discipline inside
  a wiring story, which is the kind of quiet erosion this project treats as a defect.

The Navigator chose **(d)**: open read-only and skip the ledger write. The server now
*cannot* write, which matches the DS9 threat model's read-oracle framing exactly — a tool
that tried would fail rather than succeed quietly.

**The cost, named so it is inherited rather than discovered.** Agent-initiated searches are
**uncounted spend**: no `llm_calls` row, so nothing to bill, audit, or rate-limit against.
**CV22.DS9.TS1's wallet guard reads that ledger.** TS2 must settle how this server opens its
database before TS1 can guard what it cannot see — that ordering is now a dependency between
the two stories, not a preference. Both halves are pinned by tests: the query path writes no
ledger row, and asking for either write path through a read-only handle fails with the name
of the option that asked.

To make (d) implementable, `searchMemoriesWithStatus` and its read helpers now take a plain
`Database`; the two write paths (`logAccess`, `recordEmbeddingLedger`) are opt-in and
narrow the handle explicitly. Every existing caller passes a writable handle and is
unaffected.

## Scope Amendment — the `memories --search` reinforcement defect (2026-09-17)

Adding `logAccess` to `FreshSearchOptions` for the MCP tool exposed that the option was
missing for a **live production route**. Python's `cli/memories.py` has passed
`log_access=False` since AI-12 (2026-07-16); `frontDoor/searchRoute.ts` had no equivalent
and reinforced on every `memories --search`, so the ranker was being fed by its own exhaust
on the exact command AI-12 named.

Fixed here, by Navigator decision, in its own commit with its own mutation-proven test —
parity restoration rather than new behavior, and cheaper than letting it accumulate through
a CR cycle. Measured on both engines against the same seeded fixture: zero access rows.

**The data is not repaired.** Measured read-only on the production database: 520
`memory_access_log` rows since the flip, touching 53 of 950 memories — an upper bound, since
Builder loads legitimately write to the same table and the rows carry no attribution.
Reinforcement is weighted 0.1 and its recency term decays; a deletion with no reliable
attribution rule would do more harm than the drift it corrects. Recorded, accepted.

**Root cause, which outlives the fix.** `intelligence/search.py` *is* a tracked oracle. AI-12
changed it, the drift tripwire fired, and the baseline was advanced on 2026-07-23 inside a
commit about routing `tasks` — the flag never ported. That is the failure the devops lens
predicted in the US9 review: a tripwire that fires on unrelated work trains reflexive
re-baselining. Captured as a CR against RS010 (CV22 Oracle And Port Hygiene) (see the refinement index): a baseline advance
must name the oracle change it absorbs and, in the same commit, either port it or open a CR.

Siblings checked: Python has four `log_access=False` callers; TypeScript has two
reinforcement writers, and the extraction curation path does not search memories in TS at
all. One defect, one route.

## Non-Goals

- Validation, caps, guards (TS1). Manifest, launcher, flip (TS2).
- New tools, write tools, annotations.
- Re-proving ranking, persona routing, or context-assembly parity — those are DS1/DS2/US4
  properties; US2 grades the payload over them.
- Fixing `list_journeys`' docstring or any Python behavior beyond D1.

---

## Acceptance Behavior

See the story index; the runtime contract:

```text
Given the fixture database and the golden generated from the real handlers
When  each tool answers each golden case through the TS registry
Then  every payload string is byte-identical (indent=2, unescaped Unicode,
      2.0 for whole floats, null for None, tags as the stored string)
And   search_memories(query) writes no access rows; mirror_context writes
      exactly what the CLI's load writes
And   the two spawned servers produce an empty diff on the extended transcript
And   journey_status carries no embedding bytes and no Python repr (D1)
And   no route, manifest edit, or launcher exists
```

---

## Validation Route

**Automated (CI):** `npm run typecheck && npm run lint && npm test` in `ts/`; determinism
gate regenerates `mcp-tools.golden.json` with no diff; oracle drift green (re-baselined
once, consciously, if D1 is (b)).

**Navigator-visible route** (`test-guide.md` carries it as a script):

1. Regenerate the golden — expect no diff.
2. `node --test test/mcp` — expect all green.
3. Two-engine diff on the fixture database: the extended transcript into both spawned
   servers — expect an empty diff.
4. **Real-database-copy probe, read-only, redacted:** on a copy of the Navigator's
   `memory.db`, call every tool's **deterministic variants** through both engines and diff —
   `list_journeys`, `journey_status` (slug chosen as the journey with the most memories among
   those with at least one conversation, so the probe proves something), `list_conversations`,
   `recall_conversation`, `detect_persona`, `search_memories` on its three filter paths, and
   `mirror_context` **without** a query. Expect empty. Evidence is hashes and line counts,
   never content. Only the two `query` variants are excluded (live embeddings are not
   byte-comparable across two calls) and rest on the replay golden. The first draft excluded
   both tools wholesale; the quality-assurance lens pointed out that would leave the two
   most important tools with zero real-data evidence.

Expected observation: four empty diffs and green suites. Pass: all four. Fail: any byte
difference, any embedding bytes or `key='value'` repr in a `journey_status` payload, any
access row written by `search_memories`, or a golden that changes on regenerate.

**E2E decision: not required beyond step 3.** The real-client session belongs to TS2; step
3 is the process-level end-to-end for a story whose only observable surface is tool text.

---

## Implementation Contract

- Golden exists (plateau 1) before any handler is written.
- Files: `ts/src/mcp/`, `ts/test/mcp/`, `ts/test/goldens/mcp-tools.golden.json`,
  `ts/test/fixtures/mcp-tools-transcript.jsonl`, `ts/parity/generate_mcp_tools_golden.py`,
  `.github/workflows/tests.yml`, `ts/parity/oracle-baseline.json`, this package; and — only
  if D1 is (b) — `src/memory/mcp/tools.py` plus `tests/unit/memory/mcp/test_tools.py`.
- `uv run` for Python; Node 24 `node --test` for TS.
- No `git add .`; one commit per plateau; descriptive English messages explaining why.
- Committed fixtures are synthetic; the real-database-copy probe commits nothing and prints
  no content.

---

## Stop Conditions

- D1 unanswered — plateau 1 cannot record the right shape.
- A capability the plan assumed exists turns out to need more than a small read model.
- Any pull toward validating arguments, capping limits, or touching the manifest.
- plan_rule_conflict, failing_required_check_without_clear_fix, navigator_decision_needed.

---

## Debt / CRs To Capture At Debt Review (candidates)

- `list_journeys` docstring disagrees with its code (terrain 5).
- `journey_status` without a slug remains the widest read on the surface even after D1 —
  TS1 input.
- If D1 is (c): the recorded divergence itself.

---

## Persona Review (plan stage)

Run 2026-09-17 on the first draft, three lenses as the Navigator confirmed. All three
dissented; each changed the plan above before it was presented.

- **engineer** — D2 as drafted did not work: a TypeScript brand is erased at compile time,
  so `pyFloat(2)` reaches the encoder as `2` and the whole float story collapses at runtime.
  It is a class with `instanceof` now. Second, two Python-JSON encoders is duplication with a
  name — fold `wire.ts` into `payload.ts` behind an `indent` option and keep the alias (D8).
  Third, `default=str` cannot be ported honestly (`String(obj)` is `[object Object]`), so the
  encoder throws rather than pretending. And the "does this already exist?" question had a
  partial yes: `extractStatus` in `journeyListing.ts` is reused, the row shape is not.
- **quality-assurance** — D6's reinforcement test compared TS to TS: the CLI's `mirror load`
  *is* `loadMirrorContext`, so "writes what the CLI writes" proved nothing. Python on copy A
  versus TS on copy B, or no test. Second, excluding `search_memories` and `mirror_context`
  from the real-database probe wholesale left the two tools that matter most with no
  real-data evidence — only their `query` variants are non-deterministic; the filter paths
  and the no-query context load go in. Third, "a slug" is not a probe: name the selection
  rule so the chosen journey actually has memories and conversations.
- **database-architect** — the data-shape question under the plan: Python's `journey_status`
  read is `SELECT *` with no `LIMIT`, loading every memory of a journey with its embedding
  blob to render seven fields of ten rows, 2N+1 times when unslugged. TS reproduces the
  result with a projection and a `LIMIT`, not the query. Second, neither query has a
  tie-break beyond the timestamp, so ties order by rowid — two independently seeded fixtures
  would disagree; the seed must be one ordered list both engines insert identically, with
  ties in it on purpose (D9). Third, the reinforcement diff must compare `(memory_id,
  access_count)`, never `last_accessed_at`, which differs by clock.

---

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval` — and **D1**
- implementation remains blocked until Navigator approval.
