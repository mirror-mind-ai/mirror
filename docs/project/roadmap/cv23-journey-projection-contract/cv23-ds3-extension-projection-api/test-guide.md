[< CV23.DS3](index.md)

# CV23.DS3 — Extension Projection API: Test Guide

**Fixtures:** temporary SQLite databases and synthetic Journey roots only
**Network/model rule:** forbidden

## 1. Focused Gate

```bash
uv run pytest \
  tests/unit/memory/extensions/test_api.py \
  tests/unit/memory/extensions/test_loader.py \
  tests/unit/memory/journey_projections/ \
  tests/integration/memory/journey_projections/
uv run ruff check src/memory/extensions src/memory/journey_projections \
  tests/unit/memory/extensions tests/unit/memory/journey_projections \
  tests/integration/memory/journey_projections
uv run ruff format --check src/memory/extensions src/memory/journey_projections \
  tests/unit/memory/extensions tests/unit/memory/journey_projections \
  tests/integration/memory/journey_projections
uv run mypy src/memory/extensions/api.py src/memory/extensions/loader.py \
  src/memory/journey_projections
```

## 2. Public Shape and Binding

- every `ExtensionAPI` exposes `journey_projections`;
- façade exposes documented `publish` and `inspect` operations;
- direct construction and loader construction bind the same extension ID;
- API version authority and capability discovery both report `1.1`;
- existing constructor call sites and extension registries remain compatible.

## 3. Publication Authority Matrix

Using a valid synthetic extension projection, assert:

- bound extension publishes its own namespace and producer ID;
- `journey_id` argument must equal `document.journeyId`;
- `projection_id` argument must equal `document.projection`;
- document namespace must equal bound `extension_id`;
- producer kind must be `extension`;
- producer ID must equal bound `extension_id`;
- extension ID `ariad` is rejected as reserved;
- a document targeting `ariad` or another extension is rejected;
- invalid IDs fail with stable bounded errors;
- every authority rejection leaves projection, manifest, and receipts unchanged.

## 4. Schema Validation

- built-in extension schema accepts Tactical and Strategic documents;
- built-in schema rejects Operational altitude and non-extension producers;
- optional valid JSON Schema 2020-12 is applied to the complete document;
- optional schema mismatch and malformed schema return
  `schema_validation_failed` before mutation;
- unresolved remote references fail offline rather than triggering network I/O;
- diagnostics contain no candidate content, Journey root, database path, secret,
  prompt, or provider output.

## 5. Inspection

- inspect derives namespace from the bound extension;
- it returns the DS2 `ProjectionInspection` and current manifest entry;
- one extension cannot inspect another extension's projection through the façade;
- an extension cannot inspect `ariad:operational` through the façade;
- missing and divergent state keep DS2's stable bounded errors;
- inspection performs no publication, repair, model call, or network call.

## 6. Real-Kernel Integration

With a temporary DB containing two registered synthetic Journeys and two bound
extensions:

1. publish through extension A and inspect the exact canonical document;
2. publish through extension B to the same Journey and verify both fresh-manifest
   entries survive;
3. update A and prove B remains unchanged;
4. publish to different Journeys and verify registered roots are selected solely
   from registry metadata;
5. omit/invalid/unknown `project_path` and require bounded failure with no path
   accepted from the caller;
6. compare façade publication results with direct DS2 inspection;
7. inject a DS2 failure and prove façade semantics preserve the previous pair or
   return explicit divergence unchanged.

## 7. Regression and Contract Gates

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory/journey_projections src/memory/extensions/api.py \
  src/memory/extensions/loader.py
uv run python scripts/check_doc_links.py
git diff --check

CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
(cd "$CONTRACT" && shasum -a 256 -c PROBE-SHA256SUMS)
(cd "$CONTRACT" && python3 -m unittest discover -s tests -p 'test_*.py')
```

Expected: focused behavior is green; unchanged acceptance-kit hashes and all 16
self-tests pass. Any unrelated baseline failure is recorded precisely rather
than hidden by retries or broad scope changes.
