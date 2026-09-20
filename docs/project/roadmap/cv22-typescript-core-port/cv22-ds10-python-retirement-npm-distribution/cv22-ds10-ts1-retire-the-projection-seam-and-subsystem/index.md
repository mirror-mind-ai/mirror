[< Parent](../index.md)

# CV22.DS10.TS1 — Retire the projection seam and subsystem

**Status:** ✅ **Done — 2026-09-19.** Pulled as a port, re-authored the same day as a
retirement, implemented in four plateaus, Navigator validation accepted. TypeScript writes
spawn no Python; the subsystem, its CLI, its Extension API capability, its tests, its
fixture, and `filelock` are deleted; the cutoff is staged for the CV22 release note
**Type:** Technical Story
**Depends on:** CV22.DS7.US7 and CV22.DS7.US8 (the TypeScript Explorer and Builder writes
that spawn the seam today); the [retirement decision](../../../../decisions.md#journey-projections-retire-with-the-python-core-mirror-desktop-is-outside-the-migration)

---

## Outcome

TypeScript writes no longer spawn Python for anything. The `journey-projection refresh`
seam, its four TypeScript call sites, the `journey_projections` subsystem, its CLI, its
Extension API capability, and its tests and fixture are deleted; `.mirror/projections` is
no longer published by Mirror; the `mirror.journey-projections@1.0` contract is sunset
with a documented cutoff. After this story the TypeScript core is self-sufficient for
every Builder and Explorer write, which is why it stays DS10's first act.

## Story Statement

As the owner of a Mirror that current users run through Pi, Gemini CLI, Codex, and
Claude Code,
I want the one place where TypeScript still depends on Python at runtime — the
post-commit projection refresh — removed, together with the subsystem it fed,
so that Python retirement is a deletion with no live caller left behind, and the
migration does not carry a read model that none of those users consume.

## What Changed On 2026-09-19

This story was pulled as a **port** — 2,500 lines of Python, a cross-process lock design,
a DS9-sized plan ([kept as declined](plan-declined-port-revision-2.md), with its
[test guide](test-guide-declined-port-revision-2.md), as the record of what was
considered). The panel's
product-designer lens asked who reads the tree. The answer: nothing in this repository —
not the web console, not TypeScript, not a skill, not any of the seven installed
extensions. The reader is **Mirror Desktop**, the Tauri app formerly incubated as Nautilus
Harness, which reads `current.json` and shells out to `journey-projection inspect`.

The Navigator then decided that Mirror Desktop is outside the migration: it is alpha,
has one user, and is bound to the Python era in ways deeper than projections (it imports
`MemoryClient` from Mirror's source tree through two bundled scripts, and its runtime
binding requires `src/memory` and `pyproject.toml`). Its integration with the TypeScript
core is a later, separate effort, and that effort will define its read model anew.

With the only reader deferred, the subsystem has no consumer the migration serves. It is
retired with the Python core rather than ported. The contract's two-owner premise —
a consumer that must read files because it cannot depend on Mirror internals — no longer
holds for a first-party app.

## What Is Deleted

**TypeScript — the seam.** `ts/src/explorer/projectionRefresh.ts` (112 lines: the spawn of
`uv run python -m memory journey-projection refresh`) and its call sites:
`exploreRoute.ts:207`, `:318`, `:453`; `buildRoute.ts:387` via `cli.ts:1689`;
`story.ts:741` (`projectionRefreshRequested`). The `ProjectionRefreshSeam` interface and
`noProjectionRefresh` go with them unless a test still needs the seam shape — in which
case the shape stays and the spawn goes.

**Python — the subsystem.** `src/memory/journey_projections/` (twelve modules, 2,222
lines), `src/memory/cli/journey_projection.py` (309), the `journey-projection` entry in
`__main__.py`, `Store.request_projection_refresh` and its call sites in
`builder/workbench.py` and `builder/lifecycle.py`, the projection wiring in
`extensions/api.py` and `extensions/loader.py`, `client.py`'s `projection_refresh`,
`tests/unit/memory/journey_projections/`, `tests/unit/memory/cli/test_journey_projection.py`,
`tests/integration/memory/journey_projections/`, and
`tests/fixtures/journey_projections/`. The `filelock` dependency is used only here; it
leaves `pyproject.toml` now rather than waiting for TS5.

**Contract and docs.** `REFERENCE.md`'s `journey-projection` row and *Journey Projection
Contract* section; `docs/product/extensions/api-reference.md`'s `journey_projections`
section (Extension API capability removed — coordinated with TS2, which owns the
extension runtime and its version); CV23's index gains a sunset note; the release note
carries the cutoff.

**Not deleted.** `.mirror/projections/` trees that exist on disk. They are gitignored
(`.gitignore:27`), inert, and Mirror Desktop's last Python-bearing runtime can still read
them. The web console's `<mirror-home>/web/` disposition in US1 is the pattern: recorded,
not orphaned.

## Cutoff

Named in the release note for the version that removes it: `python -m memory
journey-projection` and Extension API `journey_projections` no longer exist;
`.mirror/projections` is no longer published; consumers of `mirror.journey-projections@1.0`
— today, Mirror Desktop — stay on the last Python-bearing release until Desktop's
integration with the TypeScript core defines its read model. The consumer's acceptance
kit (`mirror-desktop/contracts/mirror-journey-projections/v1/`) is not edited; it simply
has no runtime to run against after the cutoff.

## Acceptance Behavior

```text
Given a TypeScript Explorer or Builder write on any Journey
When  it commits
Then  no process is spawned: no uv, no python — verified by a no-spawn guard, not
      by reading the code
And   the write's surfaces are byte-identical to before (the refresh never reached
      stdout, so nothing user-visible changes)
And   nothing is written under .mirror/projections

Given the repository after the change
Then  no file matches journey_projection|journey-projection|projectionRefresh outside
      Git history and the roadmap, and Python tests and TypeScript tests are green

Given an extension that calls api.journey_projections on the Python side
Then  it fails with a clear "capability removed" error, not an AttributeError —
      until TS2 deletes the compat host and the question disappears

Given Mirror Desktop bound to the last Python-bearing release
Then  it keeps working — this story ships no user-visible change to that release
```

## Scope

- The deletions above, in one merge: TypeScript seam first (the core stops spawning
  Python), then the Python subsystem and its tests, so no intermediate commit has a
  caller with nothing to call.
- A no-spawn guard in the TypeScript test suite: Explorer and Builder writes under a
  `child_process` spy spawn nothing.
- `REFERENCE.md`, `api-reference.md`, CV23 index note, release-note cutoff, DS10 parent
  gate rewritten from "port" to "delete".
- `docs/project/decisions.md`: the 2026-09-09 decision (Python stays the single writer
  until retirement; TS5 as DS10's first act) is superseded — there will be no TypeScript
  writer. Recorded once, here, and linked from the story.

## Out Of Scope

- Any TypeScript projection code. Nothing is built.
- Mirror Desktop, in any form: its bundled scripts, its runtime binding, its invocation
  of `journey export-registry` / `mutate` / `conversations append` / `recall`. The
  [Desktop inventory](../index.md#mirror-desktop-is-outside-the-migration) lives in the
  parent package for the integration effort that follows the migration.
- `journey export-registry` and `journey mutate` — retired with cutoff in **TS4**; their
  front-door mis-route is **CR089** (RS009).
- The extension compatibility host (**TS2**), which decides how a Python extension
  reaching a removed capability is told so.

## Validation

Navigator-visible route plus automated checks:

1. Run a Builder lifecycle transition on this repository with process spawning traced
   (`MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS` irrelevant; a `child_process` spy in the test,
   `ps`/`fs_usage` in the E2E). Expected: no `uv`, no `python`; the surface renders as
   before; `.mirror/projections/current.json`'s mtime does not move.
2. `uv run pytest` and `npm test` green; `rg journey_projection` finds only roadmap,
   decisions, and release notes.
3. Mirror Desktop, pointed at the last Python-bearing tag, still inspects a projection —
   the cutoff is real for the version after, not the version before.

## Outcome

Done 2026-09-19. Four commits:

| | Commit | |
|---|---|---|
| Guard + TypeScript | `2c0ef765` | +251/−482 |
| Python subsystem | `a3bca6ad` | +50/−5,528 |
| Docs and cutoff | `4c9e45d5` | docs only |
| Closure | this one | validation, review, status |

The guard was written first and failed against the live seam — two spawns from the
Builder path, one from the Explorer path — then passed against its absence. It greps the
process table through a `PATH` shim rather than spying on `node:child_process`, so it
catches a spawn from any module, including one a later story adds.

**Validation:** 2372 TypeScript and 2656 Python tests, both suites green with no surface
golden changed; ruff, biome, doc links, skill parity, and oracle drift clean; and a real
front-door Builder write on the production journey under the shim with an empty spawn log
and an unmoved `current.json`. Navigator accepted 2026-09-19.

**Debt:** deferred, both carried to the stories that own their subject — **D-018**
(Extension API `VERSION` still says `1.1`, TS2's to decide) and **D-019** (the lifecycle
corpus's unasserted `projection_requests`, which TS5 removes with the oracle).

**What the deletion taught.** The projection wiring was holding a test fixture together
by accident: `test_story_plan_preauthorization.py` let its `MemoryClient` fall out of
scope and survived only because the store held a callback whose closure referenced the
client. Removing the seam collected the client mid-test and closed the database under it.
A retirement is not only subtraction — it exposes what was leaning on the thing removed.
