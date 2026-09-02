[< CV23.DS4](index.md)

# CV23.DS4 — Ariad Operational Compiler: Test Guide

**Validation owner:** Driver
**Fixtures:** synthetic temporary Journey roots only
**Forbidden:** production/development DBs, models, network, consumer-kit mutation

## 1. Contract Golden

Copy the consumer fixture into a temporary directory and compile with fixed:

- Journey ID `projection-probe-journey`;
- generated time `2030-01-01T00:00:00Z`;
- snapshot ID `op-probe-0001`;
- test source revision `sha256:probe-operational-revision`;
- supplied `ariad-active-work.json`.

Assert the resulting mapping and canonical bytes equal
`fixtures/expected/operational.json`. Publish through the real DS2 store and
assert inspection returns the same document and the manifest identity equals
`fixtures/expected/manifest.json`.

The Mirror-owned test may read the immutable transfer fixture by explicit path as
acceptance input; production code must not know that path or import probe code.

## 2. Roadmap Matrix

- Capability/Delivery/User/Technical hierarchy compiles recursively.
- Legacy Capability/Epic/Story codes normalize to supported v1 node types.
- Authored root and child table order is preserved.
- Heading values and complete Outcome sections override abbreviated table cells.
- Emoji/text statuses normalize to all five v1 statuses.
- Existing allowlisted artifact files emit confined Journey-relative paths.
- Unlinked prose and unsupported tables do not fabricate nodes.
- Missing roadmap index yields `roots: []`.
- Missing/malformed linked packages, duplicate links, cycles, and symlink escapes
  fail before publication.

## 3. Exploratory and Refinement Matrix

- Exploration ID/Journey/status come from durable public index metadata.
- Narrative Summary only is projected; other narrative body text is excluded.
- Attractors and experiment proposals preserve authored order.
- Handoff is null when absent and `completed` with a relative path when present.
- Exploratory Stories have deterministic stable ordering.
- Refinement Stories and Change Requests follow canonical index table order.
- Headings/statuses provide full public values; bodies and Outcome prose for CRs
  are not copied.
- Missing optional roots produce empty arrays.
- Invalid/external links fail closed without echoing paths or content.

## 4. Determinism and Revision

- Equivalent input plus fixed build values produces byte-identical output.
- Mapping key order and filesystem enumeration order cannot change bytes.
- `sourceRevision` is a SHA-256 over canonical projected content.
- Every represented field change changes the revision.
- Excluded private narrative/body edits do not change projected content or
  revision.
- Production default snapshot IDs satisfy the identifier contract and differ
  across rebuilds; generated timestamps are UTC `Z`.

## 5. Registered-Root Publication

- Rebuild accepts Journey ID and active state, never a root.
- Unknown Journey or absent/unavailable root fails before compilation/publication.
- Operational identity is fixed to `ariad:operational` and producer
  `ariad-operational-compiler`.
- The built-in Operational schema validates before DS2 mutation.
- Rebuild returns immutable compiled document and `ProjectionPublication`.
- Repeated valid rebuilds merge with existing extension entries.
- Injected DS2 failure preserves the previous valid pair or returns explicit
  divergence unchanged.

## 6. Purity and Privacy

Monkeypatch or trap model, embedding, provider, Pi-process, and network seams;
compilation and rebuild must not call them. Assert output and errors contain no
prompt, transcript, raw reasoning, environment value, absolute root, database
path, or excluded narrative evidence.

## 7. Focused Gate

```bash
uv run pytest \
  tests/unit/memory/journey_projections/ \
  tests/integration/memory/journey_projections/
uv run ruff check src/memory/journey_projections \
  tests/unit/memory/journey_projections \
  tests/integration/memory/journey_projections
uv run ruff format --check src/memory/journey_projections \
  tests/unit/memory/journey_projections \
  tests/integration/memory/journey_projections
uv run mypy src/memory/journey_projections
```

## 8. Repository and External Gates

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory/journey_projections
uv run python scripts/check_doc_links.py
git diff --check

CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
(cd "$CONTRACT" && shasum -a 256 -c PROBE-SHA256SUMS)
(cd "$CONTRACT" && python3 -m unittest discover -s tests -p 'test_*.py')
```

Expected: DS4-focused checks pass, contract hashes remain unchanged, and all 16
consumer-kit self-tests pass. The already-carried D-014 timing defect is reported
precisely if it remains the only broad-suite failure; no retry hides it.
