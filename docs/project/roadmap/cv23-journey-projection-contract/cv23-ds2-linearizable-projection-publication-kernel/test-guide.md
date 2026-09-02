[< Story](index.md)

# Test Guide — CV23.DS2

## Focused Gate

```bash
uv run pytest tests/unit/memory/journey_projections/ \
  tests/integration/memory/journey_projections/
uv run ruff check src/memory/journey_projections \
  tests/unit/memory/journey_projections \
  tests/integration/memory/journey_projections
uv run ruff format --check src/memory/journey_projections \
  tests/unit/memory/journey_projections \
  tests/integration/memory/journey_projections
uv run mypy src/memory/journey_projections
```

All roots must come from `tmp_path`; no DB is opened.

## Path and Authority Tests

- unknown Journey and missing registered root fail before `.mirror` creation;
- identifiers reject traversal, separators, absolute/drive/UNC forms, and invalid
  lengths;
- canonical root resolution contains every managed path;
- pre-existing symlink at `.mirror`, `projections`, namespace, projection target,
  receipt hierarchy, manifest, lock, or temp boundary is refused;
- race-oriented recheck under lock catches a managed component replaced by a
  symlink after prevalidation;
- rejection preserves all existing bytes.

## Real Inter-Process Exclusion

Use subprocess workers and synchronization files/pipes, not mocked locks.

1. Same Journey: A holds the lock at a barrier; B cannot enter current-manifest
   read until A exits.
2. Different Journey: A and B both cross their barriers without waiting on one
   global lock.
3. Normal exception: lock becomes acquirable.
4. Process termination: kill the holder; a later process acquires and publishes.
5. Timeout: contender returns `publication_failed`, mutates no public or receipt
   bytes, and leaks no lock-owner/path diagnostics.
6. Core/extension identity is irrelevant to exclusion: all publishers using the
   same root serialize through the same file.

## Immutable Receipt Tests

- first publish creates exactly one canonical receipt;
- byte-identical retry reuses it;
- semantically equivalent mapping order has the same digest;
- same snapshot ID with changed content/source identity is rejected before public
  replacement;
- receipt file cannot be overwritten or redirected through symlink;
- receipt surviving failed publication does not become current;
- matching retry after failure succeeds;
- inspection requires public manifest/document consistency and never treats a
  receipt as current authority;
- receipt contains only allowlisted identity/digest fields.

## Lost-Update and Total-Order Tests

### Different entries

Force two subprocesses to serialize documents before either acquires the lock.
Both then publish different namespace/projection keys to one Journey.

Expected:

- both return success;
- manifest contains both entries plus all baseline entries;
- both documents inspect;
- neither entry inherits the other's source revision/path;
- repeated stress runs never lose an entry.

### Same entry

Two subprocesses publish different snapshots to one key. Record lock-entry and
success order. Expected final manifest, document, and receipt identity equal the
last linearized success. Both receipts may exist; only one is current.

## Linearizable Inspection

Pause writer after projection replacement and before manifest replacement, then
start inspect in another process. Inspect must block behind the Journey lock and,
after release, return exactly one of:

- committed new pair;
- restored old pair after controlled writer failure;
- bounded `projection_divergence` after killed/unrecoverable writer state.

It must never return new document + old entry, old document + new entry, or
perform repair.

## Failure Injection Matrix

Every checkpoint is injected deterministically with before/after byte snapshots:

| Checkpoint | Expected public state |
|------------|-----------------------|
| root resolution | absent/unchanged |
| schema validation | unchanged |
| serialization | unchanged |
| path preparation/recheck | unchanged |
| lock timeout | unchanged |
| current manifest read/validation | unchanged |
| current target consistency check | unchanged |
| receipt temp write/fsync | public unchanged |
| receipt exclusive install | public unchanged |
| projection temp create/write/fsync | old pair unchanged |
| projection replace | old projection restored; old manifest unchanged |
| projection directory sync | restore or explicit divergence; never success |
| next-manifest merge/validation | old projection restored; old manifest unchanged |
| manifest temp write/fsync | old projection restored; old manifest unchanged |
| manifest replace | committed new pair or restored old pair; never mixed success |
| manifest directory sync | no false rollback claim; documented committed/failure posture |
| projection restoration | `projection_divergence`, old manifest retained, receipt evidence retained |
| process kill after projection replace | subsequent inspect reports divergence without repair |
| result rendering after linearization | committed pair remains; no automatic duplicate retry |

For every failure, assert bounded structured code, temp cleanup where possible,
lock reclaimability, unrelated manifest preservation, and absence of document,
root, environment, secret, prompt, transcript, DB path/content, or receipt body in
diagnostics.

## Durability Checks

- temp files are created in the target directory;
- file flush and `fsync` happen before replace;
- directory sync is attempted after replace where the platform supports it;
- unsupported Windows directory sync is represented as an explicit
  strongest-supported boundary, not silently claimed as POSIX durability;
- receipt exclusive create cannot overwrite an existing inode;
- no success returns before manifest linearization/durability completes.

## Full Gate and External Integrity

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory/journey_projections
uv run python scripts/check_doc_links.py
git diff --check

CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
(cd "$CONTRACT" && shasum -a 256 -c PROBE-SHA256SUMS && \
  python3 -m unittest discover -s tests -p 'test_*.py')
```

Navigator UI validation is delegated to the Driver. Automated/failure/concurrency
evidence is mandatory and cannot be waived.
