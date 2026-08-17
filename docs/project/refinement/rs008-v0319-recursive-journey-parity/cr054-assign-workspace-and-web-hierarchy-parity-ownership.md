[< RS008](index.md) · [Canonical status](../index.md#change-requests)

# CR054 — Assign Workspace And Web Hierarchy Parity Ownership

## Problem

The CV22 strangler primarily defines its unit as `command + args → stdout`, but
`v0.31.9` also changed observable Python-backed Workspace and web contracts:
`journeyMap`, complete `locationPath`, immediate siblings, journey selectors with
lineage, recursive All Journeys rendering, and bounded visibility for malformed cycles.
No current CV22 slice clearly owns preserving those JSON and browser-facing contracts
when the Python web backend is ported or retired.

## Expected Behavior

CV22 names one concrete Delivery Story or convergence slice that owns each affected
Workspace/web contract and its parity evidence. Ownership distinguishes the TS core
read model from the already-JavaScript renderer, defines the stable JSON shapes that
must survive backend transfer, and prevents Python retirement while an unnamed web
surface still depends on Python-only recursive behavior.

The decision preserves exact selected-journey scoping: ancestors organize navigation
but never contribute inherited conversations, memories, tasks, attachments, search,
instructions, status, routing, or Builder state.

## Impact

Without named ownership, CLI parity can be green while Python retirement silently drops
or changes a released browser surface. The migration's command inventory would be
complete only on paper.

## Plan Or Decision

Navigator-approved plan. Resolve the ownership gap as a bounded roadmap decision in
eight slices; do not port the Workspace or web backend inside CR054 itself:

1. **Freeze the released non-command inventory.** Record the affected Python producer,
   HTTP adapter, and JavaScript consumer for each hierarchy shape: Workspace
   `journeys`, scene `journeyMap`, complete `locationPath`, immediate
   `nearbyJourneys`, selector options with `depth`/`lineage`, recursive sidebar and All
   Journeys rendering, and bounded orphan/rootless-cycle visibility. Include parent
   create/update adapters because they are the browser entry points to the CR052 core
   semantics; explicitly exclude journey removal because CR053 added no public UI.
2. **Keep the shared hierarchy primitive with its existing owner.** Record
   CV22.DS7.US1/CR051 as owner of the metadata-authoritative, deterministic
   `JourneyOption` projection (`parentJourney`, `depth`, `lineage`, bounded malformed
   rows). Workspace/web work consumes that projection rather than reconstructing a
   second parent algorithm in the backend.
3. **Author one bounded implementation owner.** Add
   `CV22.DS7.US9 — Workspace And Web Hierarchy Parity` under DS7. US9 owns the TS
   Workspace hierarchy projection, deterministic hierarchy portions of
   `GET /api/surface/workspace`, journey-option payloads used by conversation and
   journey selectors, parent/create web adapters that call the CR052 core seams, and
   compatibility evidence for the existing static JavaScript hierarchy consumers. US9
   is a non-command retirement rider: it does not alter DS7's command burn-down
   denominator, but DS7 cannot be done while US9 is open.
4. **Give runtime retirement a separate convergence owner.** Amend CV22.DS10 so Python
   core deletion is blocked until the `python -m memory web` process and every remaining
   web endpoint have an explicit TS runtime/package owner. DS10 owns final server-process
   cutover and asset packaging; it does not reimplement US9's hierarchy decisions.
5. **Publish a contract/owner matrix in the US9 package.** For every producer and
   consumer, name the stable shape, implementation owner, parity oracle, evidence, and
   convergence gate. Cover `GET /api/surface/workspace`, the hierarchy-bearing payloads
   returned by conversation endpoints, `POST /api/journeys`,
   `POST /api/journeys/metadata`, scene synthesis's selected-journey scope, and the
   static renderer functions. Mark unrelated Workspace content, LLM draft generation,
   and general web-server migration as separate authority.
6. **Specify evidence before future implementation.** Require a Python-generated JSON
   golden with four levels, siblings, an unknown-parent orphan, and a rootless malformed
   cycle; exact TS DTO parity; endpoint contract tests; JavaScript renderer evidence for
   recursive menus, selectors, and All Journeys; and one browser smoke. Extraction of
   pure renderer helpers is allowed only if required for tests and must not become a
   browser rewrite.
7. **Make non-inheritance executable.** The US9 acceptance package must seed distinct
   conversations, memories, tasks, attachments, and status on ancestors and the selected
   deep journey, then prove the focused Workspace includes only the selected journey's
   records. Ancestors may appear only in navigation lineage. Search, instructions,
   routing, Builder state, and synthesis scope must not widen because of parentage.
8. **Validate ownership closure.** Update DS7's candidate table, scope, dependencies, and
   done condition; add the DS10 deletion gate; update CV22's journey-absorption narrative
   and burn-down semantics; run docs/link/heading checks; then inspect the matrix for any
   hierarchy contract with no implementation owner, evidence owner, or retirement gate.
   CR054 closure and RS008 closure remain separate Navigator decisions.

### Acceptance checkpoint

CR054 is ready for Navigator validation when:

- CV22.DS7.US9 exists as the concrete implementation/evidence owner and is linked from
  DS7's canonical candidate table;
- DS7's done condition requires US9 without pretending it is a CLI command;
- DS10 explicitly blocks Python deletion until the web runtime and endpoint inventory
  have transferred ownership;
- every released Workspace/web hierarchy shape has a producer, consumer, oracle,
  evidence, and convergence owner;
- selected-journey scoping and the no-inheritance contract are executable acceptance
  requirements;
- existing TS hierarchy primitives and CR052 mutation seams are reused rather than
  duplicated; and
- no Workspace/backend port, browser rewrite, public removal UI, or Python retirement is
  smuggled into this ownership-only CR.

### Conscious exclusions

No TypeScript Workspace implementation, HTTP server cutover, browser redesign, DOM test
framework, parent mutation route flip, LLM draft port, removal UI, schema migration,
production-data inspection, Python deletion, package rename, npm publication, or RS008
closure belongs to CR054 itself. Those actions require the newly named story and their
own Navigator gates.

## Evidence

The planning audit confirms a concrete released delta. The branch compatibility copy of
`WorkspaceSurface` still materializes only roots plus immediate children and builds
`locationPath` from at most one parent. Its static JavaScript expands only one child
level, renders only immediate children in All Journeys, and labels selector options with
a single `↳`. The released `v0.31.9` oracle recursively builds `journeyMap`, walks full
lineage with a visited set, preserves rootless malformed cycles, renders recursive menus
and All Journeys branches, and uses complete lineage in selectors.

The live producer remains Python `GET /api/surface/workspace` in
`src/memory/web/server.py`. Hierarchy options are also returned by conversation detail,
all-conversations, and unassigned-conversation payloads. Parent creation/update enters
through `POST /api/journeys` and `POST /api/journeys/metadata`; focused scene synthesis
rebuilds the same Workspace scene for a selected journey. No TS Workspace surface or web
adapter exists today, although CR051 already provides the recursive ordered hierarchy
DTO and CR052 provides validated atomic parent creation/movement seams.

The only released recursive Workspace regression test is currently Python-side, and the
branch has no static-JavaScript hierarchy test. DS7's authored package enumerates only
commands/modes/ops, while DS10's current deletion gate checks for zero Python commands;
neither names the Python web process or these JSON/browser contracts. This confirms an
ownership gap rather than an implementation defect in CR050–CR053.

### Implementation evidence

- Authored `CV22.DS7.US9 — Workspace And Web Hierarchy Parity` as the bounded
  non-command retirement rider. Its stable owner matrix assigns every hierarchy
  producer, endpoint, adapter, JavaScript consumer, oracle, evidence package, and
  convergence gate.
- US9 explicitly reuses DS7.US1/CR051's recursive `JourneyOption` primitive and CR052's
  parent creation/movement seams. It forbids a second hierarchy algorithm and keeps
  migration `017` as a derived projection.
- The US9 contract names exact semantics for Workspace `journeys`, recursive
  `journeyMap`, root-to-selected `locationPath`, immediate `nearbyJourneys`, selector
  `depth`/`lineage`, malformed-state visibility, parent/create adapters, selected Scene
  scope, and the existing JavaScript renderers.
- Non-inheritance is now executable future acceptance: ancestors receive distinct
  conversations, memories, tasks, attachments, status, and synthesis signals, while the
  selected deep journey must expose only its own records.
- DS7's framing, inventory, validation, seam boundaries, candidate table, done condition,
  and non-goals now include US9 without altering the numerical command denominator.
- Authored a bounded `CV22.DS10 — Python Retirement And npm Distribution` convergence
  gate. It names only CR054's required web-process, endpoint-inventory, static-asset, and
  Python-deletion boundary; general DS10 planning remains deferred until that story is
  pulled. DS10 consumes rather than redefines US9 hierarchy semantics.
- CV22's strangler mechanics, journey-absorption narrative, Delivery Story table,
  sequencing, and done condition now prevent a zero command count from hiding continued
  Python ownership of the released Workspace/web surface.
- No Python/TS Workspace implementation, HTTP route, JavaScript behavior, schema,
  production data, package, or release state changed.

### Validation evidence

- A mechanical matrix check confirms `11/11` hierarchy contracts have a non-empty
  implementation owner, oracle/evidence requirement, and convergence gate.
- DS7 links US9 from its canonical candidate table and requires it independently of the
  command count.
- CV22 links the authored DS10 package, and DS10 blocks deletion on US9 plus a complete
  endpoint/process/asset inventory.
- Documentation links, anchors, heading codes, and `git diff --check` pass.

## Review

The ownership split is intentionally asymmetric: US9 makes released hierarchy meaning
portable and testable; DS10 later changes the executable server/package authority. This
prevents both a premature all-web rewrite in DS7 and a semantics rediscovery during
irreversible Python deletion.

No corrective debt action is required for CR054. The missing implementation and browser
evidence are now explicit planned work under US9, not hidden migration debt. General web
endpoint transfer remains visibly gated under DS10, while broader DS10 distribution
planning remains deferred until pull.

## Outcome

Accepted by the Navigator and completed as an ownership-only roadmap change.
Implementation commit `98d8131` passed Docs CI run `32056389258`; the canonical
Workbench records CR054 as `done`. No Workspace/web code port, Python retirement, or
future US9/DS10 execution was included.
