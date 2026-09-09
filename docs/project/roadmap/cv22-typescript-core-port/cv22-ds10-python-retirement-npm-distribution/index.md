[< CV22 TypeScript Core Port](../index.md)

# CV22.DS10 — Python Retirement And npm Distribution

**Status:** 🟡 Planned
**Type:** Delivery Story — convergence gate only; not yet pulled
**Depends on:** CV22.DS7 command burn-down and Workspace/web hierarchy rider; CV22.DS8
live-provider cutover; CV22.DS9 TS MCP server

---

## Outcome

Python deletion cannot begin merely because the CLI command denominator reaches zero.
The Python-owned web process, its endpoint inventory, and its static assets must first
have explicit TypeScript runtime/package ownership. DS10 owns that final process and
packaging convergence; it consumes the hierarchy semantics assigned to CV22.DS7.US9.

## Workspace And Web Convergence Gate

Python core deletion is blocked until all of the following are true:

1. [CV22.DS7.US9](../cv22-ds7-command-burn-down/cv22-ds7-us9-workspace-web-hierarchy-parity/index.md)
   is done and its hierarchy owner matrix is fully evidenced.
2. Every route in `src/memory/web/server.py` appears in a complete endpoint inventory
   with one TS implementation owner and a parity or approved-retirement disposition.
3. A TS-owned web process serves every retained endpoint and the required static assets
   without spawning or importing Python.
4. The recursive Workspace/browser contract passes US9's JSON, selected-scope,
   malformed-tree, adapter, JavaScript, and browser evidence.
5. Startup, shutdown, configuration, database-open, and error-reporting behavior have
   operational smoke coverage for the replacement process.
6. Static assets are included and verified in the future package artifact rather than
   loaded through an undeclared repository checkout.
7. A repository and packaged-artifact check proves no web path falls back to
   `python -m memory web` or another Python subprocess.

## Extension Compatibility-Host Deletion Gate

CV22.DS7.TS2 transfers extension context dispatch to TS through the language-neutral
`mirror-context-v1` protocol while temporarily preserving Python-only providers through
`memory.extensions.compat_host`. Before Python retirement or npm publication, DS10 must:

1. delete the compatibility host and every TS launcher branch that invokes it;
2. prove the packaged artifact contains no core-owned Python extension-provider bridge;
3. document the final migration cutoff for capabilities without `provider_runtime`;
4. make unmigrated providers fail explicitly and fail-soft rather than silently losing
   context; and
5. run a repository/package check proving every retained extension context provider enters
   through a declared language-neutral command.

This gate does not require provider authors to use JavaScript. Extensions may own any
executable runtime; the Mirror core must not own Python as their permanent compatibility
layer.

## Skill Invocation Gate

Python deletion is not only a code question: **the skills invoke it by name.**

[CR071](../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr071-collapse-the-triplicated-skill-command-references.md)
found on 2026-09-09 that eleven skills reached the front door on Pi while still
calling `uv run python -m memory` directly on Claude Code and the published
plugin — including `journeys`, flipped in DS3. The invocations were repaired and
`scripts/check_skill_command_parity.py` now fails CI when a flip updates one
copy and not the others.

That check guarantees the three copies AGREE. It does not guarantee they have
stopped calling Python, and after DS10 they must. Before Python retirement or
npm publication, DS10 must:

1. confirm no skill copy in any runtime invokes `uv run python -m memory`, in
   any of `.pi/skills/`, `.claude/skills/`, or `plugins/mirror-mind/skills/`;
2. give the parity check a second assertion — the Python entry point is not
   merely consistent, it is absent — or replace it with that assertion;
3. verify the packaged plugin's invocation form resolves for an installed user,
   not only inside a runtime clone.

