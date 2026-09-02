[< CV23](index.md)

# CV23 — Journey Projection Contract: Delivery Plan

**Status:** Draft for Navigator approval
**Contract:** `mirror.journey-projections@1.0`
**Implementation authority:** Python Core

## 1. Delivery Strategy

Build the capability from the trust boundary inward:

1. adopt the public contract and stable error vocabulary;
2. prove the secure publication kernel independently of Ariad meaning;
3. expose the same kernel through a namespace-bound Extension API;
4. compile the Ariad Operational document from durable sources;
5. connect successful Ariad mutations to post-commit refresh;
6. pass the unchanged consumer probe and full security matrix;
7. publish, install, rerun the probe, and return evidence.

Each Delivery Story receives its own `index.md`, `plan.md`, and `test-guide.md`
before implementation. TDD is mandatory for every behavior and failure point.
No story may absorb the next story merely because its code seam is nearby.

## 2. Contract and Dependency Custody

The Nautilus-owned acceptance kit is immutable acceptance input. Mirror will:

- record and verify its transfer hashes;
- run its self-tests and black-box probe externally;
- implement Mirror-owned models, schemas, fixtures, and tests inside the Mirror
  repository rather than importing files from the Nautilus workspace at runtime;
- not copy the consumer probe or fake Mirror into production code;
- return a proposed amendment if a normative requirement proves unsafe or
  infeasible instead of weakening behavior locally.

JSON Schema 2020-12 validation must use one supported validation authority. The
story plan for DS1 must decide whether to add a focused runtime dependency such
as `jsonschema` or implement an equally complete existing authority; partial
hand-written validation is not acceptable for extension-owned schemas.

## 3. Public Surface

Commands:

```text
python -m memory journey-projection capabilities --mirror-home <home> --format json
python -m memory journey-projection rebuild-operational --journey <id> --mirror-home <home> --format json
python -m memory journey-projection inspect --journey <id> --namespace <id> --projection <id> --mirror-home <home> --format json
```

Test-only commands, available only when `MEMORY_ENV=test` and the selected home
is proven non-production:

```text
journey-projection probe-prepare
journey-projection probe-publish
```

Failures return nonzero with bounded JSON diagnostics. DS1 defines one enum of
stable v1 codes covering:

- unsupported contract;
- unknown Journey;
- invalid identifier;
- unsafe projection path;
- namespace violation;
- schema validation failure;
- serialization failure;
- publication failure;
- projection divergence.

Capability discovery reports the independent Extension API version. Adding
`journey_projections` is additive, but the repository must first record the
baseline version rather than inventing a number only in the capability response.

## 4. Projection Publication Kernel

### 4.1 Registered-root authority and confinement

Production resolution starts from the Journey registry and its canonical
`project_path`. The service validates identifiers before path construction, then
checks every existing path component without following a symlink outside the
registered root. Newly created directories are rechecked before use. Absolute
paths, separators, `..`, empty segments, Windows drive forms, and any resolved
escape fail before public bytes change.

### 4.2 Deterministic bytes

Canonical output is UTF-8 JSON with sorted object keys, two-space indentation,
and one trailing newline. Schema validation precedes serialization and
publication. Source truth determines `sourceRevision`; fixed time and snapshot
inputs are injectable only through explicit test seams.

### 4.3 Linearizability scope

Publication is **linearizable per Journey**, not merely per projection. Every
Core and extension publisher targeting the same registered Journey shares one
inter-process exclusion boundary. Different Journeys may publish concurrently.

The protected critical section begins before reading the current manifest and
ends only after one of these outcomes:

- the new projection and manifest are durably published;
- all reversible public changes are rolled back and durably restored;
- a bounded divergence record has been made after a failure that cannot be
  safely restored.

Inspection joins the same Journey consistency protocol so it cannot return a
manifest from one publication and a document from another. The successful
manifest atomic replace is the publication linearization point.

DS2 must choose and document a cross-platform lock implementation that works in
separate processes on supported Python/Windows platforms. A process-local mutex
is insufficient. Lock acquisition is bounded; timeout returns a structured
publication failure without changing projection, manifest, or receipts.

### 4.4 Explicit lost-update prevention

A publisher must never carry a manifest read before lock acquisition into the
critical section. Under the Journey lock it:

1. re-reads and validates the current manifest;
2. verifies the current entry and projection consistency;
3. merges exactly one `<namespace>:<projection>` entry into that fresh state;
4. preserves every unrelated entry byte-semantically;
5. validates and stages the complete next manifest;
6. publishes projection then manifest under the same lock.

A deterministic two-subprocess barrier test must force both publishers to begin
from the same pre-lock observation. After both complete, the manifest must contain
both entries and each inspection must succeed. The test must fail against an
implementation that merges from stale pre-lock state.

### 4.5 Immutable internal receipts

Before replacing public projection bytes, the kernel creates an internal,
create-once receipt for:

```text
journeyId + namespace + projection + snapshotId
```

The receipt records at minimum the canonical-byte SHA-256 digest,
`sourceRevision`, and contract/schema identity. Receipt bytes are deterministic
and immutable. Receipt paths remain canonically confined under the Journey's
projection area and are not manifest entries or public mutation sources.

Rules:

