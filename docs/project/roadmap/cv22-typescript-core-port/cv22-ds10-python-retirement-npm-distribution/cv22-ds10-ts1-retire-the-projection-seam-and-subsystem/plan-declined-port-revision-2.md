> **Declined 2026-09-19.** This is the port plan the panel reviewed. The Navigator decided the same day to retire the subsystem instead; see `index.md`. Kept as the record of why a port was considered and declined.

# Plan — CV22.DS10.TS1

**Revision:** 2 — amended 2026-09-19 after the multi-persona Plan review. Revision 1's
review findings and their dispositions are in the last section.

## Objective

Move `mirror.journey-projections@1.0` — compilation, publication, inspection, the probe
pair, and the extension API — from Python to TypeScript, and delete the
`journey-projection refresh` seam in the same merge, so that `.mirror/projections` has
exactly one writer at every moment a consumer could observe it and the documents it holds
stay byte-identical to the contract's normative fixture across the change.

## Decisions This Plan Takes

**D1 — the publisher's lock: option (B), a pure-Node `O_EXCL` lock file with stale
detection, at the existing `.mirror/projections/.publication.lock` path.**

- The resource being protected is a **filesystem tree identified by the project path**,
  not the database. That rules out (C), `BEGIN IMMEDIATE` on `memory.db`: one project can
  be operated from two mirror homes (`MIRROR_USER` switching), and two Node processes
  holding two databases would not exclude each other while writing the same tree. A mutex
  lives with the resource it guards.
- Interoperability with Python's `flock` — the only thing (A) buys — is worth nothing here,
  because **no step of this story ever needs two engines writing concurrently.** The
  cross-engine proof is read-after-write: TypeScript publishes, Python inspects.
- A revert gate would need interoperability, because a reverted Python CLI could overlap a
  long-running TypeScript process (the MCP server). That is the dual-writer window this
  story exists to never open. No revert gate is a deliberate property.
- (A)'s cost lands on **US3**: a native addon means per-platform prebuilds in an npm
  artifact whose done condition is "a single-language package".

The cost of (B): `O_EXCL` files do not release when a process dies, so staleness detection
(owner pid + mtime heartbeat, bounded steal) is part of the work. Stealing is a new trust
decision Python never made; its limits are written down in the threat note below.

**D2 — all five advertised operations port; `refresh` is deleted.** `capabilities`,
`rebuild-operational`, `inspect`, `probe-prepare`, `probe-publish` are the v1.0 contract
surface the Nautilus kit exercises. Revision 1 proposed retiring the probe pair; that would
have broken the consumer's acceptance kit. `probe.py` and `test_guard.py` port with them.

**D3 — `extension_api.py` ports here, not with TS2.** It is the writer side of the same
store: an extension publishing a namespaced projection takes the same lock, the same
manifest, and the same receipts. One tree, one lock implementation. TS2 keeps the extension
*runtime* boundary; this story keeps the projection *contract*.

**D4 — the oracle is the CV23 normative fixture, not a live baseline.**
`tests/fixtures/journey_projections/operational/` holds a synthetic Journey with fixed
active work and the expected `operational.json` and `manifest.json`, imported from the
consumer's kit. Pinned inputs replayed through both engines are the only comparison that
can distinguish divergence from a newer truth. The real Journey is a liveness check.

**D5 — a refresh outcome must be visible.** The coordinator keeps `latest(journey)` in
memory and Python logged a warning on failure; TypeScript's seam swallowed everything into
an optional diagnostic sink. After the flip there is no other writer to notice a tree that
stopped updating, and the reader is an external consumer. The last refresh outcome per
Journey (`published` / `unchanged` / `failed`, code, time) is persisted and surfaced
through `runtime diagnose`. Mechanism chosen at implementation, kept out of the managed
tree so the contract's file set does not change.

## Threat Note (D1 stale-lock steal)

Assets: the projection tree's consistency and the consumer's trust in it. Actor: a local
process able to write inside `.mirror/projections/`. Abuse: forge or age the lock so a
publisher steals it mid-publish and tears the tree. Containment: steal only when the
owner pid is dead **and** the heartbeat is older than the bound; never steal on age
alone; the stage-fsync-rename sequence means a torn *file* is still impossible — the
worst case is a lost update of the manifest, which `inspect`'s three-way check reports as
divergence rather than serving. Not defended: a live local attacker with write access to
the project tree, who can already delete the tree outright. Same posture as DS9's
threat model: local personal infrastructure, proportional.

## Scope

Ported to `ts/src/journeyProjections/`, one module per Python module, none left without a
disposition:

- `serialization.ts` — canonical JSON, byte-exact with `canonical_json_bytes`.
- `models.ts`, `schemas.ts`, `errors.ts`, `constants.ts` — envelope, manifest, identifier
  validation, `ProjectionErrorCode`, contract/schema versions, the five
  `IMPLEMENTED_OPERATIONS`.
