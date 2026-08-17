[< Parent](../index.md)

# CV22.DS7.US9 — Workspace And Web Hierarchy Parity

**Status:** 🟡 Planned
**Type:** User Story — non-command retirement rider
**Owner:** CV22.DS7 for hierarchy projection, deterministic adapters, and parity evidence
**Depends on:** CV22.DS7.US1 / RS008 CR051 for the ordered recursive `JourneyOption`
projection; RS008 CR052 for validated parent creation and movement; RS008 CR050 for
metadata-authoritative parent semantics

---

## Outcome

The released `v0.31.9` Workspace and browser hierarchy contract has one explicit TS
implementation owner and one reviewable evidence package. Workspace JSON, hierarchy-
bearing endpoint payloads, parent create/update adapters, and the existing static
JavaScript consumers preserve arbitrary depth, complete lineage, bounded malformed
state, and exact selected-journey scoping before Python retirement.

US9 does not change DS7's command burn-down denominator. It is a mandatory non-command
retirement rider: DS7 cannot be done while US9 is open, even when every deterministic
CLI command is already on TS.

## Ownership Boundary

US9 owns:

- the TS Workspace hierarchy projection composed from the existing recursive
  `JourneyOption` read model;
- hierarchy-bearing portions of `GET /api/surface/workspace`;
- journey option payloads consumed by conversation and journey selectors;
- deterministic parent/create web adapters that call CR052's `createJourney` and
  `setParentJourney` seams rather than reimplementing validation;
- compatibility evidence for recursive sidebar, selector, Scene, and All Journeys
  rendering in the existing static JavaScript client; and
- explicit selected-journey isolation evidence.

CV22.DS7.US1 remains owner of the shared metadata-authoritative `JourneyOption` primitive
(`parentJourney`, `depth`, `lineage`, deterministic order, bounded malformed rows). US9
consumes that primitive; it must not author a second hierarchy algorithm.

CV22.DS10 owns final `python -m memory web` process replacement, complete endpoint
inventory convergence, static-asset packaging, and the deletion gate. DS10 consumes the
US9 contract; it must not rediscover or redefine hierarchy semantics.

## Stable Contract And Owner Matrix

| Contract | Released producer / entry point | Consumer | Implementation owner | Required oracle and evidence | Convergence gate |
|---|---|---|---|---|---|
| Ordered recursive journey options: parent, `depth`, complete `lineage`, bounded orphan/cycle visibility | `JourneyService.list_journey_options()` | Workspace builders and all journey selectors | DS7.US1 primitive; US9 integration | Existing CR051 Python golden plus US9 endpoint fixtures | US1 remains green; US9 consumes without reconstruction |
| Workspace `journeys[]` cards with stable identity, status, description, icon, and parent metadata | `WorkspaceSurface.home()` via `GET /api/surface/workspace` | Sidebar and All Journeys | US9 | Python-generated Workspace JSON golden and exact TS DTO comparison | US9 |
| Recursive Scene `journeyMap[]` with nested `children[]` | `WorkspaceSurface._scene_model()` | Scene map renderer | US9 | Four-level tree, sibling, orphan, and rootless-cycle golden; every known journey visible once | US9 |
| Full root-to-selected `locationPath[]` | `WorkspaceSurface._scene_location_path()` | Scene location breadcrumb | US9 | Exact ordered lineage fixture | US9 |
| Immediate `nearbyJourneys[]` only | `WorkspaceSurface._scene_nearby()` | Scene nearby navigation | US9 | Deep selected node with sibling, uncle, and ancestor fixture | US9 |
| Hierarchy options returned with conversation detail, all-conversations, and unassigned-conversation payloads | `_journey_options()` in the Python web server | Conversation assignment selectors | US9 | Endpoint contract fixtures carrying numeric depth and complete lineage | US9 |
| Journey parent selection and creation | `POST /api/journeys`; existing draft remains separate | New-journey review form | US9 deterministic apply adapter | Copy-backed create tests using CR052 validation and atomic projection maintenance | US9; LLM draft generation remains separately owned |
| Existing journey parent update/unparent | `POST /api/journeys/metadata` | Journey settings form | US9 deterministic apply adapter | Copy-backed move, cycle refusal, unparent, sibling-metadata preservation, and rollback evidence from CR052 plus endpoint contract tests | US9 |
| Focused Scene synthesis scope | `POST /api/surface/workspace/scene-synthesis` rebuilds Workspace for `journeyId` | Scene orientation panel | US9 for deterministic scope; provider transport remains DS8 | Selected journey and ancestor carry distinct signals; request scope stays selected-only | US9 deterministic seam; DS8 live transport |
| Recursive sidebar, lineage selectors, and All Journeys branches | `src/memory/web/static/app.js` | Browser | US9 compatibility evidence; client remains JavaScript | Pure renderer tests or the smallest equivalent fixture harness plus one browser smoke | US9 |
| Web process, remaining endpoints, and packaged static assets | `python -m memory web` / `src/memory/web/server.py` | Installed Mirror runtime | DS10 | Complete endpoint inventory, TS server smoke, packaged-asset smoke, and no-Python-process proof | DS10 before Python deletion |

