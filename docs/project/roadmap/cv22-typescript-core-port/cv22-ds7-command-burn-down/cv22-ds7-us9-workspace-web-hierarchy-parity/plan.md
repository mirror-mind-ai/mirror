# Plan — CV22.DS7.US9

> **Never executed.** This plan was authored and panel-reviewed on 2026-09-17 and then
> retired at its approval gate: the Navigator decided to retire the web console instead of
> porting it — see
> [Decisions](../../../../decisions.md#the-web-console-is-retired-not-ported-and-ds7-closes-at-1414).
> It is kept as the cost read of a port that was declined, and because its terrain section
> is the only line-referenced description of the Python hierarchy producers in the repo.
> No code was written, no golden generated, no oracle baselined.

## Objective

Give the released `v0.31.9` Workspace/web hierarchy contract one explicit TypeScript
implementation owner and one reviewable evidence package: recursive Workspace DTOs,
hierarchy-bearing endpoint payloads, deterministic parent create/move adapters, and
browser-compatibility evidence — without replacing `python -m memory web`, which is DS10's.

US9 does not move the command denominator. It is the non-command retirement rider: DS7
cannot be done while it is open, and DS10 cannot delete Python while the hierarchy
contract has no TS owner.

---

## Terrain (facts read from code, not from the index)

1. **The hierarchy producers are two files, not one.**
   `src/memory/surfaces/workspace.py` (662 lines) composes `journeys[]`, `scene.journeyMap[]`,
   `scene.locationPath[]`, `scene.nearbyJourneys[]`, `scene.signals[]`;
   `src/memory/web/server.py` (1222 lines) exposes them at `GET /api/surface/workspace`,
   serves selector options through `_journey_options()` (line 992), and owns the parent
   writers `_write_journey_metadata()` (line 492) and `_create_journey()` (line 561).
2. **Neither producer is in the drift tripwire.** `ts/parity/oracle-baseline.json` carries 95
   oracles; `surfaces/workspace.py` and `web/server.py` are absent. Evidence item 8 is
   therefore a real gap today, not a formality.
3. **`_scene_model()` is a second hierarchy algorithm.** It re-derives parents from
   `journey["metadata"]["parent_journey"]`, groups by parent, and bounds rootless cycles with
   its own `visited` set (workspace.py:148-211) — it never calls `list_journey_options()`.
   TS already owns that grouping/bounding logic once, in `groupJourneysByParent()` and
   `listJourneyOptions()` (`ts/src/journey/journeyOptions.ts`).
4. **But the two algorithms order differently, and the DTO must keep Python's order.**
   `journeyMap` walks `display_journeys` = active journeys sorted by *recent activity*
   (`_sort_journeys_by_recent_activity`) followed by inactive sorted by
   `(status != "completed", name.lower())`. `listJourneyOptions()` sorts every level by
   `(status !== "active", name.toLowerCase())`. Composing the map *from* `JourneyOption`
   order would change released output. This is the plan's sharpest tension — see D1.
5. **Two different status regexes exist in the same service.** `list_journeys()` uses
   `\*\*Status:\*\*\s*(\w+)` (journey.py:190) and `list_journey_options()` uses
   `\*\*Status:\*\*\s*([^\n]+)` (journey.py:299). `**Status:** in progress` yields `in` in
   cards and `in progress` in selectors. Parity means porting both, divergence included.
6. **The CR050/CR051/CR052 seams US9 depends on are already TS-owned and `done`:**
   `listJourneyOptions()` (depth + complete lineage, bounded cycles),
   `resolveParentJourney()` (metadata is authority while both engines write),
   `validateParentJourney()` (Python's exact messages and walk order),
   `createJourney()` / `setParentJourney()` (`ts/src/journey/journeyWrite.ts`, metadata +
   migration-017 projection written atomically).
7. **The live Python parent writer already validates.** `update_metadata_fields()`
   (journey.py:452) calls `_validate_parent_journey`. US9's adapters must match that
   behavior, not tighten it.
8. **`journeyMap` items are not pure hierarchy.** Each item carries `horizon` (regex over the
   journey's briefing content: `## Current focus` / `## Foco atual`, else `**Stage:**`, else
   description — workspace.py:250-259) and `movement` (counts + first-5 titles over
   conversations/memories/open tasks). TS has the read models
   (`listRecentConversationSummaries`, `listRecentMemorySummaries`, `listTasks`); it does not
   have the horizon regex.
9. **Scene synthesis hashes JSON in a Python-specific way.** `_scene_source_hash()` is
   `sha256(json.dumps(scene_without_synthesis, ensure_ascii=False, sort_keys=True, default=str))`.
   Python's default separators are `", "` / `": "`; `JSON.stringify` emits `","` / `":"`. A
   naive TS port produces a different hash for identical scenes, which would silently mark
   every stored orientation `stale`.
10. **The browser client already renders arbitrary depth.** `app.js` has
    `hierarchicalJourneyItems()` (line 1127), depth-capped CSS (`--journey-depth`, `min(depth, 6)`),
    and lineage labels built from `journey.lineage.slice(0, -1).join(' › ')` (lines 1539, 1988).
    It consumes numeric `depth` and complete `lineage` — no client rewrite is needed, and any
    DTO change that drops those fields breaks it silently.
11. **TS has no workspace module at all.** `grep -rl workspace ts/src ts/test` is empty. This
    story creates `ts/src/workspace/` from nothing; it removes nothing.

---

## Decisions Taken At Plan Time

Single-owner rule: these are decided here and recorded, not deferred to implementation.

**D1 — Reuse the shared hierarchy primitive for *structure*, keep Python's order for *sequence*.**
The TS projection consumes `groupJourneysByParent()` (already exported) and
`resolveParentJourney()` from the US1/CR050 primitive, so parent resolution, unknown-parent-as-root,
and rootless-cycle bounding exist exactly once in TS. Sibling sequence and root sequence are
*inputs* to the composition, supplied by the activity-ordered card list, reproducing
`display_journeys`. US9 authors no second parent resolver and no second cycle bound; it does
reproduce Python's activity ordering, which is a display concern, not hierarchy semantics.
Rejected: re-ordering `journeyMap` to `listJourneyOptions()` order (breaks the released
contract); copying `_scene_model`'s inline grouping (the second algorithm the index forbids).

Precision the review forced: the shared primitive gives grouping and parent resolution, not
nesting. `listJourneyOptions()` emits a *flat* ordered list; `_scene_model` emits a *nested*
tree whose `visited` rule is an early return — a node reached twice is emitted again with an
empty `children[]`, neither omitted nor recursed. That recursive walk is new US9 code and
must reproduce that exact rule; the golden's rootless cycle is what proves it. Parent
resolution happens once, at the row-mapping boundary (`resolveParentJourney` over the raw
metadata string), and every downstream consumer reads the resolved field — never a second
parse, never the migration-017 column.

**D2 — US9 ships producers and adapters, not a server.**
The TS modules are called by tests, by the parity harness, and by an evidence-only HTTP
smoke harness (`ts/parity/workspace_hierarchy_smoke.ts`) that serves the existing static
assets against TS-produced payloads. `python -m memory web` stays the product process,
unchanged, and no `routing.ts` entry is added. Rejected: making Python call TS per request
(a permanent language bridge TS2 explicitly refused, plus per-request latency); flipping the
web process here (DS10 owns it, gated on the full endpoint inventory).

Harness safety contract (non-negotiable, tested): binds `127.0.0.1` only; requires an
explicit `--db` and refuses any path under `$HOME/.mirror*` or the resolved production
`memory.db`; serves GET only, no write routes, no CORS header; logs request paths and
counts, never row content; exits non-zero rather than starting on a refused path.

Operational posture, stated so its absence is not read as an omission at handoff: US9 ships
**no revert gate**, because it flips nothing. Every prior DS7 story carried a
`MIRROR_TS_*` escape hatch; here production blast radius is zero by construction and the
rollback is `git revert` of documentation and new files.

**D3 — The parent write adapters are TS functions with copy-backed tests, and Python keeps
the live route until DS10.**
`applyJourneyParentUpdate()` and `applyJourneyCreate()` wrap CR052's `setParentJourney()` /
`createJourney()` with the endpoints' request validation and response shape. They duplicate
no cycle or authority logic. Because metadata stays semantic authority (CR050) and both
writers update metadata, mixed-engine operation during the transition stays coherent.

The review adds one assertion the plan cannot assume: `setParentJourney()` writes metadata
*and* the migration-017 projection, so plateau 4 must prove the pair is atomic — a refused
validation and an injected mid-write failure both leave metadata and column agreeing, with no
partial row. CR050 says disagreement is drift to diagnose, never something a read repairs;
that guarantee is only real if the writer is transactional under failure, not just under
success.

**D4 — Scene synthesis: deterministic scope in, generation out.**
In scope: the bounded-scene construction (`scene` minus `synthesis`), a canonical JSON
encoder matching Python's separators/sort/escaping, `sceneSourceHash()`, the
`journey:<id>` / `global` scope key, and the stored-orientation state machine
(`generated` / `stale` / `missing`). Out of scope: calling a provider to generate an
orientation. DS8 shipped the live transport, but `generate_scene_synthesis` itself is
unported, and porting it here would pull prompt assembly into a hierarchy story.
Recorded consequence: after US9, the deterministic half has a TS owner and the generation
call does not; DS10 inherits one named function, not an unmapped surface.

**D5 — JavaScript evidence by fixture, not by rewrite.**
`hierarchicalJourneyItems()` and the lineage-label expression are exercised through a
Node-side fixture harness that loads the pure helpers; the client stays JavaScript and the
visual design is untouched. If a helper cannot be loaded without a DOM, the minimum pure
extraction is made *in place* in `app.js` (same behavior, same file), never a port.

**D6 — Selected-scope isolation is graded as a first-class acceptance fixture, not as a
side effect of DTO parity.** A four-level ancestor chain is seeded with distinct
conversations, memories, decisions, tasks, attachments and a selected leaf; every focused
collection, every metric, and the synthesis scope are asserted to be leaf-only. A passing
lineage render with leaked ancestor content is a failure of this story.

**D7 — `horizon` is computed from rows already in memory, not by a per-journey re-read.**
Python's `_journey_horizon()` calls `get_identity("journey", id)` once per journey per
render, although `_get_journey_identities()` already returned that same `content` moments
earlier — an N+1 over the identity table on every Workspace load. The TS projection takes
the content it already holds and applies the same regex cascade. Output is identical by
construction (same string, same regexes); the query count drops from N+1 to 1. This is the
one place US9 deliberately does not reproduce Python's *shape*, only its *result*, and the
golden is what proves the distinction is safe.

**D8 — Drift coverage is file-level, because the guard is file-level.**
`src/memory/oracle_drift.py` hashes whole files through `git hash-object` against a curated
`ORACLE_PATHS` tuple. `surfaces/workspace.py` (662 lines, low churn) is added plainly.
`web/server.py` (1222 lines, high churn, most of it unrelated endpoints) is also added, with
the consequence recorded: unrelated endpoint edits will fire the tripwire, and re-baselining
it is only legitimate after re-reading the four named hierarchy producers —
`_journey_options`, `_write_journey_metadata`, `_create_journey`, `_attach_scene_orientation`
— which the story package lists by name for that purpose. Rejected: building function-level
digest machinery for a file DS10 deletes; and excluding `server.py`, which would leave the
endpoint half of this story with no tripwire at all. Precedent: US8 excluded
`workbench_surfaces.py` with a recorded reason rather than silently.

---

## Scope

Seven plateaus. Each ends in a resumable state with its own commit and its own stop.

**Plateau 1 — Freeze the oracle.**
`ts/parity/generate_workspace_hierarchy_golden.py` builds a fixture DB (four levels, two
sibling sets, unknown-parent orphan, rootless malformed cycle, active/paused/completed, a
selected deep leaf) and emits `ts/test/goldens/workspace-hierarchy.golden.json` from the real
`WorkspaceSurface.home()` plus `_journey_options()`. Register it in the CI determinism gate
(`.github/workflows/tests.yml`). Add `src/memory/surfaces/workspace.py` and
`src/memory/web/server.py` to `ts/parity/oracle-baseline.json` (evidence 8, terrain 2, D8).

The determinism gate regenerates and diffs this golden on every push, so the generator must
be deterministic by construction, not by luck: fixed journey ids and titles, fixed row
timestamps, no wall-clock read, no `$HOME` read, and a hard refusal to run against any DB
outside `tmp/` (the harness rule in D2 applies to the generator too). The fixture carries an
explicit `_sort_journeys_by_recent_activity` tie — two active journeys whose most recent
signal timestamps are equal — so the comparator's tie-break is measured rather than assumed,
the same way terrain 5's status regexes are ported by measurement.

The golden is the whole `home()` payload, but US9 grades four subtrees: `journeys[]`,
`scene.journeyMap[]`, `scene.locationPath[]`, `scene.nearbyJourneys[]`, plus the selector
payloads in plateau 3. The ungraded remainder (briefing, attachments, memories, decisions,
settings sections, and `scene.signals[]` beyond its scope filter) is listed by name in the
story package as DS10's inheritance — "exact parity" must not quietly mean "the parts we
chose".

**Plateau 2 — TS hierarchy projection + pure DTO parity.**
`ts/src/workspace/journeyCards.ts` (the `list_journeys` DTO incl. terrain 5's `\w+` status
regex, `_journey_card` shape), `ts/src/workspace/hierarchy.ts` (`journeyMap`, `locationPath`,
`nearbyJourneys` over D1's primitive), `ts/src/workspace/horizon.ts` (terrain 8's regex),
`ts/src/workspace/activityOrder.ts` (`_sort_journeys_by_recent_activity` + inactive sort).
Graded against plateau 1's golden, malformed rows included. Evidence 1, 2.

**Plateau 3 — Hierarchy-bearing endpoint payloads.**
`ts/src/workspace/endpointPayloads.ts`: the `GET /api/surface/workspace` hierarchy portion
(including `_attach_scene_orientation`'s state machine and D4's canonical hash) and
`_journey_options()` as consumed by conversation detail, all-conversations, and
unassigned-conversation payloads. Endpoint fixtures committed. Evidence 3.

The AI-22 invariant recorded in `server.py` (scene_orientation rows are display-layer content
built from user-controlled strings and must never enter prompt assembly, extraction, or tool
paths without re-crossing a trust boundary) crosses into a second language here. It becomes
an executable test in this plateau — the TS orientation reader is asserted to be reachable
only from the display payload path — rather than a comment that survives the port as folklore.

**Plateau 4 — Parent create/move adapters, copy-backed.**
D3's two adapters. Tests on a DB copy: create with parent, create with absent parent, move,
unparent, self-parent refusal, cycle refusal, pre-existing-cycle refusal, sibling metadata
preservation, and no partial write on refusal. Python's exact 400-class error strings.
Evidence 4.

**Plateau 5 — Selected-scope non-inheritance.**
D6's fixture across conversations, messages, memories, decisions, tasks, attachments,
metrics, `signals[]`, and synthesis scope. Evidence 6.

The seeding is column-exact or the test passes vacuously: conversations carry `journey_id`
while memories and tasks carry `journey`. Every ancestor row is seeded on the column its own
table actually filters on, and the fixture asserts each ancestor's rows are non-empty before
asserting they are absent from the focused payload — a leak test over an empty ancestor
proves nothing.

**Plateau 6 — Browser compatibility and smoke.**
D5's renderer fixture evidence (arbitrary-depth sidebar expansion, complete-lineage labels,
recursive All Journeys, bounded malformed input) plus one browser smoke against the
TS-backed harness: expand four levels, read a lineage label, confirm the malformed cycle
appears exactly once, confirm no ancestor content in the focused workspace. Evidence 5, 7.

`test-guide.md` carries the smoke as a written script with a per-observation pass/fail line,
not as prose — four observations, four verdicts, recorded in `validation.md` when run.
Lineage labels keep rendering journey ids joined by ` › ` and keep passing through
`escapeHtml`; titles are user-controlled strings, so a label "improvement" that swaps ids for
titles or bypasses escaping is out of scope and a review failure, not a nicety.

**Plateau 7 — Authority transfer record and handoff.**
Per-endpoint authority table in the story package (producer → TS owner → evidence → who
flips it), ledger/roadmap/worklog updates, `handoff.md` written for DS10's consumption,
debt captured as CRs.

---

## Non-Goals

- Replacing `python -m memory web`, inventorying every endpoint, or packaging static assets (DS10).
- Any `routing.ts` entry, production flip, or user-visible change in this story.
- Rewriting the browser application or changing visual design.
- Porting LLM journey-draft generation (`/api/journeys/draft`) or scene-synthesis generation (D4).
- Journey removal UI, schema changes, filesystem effects, automatic repair, cascade, or path inference.
- Deleting Python, renaming `memory → mirror`, or npm publication (DS10).
- Re-deciding hierarchy semantics owned by US1/CR050/CR051/CR052.

---

## Acceptance Behavior

```text
Given a Mirror database seeded with a four-level journey tree, sibling sets,
      an unknown-parent orphan, a rootless malformed cycle, mixed statuses,
      and a selected deep leaf whose ancestors each hold distinct
      conversations, memories, decisions, tasks and attachments
When  the TS Workspace hierarchy producers compose the Workspace payload,
      the selector payloads, and the parent write responses for that database
Then  journeys[], journeyMap[], locationPath[], nearbyJourneys[] and the
      selector DTOs equal the Python oracle exactly, including order, the
      malformed cycle appearing exactly once, numeric depth and complete lineage
And   the focused Workspace contains no ancestor conversation, message, memory,
      decision, task, attachment, metric contribution, signal, or synthesis scope
And   parent create, move, unparent, and every refusal route through CR052's
      seams with Python's messages and leave no partial write
And   the existing JavaScript client renders that contract at arbitrary depth
      with no client rewrite and no visual change
And   `python -m memory web` still serves the product unchanged, with no
      routing entry added and no Python producer deleted
```

---

## Validation Route

**Automated (CI, every push).**
`npm run typecheck && npm run lint && npm test` in `ts/`; the determinism gate regenerates
`workspace-hierarchy.golden.json` and fails on any diff; the oracle-drift guard fails if
`surfaces/workspace.py` or `web/server.py` changes without re-baselining.

**Navigator-visible route.**

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
uv run python ts/parity/generate_workspace_hierarchy_golden.py   # regenerate; expect no diff
cd ts && npm test -- test/workspace                              # DTO, endpoint, scope, adapters
node --env-file=../.env parity/workspace_hierarchy_smoke.ts --db ../tmp/parity/demo-memory.db
# open the printed localhost URL
```

Expected observation: the sidebar expands four levels with `↳` markers and depth indentation;
a deep journey's selector label reads `root › mid › parent › leaf`; the malformed cycle
appears exactly once; selecting the deep leaf shows only its own conversations, memories,
decisions, tasks and attachments, with ancestors visible only as lineage.

Pass: every automated check green, zero golden diff, and the four browser observations hold.
Fail: any DTO diff against the oracle, any ancestor content in the focused workspace, any
duplicated or missing malformed node, any client change required to render depth, or any
user-visible change to `python -m memory web`.

**E2E decision: required.** The browser smoke is the E2E; a fixture-only route cannot prove
evidence 5 and 7. It runs against the evidence harness, not against production, because D2
keeps the production flip in DS10.

---

## Implementation Contract

- TDD: the golden and its fixture exist (plateau 1) before any TS producer is written.
- Changes confined to `ts/src/workspace/`, `ts/test/workspace/`, `ts/parity/`, `ts/test/goldens/`,
  the CI workflow, `oracle-baseline.json`, and this story package. Python producers are read,
  not edited — the single exception is D5's in-place pure extraction in `app.js`, if forced.
- `uv run` for every Python command; Node 24 `node --test` for TS.
- No `git add .`; commit story-scoped files, one commit per plateau, descriptive English
  messages explaining why.
- No secrets, no real database artifacts, no raw user content in committed fixtures or in
  smoke output.
- Multi-persona handoff review after validation, per the collaboration strategy.

---

## Stop Conditions

- scope_change_detected — in particular: any pull toward porting non-hierarchy Workspace
  sections, the web process, or synthesis generation.
- A Python producer must change to make parity reachable (that is a CR, not a silent edit).
- `app.js` needs more than D5's minimum pure extraction.
- plan_rule_conflict, failing_required_check_without_clear_fix, navigator_decision_needed.

---

## Debt / CRs To Capture At Debt Review (candidates)

- Python's two divergent `**Status:**` regexes (terrain 5) — ported as-is; converging them is
  a product decision, not a port decision.
- `_scene_model`'s duplicate hierarchy algorithm stays in Python until DS10 deletes it; TS
  must not be the place that quietly fixes it.
- Scene-synthesis generation has no TS owner after US9 (D4) — DS10 input.
- The evidence-only smoke harness (D2) is not a product server; DS10 must promote or delete it.
- File-level drift on `web/server.py` (D8) will fire on unrelated endpoint churn; if that
  noise trains reflexive re-baselining before DS10 deletes the file, it becomes a CR.
- Python keeps its N+1 horizon read (D7) until DS10; only the TS side is single-pass.

---

## Persona Review (plan stage)

Run on this draft before presentation, five lenses. `ai-engineer` was **not** convened, and
that exclusion is recorded rather than defaulted: D4 keeps synthesis *generation* out of
scope, so nothing in US9 is model-in-the-loop — the LLM-produced orientation is touched only
as stored display bytes, which is security's boundary question, not a model-behavior one.
Four lenses dissented; each changed the plan above before it was presented.

- **engineer** — D1 claimed more reuse than exists. `listJourneyOptions()` returns a flat
  list; `journeyMap` is a nested tree, and `_scene_model`'s `visited` rule is an early
  return that re-emits a revisited node with empty `children[]`. The recursive walk is new
  code no matter how the primitive is phrased, so say so and pin the rule with the rootless
  cycle in the golden. Also: resolve the parent once at the row-mapping boundary — a card
  DTO holding a parsed metadata dict and a resolver taking a raw string is exactly how a
  second resolver gets born.
- **quality-assurance** — the determinism gate regenerates this golden on every push, so a
  generator that reads the wall clock or `$HOME` produces a flaky `main`, not an oracle. Pin
  the fixture's ids and timestamps. `_sort_journeys_by_recent_activity` has an untested
  tie-break: seed an actual tie or the ordering port is theory. And name which subtrees are
  graded — the golden is the whole `home()` payload, and "exact DTO parity" over a chosen
  subset, with the remainder unlisted, is how a surface reaches DS10 unowned.
- **database-architect** — `_journey_horizon` re-reads each journey identity after
  `_get_journey_identities()` already returned the same content: an N+1 the port should not
  copy when the result is provably identical (D7). Separately, `setParentJourney` writes
  metadata and the 017 projection; plateau 4 proves atomicity under refusal *and* under
  injected mid-write failure, or CR050's "disagreement is drift" guarantee is unfounded. And
  the isolation fixture must seed `journey_id` on conversations but `journey` on memories and
  tasks — seed the wrong column and the leak test passes while proving nothing.
- **security-engineer** — D2's harness is an HTTP server over real memory data living in the
  repo. Bind loopback, GET only, no CORS, explicit `--db` refused outside `tmp/` and refused
  against the production database, and never log row content — the same rule binds the golden
  generator. The AI-22 invariant on `scene_orientation` is a comment in `server.py`; crossing
  languages is precisely when folklore is lost, so it becomes a test here. Lineage labels are
  user-controlled strings reaching HTML: keep ids, keep `escapeHtml`, and treat any label
  "improvement" as out of scope.
- **devops-engineer** — the drift guard is file-level (`git hash-object` over a curated
  tuple), so adding a 1222-line high-churn HTTP file makes the tripwire fire on work that has
  nothing to do with hierarchy, and reflexive re-baselining is how a tripwire dies. Either
  build narrower machinery or accept it with a named re-baseline checklist — decide now,
  not at implementation (D8). Second: this story ships no revert gate because it flips
  nothing; state that explicitly, or handoff review will read a missing `MIRROR_TS_*` flag as
  an oversight instead of a property.

---

## Approval Gate

- **Not approved — 2026-09-17.** The Navigator declined the port itself, not the plan:
  the web console is retired rather than ported, US9 closes unported, and DS7 closes at
  14/14 with the non-command rider lifted.
- No implementation was started. The active item moved to CV22.DS9 in the same session.