- `store.ts` — `publish` and `inspect`: D1's lock, `mkstemp`-equivalent staging, `fsync`,
  atomic replace, directory sync, `current.json`, receipts keyed by `documentDigest`,
  three-way divergence detection, managed-tree and path-confinement guards,
  restore-on-failure.
- `operational.ts` — the Ariad Operational compiler.
- `refresh.ts` — the coordinator: compile, compare `sourceRevision`, publish only when
  changed, per-Journey serialization, never raise past the post-commit boundary; D5's
  outcome record.
- `probe.ts`, `testGuard.ts` — probe preparation and the isolated-test-home guard.
- `extensionApi.ts` — per D3.
- `journey-projection` as a TS front-door command with the five operations, JSON output
  bounded and payload-free as today.

Rewired and deleted:

- `ts/src/explorer/projectionRefresh.ts` — the spawn replaced by the in-process publisher;
  `noProjectionRefresh` kept for tests and smokes.
- Call sites: `exploreRoute.ts:207`, `:318`, `:453`; `buildRoute.ts:387` via `cli.ts:1689`.
- Deleted: `src/memory/journey_projections/`, `src/memory/cli/journey_projection.py`, the
  `journey-projection` entry in `__main__.py`, `Store.request_projection_refresh` and its
  call sites in `builder/workbench.py` and `builder/lifecycle.py`, `extensions/api.py`'s
  projection wiring, `tests/unit/memory/journey_projections/`,
  `tests/unit/memory/cli/test_journey_projection.py`, and
  `tests/integration/memory/journey_projections/`.
- `REFERENCE.md` — the `journey-projection` row's invocation form and the Journey
  Projection Contract section; `docs/product/extensions/api-reference.md` if the extension
  surface's description changes (it should not).
- `docs/project/decisions.md` — D1 through D5, including the correction that the
  2026-09-09 constraint was never "Node cannot lock" but "Node cannot lock *this* way
  without a native dependency"; and the DS10-level transport finding, recorded in the
  parent package's seam gate as an open decision for US3.

## Non-Goals

- No change to Contract v1: schema, altitudes, manifest shape, receipt format, error
  vocabulary, or the five operations. A change of writer, not of contract.
- The contract's invocation form after Python deletion. The consumer's immutable kit
  invokes `python -m memory journey-projection …`; US3 deletes that form. Decision for the
  Navigator with Alisson at the US3 boundary, not here.
- Running the consumer probe. It is consumer-owned and not on this machine.
- `filelock` stays in `pyproject.toml` until **TS5**.
- No extension compatibility-host work (**TS2**), no eval harness (**TS3**), no npm
  packaging decisions (**US3**) beyond what D1 constrains, no web console (**US1**).
- No revert gate, by D1.

## Plateaus

Resumable units, each ending with a handoff statement in this package:

0. **Oracle check.** Prove the CV23 fixture still reproduces byte-for-byte through Python
   on this machine, with fixed controls. A baseline that Python cannot reproduce is not a
   baseline.
1. **Canonical JSON and the contract types.** The byte spine first: every digest, receipt,
   and divergence check depends on it. Byte-exact against the fixture's documents.
2. **The store.** `publish`/`inspect` with D1's lock; the adversarial matrix and the
   multi-process concurrency tests ported and passing; the stale-lock test.
3. **The compiler.** `operational.ts` against the fixture, plus the confined-parent-link
   topology from CV23.DS8.
4. **The coordinator, the probe pair, the extension API, and the five-operation command.**
   Digest-compare, publish-if-changed, never-raise, D5's outcome record; `probe-prepare`
   and `probe-publish` behind the isolated-test-home guard; `capabilities` reporting the
   same contract and Extension API versions.
5. **Cross-engine proof, before any deletion.** TypeScript publishes a scratch tree;
   Python's `inspect` accepts it. Producible only while Python still exists.
6. **The flip — one merge, two commits.** First commit lands the TypeScript publisher dark
   (no caller). Second commit rewires the four call sites and deletes the Python subsystem,
   the seam, and their tests. Both in one PR so no released state has two writers, and
   history stays reviewable.
7. **Validation and docs.** Navigator route, `runtime diagnose` row, decisions recorded,
   the DS10 seam gate's five items checked off in the parent package, the transport
   finding recorded there as open.

## Acceptance Behavior