## Stable Hierarchy Shapes

The future TS Workspace projection must preserve these released semantics:

- `journeys[]` remains the complete navigation collection. Every journey keeps stable
  identity and its own metadata; hierarchy never changes IDs or filesystem paths.
- `scene.journeyMap[]` is a recursive forest. Unknown-parent rows are roots. Rootless
  malformed cycles remain bounded and visible exactly once; no repair is performed.
- `scene.locationPath[]` is ordered root → selected and stops safely at a missing or
  repeated ancestor.
- `scene.nearbyJourneys[]` contains only immediate siblings sharing the selected
  journey's effective parent, never cousins or all descendants.
- selector DTOs expose numeric `depth` and complete `lineage`; consumers do not infer
  ancestry from indentation, paths, or migration `017`'s derived column.
- metadata remains semantic parent authority throughout mixed-engine operation.

## Selected-Journey Isolation Contract

A focused Workspace loads records whose `journey`/`journey_id` equals the selected
journey only. Ancestors may appear in `locationPath`, `journeyMap`, navigation cards, and
selector labels, but they never contribute:

- conversations or messages;
- memories, decisions, or search results;
- tasks or attachments;
- instructions, status, routing, synthesis scope, or Builder state.

The acceptance fixture must seed different values on a four-level ancestor chain and the
selected leaf, then grade each collection and metric. A passing lineage rendering with
leaked ancestor content is a failure.

## Required Implementation Evidence

1. A Python-generated, committed Workspace hierarchy golden covering four levels,
   siblings, unknown-parent orphan, rootless malformed cycle, active/paused/completed
   status, and a selected deep leaf.
2. Exact TS DTO parity for `journeys`, `journeyMap`, `locationPath`, and
   `nearbyJourneys`, with deterministic regeneration in CI.
3. Endpoint fixtures for `GET /api/surface/workspace` and every hierarchy-bearing
   conversation selector payload.
4. Copy-backed endpoint adapter tests proving parent creation, movement, unparenting,
   cycle refusal, and rollback through CR052 seams.
5. JavaScript evidence for arbitrary-depth sidebar expansion, complete-lineage labels,
   recursive All Journeys rendering, and bounded malformed input.
6. A selected-scope non-inheritance fixture across conversations, memories, tasks,
   attachments, status, and synthesis scope.
7. One browser smoke over the TS-backed contract before any live adapter flip.
8. Oracle-drift coverage for every Python producer copied into TS.

## Implementation Sequence For Future Pull

1. Freeze the Python JSON oracle and selected-scope fixture.
2. Compose the TS Workspace hierarchy DTO from `JourneyOption` rather than porting
   Python service internals wholesale.
3. Grade pure DTO parity, including malformed state.
4. Add hierarchy-bearing endpoint adapters and copy-backed parent write evidence.
5. Extract only the minimum pure JavaScript renderer helpers needed for deterministic
   tests, if direct fixture testing is otherwise impossible.
6. Run the browser smoke without changing visual design.
7. Record authority transfer per endpoint; leave the final server process flip to DS10.

## Done Condition

- Every row in the owner matrix has passing evidence and no unnamed producer or consumer.
- Workspace hierarchy JSON matches the released Python oracle for deep and malformed
  trees.
- Parent/create adapters reuse CR052 and never duplicate cycle or authority logic.
- Focused Workspace evidence proves no ancestral inheritance.
- Existing browser behavior supports arbitrary depth without a client rewrite.
- No removal UI, schema change, filesystem effect, or full web-process cutover was added.
- DS10 can consume a stable hierarchy contract without reopening product semantics.

## Out Of Scope

- Rewriting the browser application or visual design.
- Porting LLM journey-draft generation or live Scene synthesis transport.
- Adding journey removal UI.
- Migrating unrelated Workspace content or every web endpoint.
- Replacing `python -m memory web`, packaging assets, deleting Python, renaming packages,
  or publishing npm; those are DS10 convergence responsibilities.
- Any inherited journey context, path inference, automatic repair, cascade, or filesystem
  movement.
