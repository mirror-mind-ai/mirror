# Delivery Story Plan — CV23.DS2

**Journey:** mirror-mind-development
**Method:** ariad
**Navigator Flow Unit:** delivery_story
**Status:** Approved as the DS2 realization of the CV23 plan

## Delivery Story

Linearizable Projection Publication Kernel

## Objective

Deliver one production-grade filesystem kernel for registered Journey
projections with canonical confinement, per-Journey cross-process linearizability,
immutable snapshot receipts, atomic projection-plus-manifest publication,
explicit rollback/divergence semantics, stale-manifest lost-update prevention,
and consistent inspection.

## Child Work Packages

- CV23.DS2.TS1 — Confine paths and exclude Journey publishers
- CV23.DS2.TS2 — Publish with immutable receipts and rollback
- CV23.DS2.TS3 — Merge manifests without lost updates
- CV23.DS2.US1 — Inspect a consistent current projection

## Scope

1. Add a root-authority service accepting only a Journey ID and an injected
   registered-root resolver. Unknown/missing roots fail before publication.
2. Add canonical path construction under `.mirror/projections/`, rejecting
   invalid identifiers, existing symlinks in managed components, and any
   resolved path outside the canonical Journey root.
3. Add one cross-platform `filelock`-backed inter-process exclusion file per
   Journey. Lock acquisition is bounded and all same-Journey publication and
   inspection operations participate; different Journeys use different locks.
4. Add immutable internal receipt records keyed by namespace, projection, and
   snapshot ID. Create-once semantics bind the ID to canonical-byte digest,
   source revision, contract, and schema. Same bytes retry; different bytes fail.
5. Add same-directory temporary writes, file flush/fsync, atomic replace, and
   strongest-supported directory durability helpers.
6. Publish projection before a freshly merged manifest under one lock. The
   manifest is always re-read after lock acquisition; no pre-lock state can be
   committed.
7. Preserve unrelated manifest entries and prevent two concurrent publishers
   from losing each other's updates.
8. Restore prior projection bytes after controlled pre-manifest failure. If
   restoration fails or an interrupted process leaves mixed state, return
   `projection_divergence` and retain bounded receipt evidence.
9. Make manifest replace the successful operation's linearization point. Once it
   commits, later transport/render failures do not roll the publication back.
10. Inspect under the Journey lock and validate manifest entry, document schema,
    identity, source revision, snapshot ID, and receipt digest without repair.
11. Add deterministic failure injection at every boundary named by the CV23
    verification guide.

## Non-Goals

- No CLI `rebuild-operational`, production `inspect`, or extension façade wiring;
  later stories expose the kernel.
- No Ariad compiler or lifecycle refresh.
- No test-only probe commands.
- No automatic repair API. Inspection is read-only.
- No database migration, TypeScript implementation, model/network call, or
  Nautilus dependency.
- No preservation guarantee for an incomplete operation killed after projection
  replace beyond explicit divergence plus immutable recovery evidence; completed
  controlled failures must restore the previous state when safe.

## Design

```text
JourneyProjectionService
  root_resolver(journey_id) -> registered canonical root
  publish(document, domain_schema)
  inspect(journey_id, namespace, projection)
                 ↓
ProjectionStore
  secure paths
  JourneyPublicationLock
  immutable receipt store
  atomic byte writer
  manifest merge / rollback / divergence checks
```

### Managed layout

```text
<journey-root>/.mirror/projections/
  current.json
  .publication.lock
  .receipts/<namespace>/<projection>/<snapshotId>.json
  <namespace>/<projection>.json
```

Receipts are internal and never manifest entries. Temporary files stay inside
the target directory and are removed on bounded failure.

### Inter-process exclusion

Use the maintained pure-Python `filelock` package, which delegates to OS locking
on POSIX and Windows. The lock timeout is configurable for tests and bounded in
production. Lock acquisition occurs only after validated root/path preparation
and before reading current public state. The lock remains held through receipt
creation, projection replace, manifest merge/replace, rollback or divergence
bookkeeping, and directory durability.

The same lock is exclusive for inspection. This intentionally favors simple,
provable consistency over read concurrency at personal-Journey scale.

### Lost-update prevention

The service may perform schema/serialization work before locking, but it may not
retain manifest state from that phase. Under lock it reads and validates
`current.json`, verifies the current entry/document pair when present, copies the
fresh projections mapping, replaces exactly one key, validates the complete next
manifest, and publishes it. A two-subprocess barrier test forces stale pre-lock
observations and proves both unrelated entries survive.

### Receipt identity

The deterministic receipt contains only:

```json
{
  "contractVersion": "1.0",
  "schemaVersion": "1",
  "journeyId": "...",
  "namespace": "...",
  "projection": "...",
  "snapshotId": "...",
  "sourceRevision": "sha256:...",
  "documentDigest": "sha256:..."
}
```

It is serialized canonically and installed with exclusive create semantics.
Existing identical receipt means idempotent retry. Any field/digest difference is
`projection_divergence` before public replacement.

### Atomic sequence

1. resolve and validate registered Journey root;
2. validate document/domain and canonical serialization;
3. validate managed paths and acquire Journey lock;
4. recheck managed paths under lock;
5. read/validate current manifest and current target pair;
6. verify or create immutable receipt;
7. stage/fsync projection temp;
8. atomic replace projection and sync target directory;
9. build/validate fresh merged manifest;
10. stage/fsync manifest temp;
11. atomic replace manifest (linearization point) and sync projection root;
12. return structured publication.

Controlled failures after step 8 and before step 11 atomically restore the prior
projection or remove a newly introduced one, sync the directory, retain the old
manifest, and return publication failure. Failed restoration becomes explicit
divergence. Failure after step 11 is a committed publication; response code must
not invite automatic duplicate publication.

## Acceptance Behavior

- Unsafe or symlinked paths fail before public byte changes.
- Same-Journey subprocesses have one observable total publication order.
- Different-Journey subprocesses do not share one global lock.
- Killed/failed lock holders release OS exclusion; later acquisition succeeds.
- Receipt ID reuse with different bytes fails before projection replacement.
- Controlled failure at each pre-manifest boundary preserves/restores the old
  manifest/document pair.
- Concurrent unrelated publications preserve both entries.
- Concurrent same-projection success order equals final manifest/document state.
- Inspection never returns a mixed pair and never repairs.
- Errors/logs disclose no document, private root, environment, or receipt payload.

## Validation Route

Driver-owned validation uses unit failure injection, real subprocess lock/lost-
update tests, isolated temporary Journey roots, process termination tests, and a
portable worker module. Run focused tests, full keyless suite, Ruff, format,
focused mypy, docs lint, and unchanged acceptance-kit integrity/self-tests. The
external black-box contract remains incomplete until later CV23 routes land.

## Implementation Contract

- TDD, including red tests for concurrency and every controlled failure boundary.
- Never use production/development DB or Journey roots as fixtures.
- No process-local-only lock and no manifest read outside lock for publication.
- No implicit repair in inspect.
- No silent weakening on Windows; lock/durability posture is documented and
  platform-conditioned only where the OS genuinely differs.
- Keep storage mechanics independent of Ariad and extensions so all producers
  must reuse one kernel.