```text
Given the CV23 normative fixture, fixed active work, and fixed controls
When  TypeScript compiles and publishes it
Then  operational.json and current.json equal expected/ byte for byte

Given a tree just published by TypeScript, while Python still exists
When  `journey-projection inspect` reads it through Python
Then  it reports ok with no PROJECTION_DIVERGENCE

Given the adversarial matrix CV23.DS6 proved on Python
When  it runs against the TypeScript publisher and command
Then  every refusal still refuses, before any mutation, with bounded payload-free
      diagnostics: traversal in identifiers, symlinked managed components, receipts or
      handoff paths outside the Journey root, probe operations without a proven
      isolated test home, a non-probe actor, a foreign namespace, a production home

Given N concurrent Node publishers for one Journey
When  they race
Then  publication is linearizable, the manifest always names an existing projection,
      and no reader observes a half-replaced tree

Given a lock left by a dead process
When  a new publisher arrives
Then  it is detected and taken within bound, and never on age alone

Given a compile or publish failure after an Explorer or Builder write committed
Then  the write stands, stdout is clean, nothing is raised, the previous projection is
      intact, and `runtime diagnose` shows the failed refresh

Given a real Builder write on this repository after the flip
Then  the tree updates with no Python spawned, and a second identical write reports
      `unchanged` and rewrites nothing

Given the flip has landed
Then  `journey-projection refresh`, createPythonProjectionRefresh, every spawn of it,
      and src/memory/journey_projections/ are gone
```

## Validation Route

**Automated:** the ported unit suites; the adversarial matrix; the multi-process
concurrency and stale-lock tests; the fixture byte comparison; a no-spawn guard proving no
TypeScript path invokes `uv`/Python for a refresh.

**Navigator-visible (E2E: required):**

1. **Bytes:** run the fixture through the TypeScript command; diff against `expected/`.
   Pass: zero bytes differ. Fail: any byte.
2. **Cross-engine:** before deletion, Python `inspect` on a TypeScript-published tree.
   Pass: `ok`. Fail: `PROJECTION_DIVERGENCE`.
3. **Liveness:** a Builder lifecycle transition on this repository — the kind of write
   that published `"activeItem": "CV22.DS10.TS1"` through Python on 2026-09-19.
   Expected observation: `current.json` and `ariad/operational.json` update, `uv` is never
   invoked, nothing about the refresh reaches stdout, `runtime diagnose` shows
   `published` with a timestamp. Pass: all four. Fail: any spawned Python, any refresh
   output on stdout, a write failed by its refresh, or a `diagnose` row that does not move.
4. **Failure visibility:** force a compile failure; `diagnose` shows `failed` with the
   code, and the tree is unchanged.

## Implementation Contract

- TDD or characterization tests for behavior changes; the fixture is the golden, verified
  through Python before any TypeScript is written.
- Keep changes scoped to `CV22.DS10.TS1`.
- Use `uv run` for Python commands and tests.
- Do not use `git add .`; commit only story-scoped files.
- Descriptive English commit messages explaining why.
- Handoff review after validation, per the journey's collaboration strategy.
- CI green on every push.

## Stop Conditions

- `scope_change_detected`
- `plan_rule_conflict`
- `failing_required_check_without_clear_fix`
- `navigator_decision_needed`
- D1 through D5 reopened — implementation stops until the decision is recorded.
- Plateau 0 fails: Python cannot reproduce the fixture on this machine.
- A byte divergence that cannot be closed without changing Contract v1.
- The concurrency or stale-lock test proving unstable: a flaky mutex is a stop, not a
  retry.

## Size

One story, not two. The flip must be atomic at the merge and every plateau before it
produces TypeScript with no caller; a story boundary in the middle would leave either a
dual-writer window or dead code for a whole story. The plateaus are the resumable units.
The two-commit flip (plateau 6) answers the reviewability concern that motivated the split
question.

## Review Findings And Dispositions (revision 1 → 2)

| Lens | Finding | Disposition |
|------|---------|-------------|
| product-designer | No reader found in the repository; port may be unwarranted (the US9 pattern) | **Answered, plan proceeds.** The reader is Nautilus under `mirror.journey-projections@1.0` (CV23). Retirement would break a published contract with an external consumer. Recorded in the story index |
| security-engineer | Confinement and symlink guards are controls, not parity items; golden tests cannot prove a guard still refuses | **Adopted.** The CV23.DS6 adversarial matrix is acceptance, not coverage. Threat note added for the stale-lock steal |
| database-architect | "Same source state" is unpinned across two stores; a live-tree byte mismatch is ambiguous | **Adopted as D4.** The CV23 fixture with fixed controls is the byte oracle; the live Journey is a liveness check only |
| engineer | `probe.py`/`test_guard.py` had no disposition; one-commit flip is review-hostile | **Adopted.** Both port (they implement the probe pair, which D2 now keeps). Flip is two commits in one merge |
| devops-engineer | No recovery path and an invisible failure mode | **Adopted as D5.** Last refresh outcome surfaced through `runtime diagnose`; `rebuild-operational` named as the recovery tool. Recovery of a broken publisher after release remains "fix forward" — the same as every unported subsystem after TS5 |
| ai-engineer | Staleness must be detectable by the consumer | **Already true for the consumer** — `generatedAt` and `sourceRevision` are in the envelope. D5 covers the publisher side |
| teacher (out of panel) | The contract's transport is `python -m memory`, which US3 deletes | **Recorded as a DS10-level open decision** in the parent package; out of TS1's scope |

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