- absent receipt: create through temporary write, durability boundary, and an
  exclusive no-overwrite publish;
- existing receipt with the same digest and identity: idempotent retry may
  continue;
- existing receipt with different canonical bytes or identity: reject before
  public publication;
- a receipt may survive a failed candidate publication as internal evidence;
  it does not make that candidate current;
- inspection never treats a receipt as public projection authority;
- explicit repair may use receipts in a future bounded path, but v1 inspection
  performs no repair implicitly.

### 4.6 Publication sequence and durability

The implementation follows the contract's observable order:

1. resolve Journey and producer authority;
2. validate identifiers and confinement;
3. validate envelope and domain schema;
4. serialize deterministic bytes;
5. acquire Journey inter-process exclusion;
6. re-read and validate current state;
7. verify/create immutable receipt;
8. stage and flush the projection temp file in the target directory;
9. atomically replace the projection and complete its platform durability step;
10. merge, validate, stage, and flush the fresh manifest;
11. atomically replace the manifest and complete its durability step;
12. release exclusion and return structured success.

The precise directory-fsync posture for POSIX and Windows must be documented and
tested to the strongest supported boundary rather than claimed generically.

### 4.7 Partial failure posture

- Before projection replace: projection and manifest remain byte-identical.
- After projection replace but before manifest replace: previous manifest remains
  authority; the operation attempts an atomic restoration from the prior valid
  receipt/bytes and returns failure, never success.
- If restoration succeeds, inspection continues to return the previous valid
  pair while diagnostics report the failed publication.
- If restoration is impossible or the process dies, inspection reports
  `projection_divergence`; it does not repair silently. Receipts retain bounded
  evidence for explicit recovery.
- After manifest replace: publication is committed. A later response/rendering
  failure must not claim rollback or issue a second publication.
- Ariad refresh failure never rolls back already committed Ariad truth.

## 5. Extension API

`ExtensionAPI` receives a stable `journey_projections` façade bound at
construction to `extension_id`. Extensions do not import Journey, Builder, path,
or storage internals.

```python
api.journey_projections.publish(
    journey_id,
    projection_id,
    document,
    schema=None,
)

api.journey_projections.inspect(journey_id, projection_id)
```

The façade verifies envelope namespace and producer identity against the bound
extension, forbids `ariad`, validates the shared envelope and optional extension
schema, and delegates to the one publication kernel. The raw Extension API
SQLite escape hatch grants no filesystem projection authority.

## 6. Ariad Operational Compiler

The compiler reads only durable, represented sources:

- authored roadmap order and story packages;
- durable Builder active position and checkpoint state;
- durable Exploratory Story records and public handoff metadata;
- canonical document-first Refinement index and story/CR metadata;
- compatibility sources only where existing Mirror authority already permits
  them.

It reuses existing roadmap grammar and story-path resolution rather than adding
another regex family. It emits Journey-relative references and public summaries,
never file bodies, transcripts, prompts, raw reasoning, environment variables,
session-private state, or private narrative evidence.

`sourceRevision` hashes canonical representations of every represented durable
source and active state. Authored order wins where represented; otherwise stable
IDs order records. Fixed timestamp and snapshot ID injection are test-only.

## 7. Lifecycle Refresh

First prove explicit `rebuild-operational`. Then inventory every mutation that
changes represented state across Delivery, Explorer, and Refinement. Those
mutations request refresh only after their durable truth commits.

One refresh coordinator owns failure posture:

- successful refresh is quiet;
- refresh invokes no model or network;
- refresh failure does not roll back source truth;
- previous consumer state remains valid when restoration is possible;
- unresolved divergence is surfaced through bounded operational diagnostics;
- no command implements a private publication shortcut.

## 8. Test-Only Probe Preparation

`probe-prepare` accepts a fixture root only when all guards pass:

- `MEMORY_ENV=test`;
- explicitly selected isolated Mirror home;
- selected home differs canonically from configured production home;
- fixture and active-state paths remain inside the synthetic transfer area;
- no production database is opened or copied.

It registers/replaces only the synthetic Journey, loads synthetic active state,
and enables expected fixed IDs/times. `probe-publish` models one bound extension
namespace; caller-selected actor strings never become production authority.

## 9. Documentation and Release

The implementation cycle updates:

- `REFERENCE.md` and command help;
- architecture and public API docs;
- extension API reference, authoring, and testing guides;
- decisions and roadmap status;
- release notes naming contract and Extension API versions.

The release gate includes full local verification, green GitHub Actions, version
and release publication, production backup/update policy, installed capability
discovery, unchanged probe execution against the installed binary with isolated
state, and the consumer-owned `mirror-return.json` record.

## 10. Explicit Exclusions

- no Nautilus implementation or repository changes;
- no Tactical/Strategic semantics beyond generic extension storage;
- no model, prompt, persona, provider, or network call;
- no projection write-back;
- no implicit repair during inspect;
- no production data in tests or return evidence;
- no TypeScript implementation while CV22 remains paused;
- no schema migration unless a later story proves one unavoidable and separately
  passes migration/backup policy.

## 11. Plan Approval Gate

Implementation begins only after the Navigator approves this plan and DS1 is
materialized through the Ariad lifecycle. Each later Delivery Story repeats its
own plan approval gate.