The residue at the time of writing (2026-09-09, corrected the same day by the
CR068 inspection) is larger than CR071 recorded. **Nine skills whose routes
already point at TypeScript still invoke `uv run python -m memory` directly**:
`mm-tasks`, `mm-week`, `mm-consolidate`, `mm-shadow`, `mm-consult`, `mm-mute`,
`mm-new`, `mm-discard`, and `mm-mirror`. Their families were flipped in
DS7.US2–US5 and DS5, but a flipped route reaches a live session only if the
caller enters the front door, and these skills never did — so those flips have
been real for the Pi extension and the smoke, not for the skill a Navigator
types. [CR072](../../../refinement/rs009-cv22-front-door-routing-correctness/cr072-route-every-skill-through-the-front-door.md)
(RS009) owns the repair and brings item 2 above forward: the parity check gains
its "Python entry point absent" assertion when CR072 lands, not at DS10.

The remaining residue after CR072 is the unported set: `mm-build` (the Ariad
lifecycle, until DS7.US8), `mm-journal` (until DS7.US11), `mm-update` (the
`runtime` update half, redesigned here), and `mm-identity`'s `identity edit`
(assigned to DS7.TS4 on 2026-09-09 as a `spawnSync($EDITOR)` port — "kept on
Python by design" was never a disposition once Python is deleted). Each needs
an explicit answer here, not an assumption that the burn-down covered them.

## Journey Projection Refresh Seam Deletion Gate

The [2026-09-09 decision](../../../decisions.md#journey-projection-publication-stays-python-owned-until-the-retirement-window)
keeps Journey projection publication Python-owned for the whole transition,
because publication is linearizable through `fcntl.flock` and a TypeScript
publisher would be a second writer with no mutual exclusion against Python's
lock. TypeScript commands that produce a refresh — Explorer Story writes
(DS7.US7), the Builder tree (DS7.US8) — delegate it to Python through a
`journey-projection refresh --journey <slug>` subcommand carrying
`ProjectionRefreshCoordinator` semantics.

That subcommand is Python surface added deliberately to a component being
retired. Before Python retirement or npm publication, DS10 must:

1. land CV22.DS7.TS5, so TypeScript owns projection compilation and publication
   and is the **only** writer of `.mirror/projections`;
2. delete the `journey-projection refresh` subcommand and every TS call site
   that spawns it;
3. prove the packaged artifact spawns no Python for a projection refresh;
4. prove the TS publisher holds a single-writer lock appropriate for one core,
   since the `fcntl.flock` compatibility constraint that forced this seam
   disappears with Python; and
5. confirm the refresh remains best-effort after the source commit — a failed
   projection must never fail the Explorer or Builder write that requested it.

Ordering note: **TS5 was reassigned from DS7 to DS10 on 2026-09-09.** A story
that can only land in the act that retires Python's publisher is a retirement
story, and leaving it in DS7 meant DS7 could never close on its
deterministic-command promise. TS5 is DS10's first act: port the compiler and
publisher, cut over, and delete the Python publisher and the `refresh` seam in
one flip, so the dual-writer window never opens. It cannot be pulled forward
into the DS7 remainder without reintroducing that window. `journey-projection`
left the DS7 command denominator with it (30 → 29).

## Command Surfaces Assigned From DS7 (decision 2026-09-07)

The [DS7.TS1 ops-tail decision](../../../decisions.md#cv22ds7ts1-ops-tail-runtime-splits-rehearsal-and-legacy-migration-retire-in-ds10)
assigns three Python command surfaces to DS10 instead of porting them at parity,
and the [2026-09-09 re-sequencing decision](../../../decisions.md#cv22-makes-the-ported-work-real-before-porting-more)
adds three more (items 4–6). They are excluded from the DS7 burn-down
denominator (29) and served by Python fallback until DS10 acts on them:

1. **`runtime` update/release half** — `update`, `pull`, `stable`, `backup`,
   `release-doctor`, `release-promote`. This is the git-based updater over the
   runtime clone that v0.8.0 introduced (`main` integration, `stable` channel,
   dry-run planning, fast-forward execution, updater self-recovery, tag push).
   npm distribution redesigns the mechanism (versioned installs, dist-tags) rather
   than porting it; whether `release-promote` belongs in the product command
   surface at all, or in release tooling, is a DS10 design decision. The read
   half (`status`, `version`, `diagnose`, `release-notes` — `latest` and
   `pending` are arguments of `release-notes`, not subcommands) is ported by
   DS7.TS3 and is not DS10 scope.
2. **`migrate-legacy`** — the Portuguese-era (`travessia` → `journey`, pre-CV0)
   database conversion. Retired unported, with a documented cutoff in the release
   notes: Portuguese-era databases must be migrated with a pre-DS10 release. The
   tool remains in git history and the last Python-bearing release can still run
   it. Same cutoff pattern as the extension compat host above.
3. **`memory-rehearse-migration`** — the `pyproject.toml` console script
   (`cli/migration_rehearsal.py`) that rehearses the Python migration engine on a
   DB copy. Retired unported: DS6 moved migration custody to TS and proved the TS
   engine over real legacy copies, so the tool validates a retired engine. A TS
   rehearsal tool, if ever wanted, is separate scope against the TS engine.
4. **`journey-projection`** (all subcommands) and the `journey_projections`
   subsystem — CV22.DS7.TS5, reassigned here. Ported and cut over as DS10's
   first act; see the seam deletion gate above.
5. **The SQLite Refinement Workbench** — `build refinement-story
   create|overview|park|pull` and the eleven `build change-request` verbs
   (fifteen of the Builder tree's 42 leaves). CV20.DS12 delivered the
   document-first Workbench and made `docs/project/refinement/index.md` the
   canonical RS/CR authority; `mm-build` reaches the SQLite path only when that
   index is absent. Retired unported with a documented cutoff (US8 decision D1,
   2026-09-09): a journey still carrying SQLite Workbench rows must adopt the
   document-first index with a pre-DS10 release. Existing rows stay readable
   through the last Python-bearing release. DS7.US8 ports the remaining 27
   leaves and must not spend parity effort on these fifteen.
6. **`conversations --metadata-backfill-preview|-apply`** — the one-shot
   backfill of pre-ES-001 conversation rows (CV9.DS7). Retired unported: the
   lifecycle *engine* is on TS (DS7.US10) and its operator faces are wired by
   DS7.US11; the backfill ran once and validates nothing after that. Cutoff
   documented in the release notes with the others.

## Ownership Boundary

- DS7.US9 owns recursive hierarchy DTOs, deterministic hierarchy adapters, and browser
  compatibility evidence.
- DS10 owns final web-process cutover, the complete endpoint inventory, static-asset
  packaging, and the Python deletion gate.
- DS10 must not redefine metadata parent authority, recursive ordering, cycle bounds,
  movement validation, conservative removal, or selected-journey isolation.

## Done Condition

- DS7.US9 and every other prerequisite selected when DS10 is pulled are done.
- Every Python web route has explicit TS ownership or approved retirement evidence.
- The TS process and packaged static assets pass the complete web convergence gate.
- No web execution path depends on Python.
- The DS7.TS2 legacy extension context host and every core-owned launcher for it are removed.
- The `runtime` update/release path has a TS-owned npm-era replacement with operational
  smoke coverage; `migrate-legacy`, `memory-rehearse-migration`, the SQLite Refinement
  Workbench verbs, and the ES-001 backfill flags are removed with their cutoffs
  documented in the release notes.
- TS5 is done: TypeScript is the only writer of `.mirror/projections`, and the
  `journey-projection refresh` seam and its TS call sites are gone.
- No skill copy in any runtime invokes `uv run python -m memory`, and the skill parity
  check asserts the entry point is absent (CR072 brought the assertion forward; DS10
  verifies it holds for the packaged plugin).
- Python deletion, package rename, npm publication, stable promotion, tag, and release
  remain separate Navigator-authorized actions.

## Out Of Scope Until Pulled

This document records the CR054 convergence owner and deletion gate only. It does not
pull DS10, authorize endpoint implementation, define the complete future npm release
plan, delete Python, rename packages, publish artifacts, promote stable, tag, or release.
Those decisions require DS10's own planning and Navigator gates.
