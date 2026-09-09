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

Ordering note: TS5 is last in the DS7 ops tail precisely because of this gate.
It cannot be pulled forward without reintroducing the dual-writer window.

## Command Surfaces Assigned From DS7 (decision 2026-09-07)

The [DS7.TS1 ops-tail decision](../../../decisions.md#cv22ds7ts1-ops-tail-runtime-splits-rehearsal-and-legacy-migration-retire-in-ds10)
assigns three Python command surfaces to DS10 instead of porting them at parity.
They are excluded from the DS7 burn-down denominator (30) and served by Python
fallback until DS10 acts on them:

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
  smoke coverage; `migrate-legacy` and `memory-rehearse-migration` are removed with their
  cutoff documented in the release notes.
- Python deletion, package rename, npm publication, stable promotion, tag, and release
  remain separate Navigator-authorized actions.

## Out Of Scope Until Pulled

This document records the CR054 convergence owner and deletion gate only. It does not
pull DS10, authorize endpoint implementation, define the complete future npm release
plan, delete Python, rename packages, publish artifacts, promote stable, tag, or release.
Those decisions require DS10's own planning and Navigator gates.
