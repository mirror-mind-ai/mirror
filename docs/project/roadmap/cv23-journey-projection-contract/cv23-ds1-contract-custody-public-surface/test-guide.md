[< Story](index.md)

# Test Guide — CV23.DS1

## Aggregate Validation

All commands run from `/Users/alissonvale/Code/mirror-dev` with no production
Journey or database content.

### Focused unit and CLI tests

```bash
uv run pytest \
  tests/unit/memory/journey_projections/ \
  tests/unit/memory/cli/test_journey_projection.py
```

Expected: models, schemas, canonical serialization, errors, test guard, and CLI
capability discovery pass.

### Driver-owned isolated E2E

```bash
TMP_HOME="$(mktemp -d)"
HOME="$TMP_HOME" MIRROR_HOME="$TMP_HOME/mirror" MEMORY_ENV=test \
  uv run python -m memory journey-projection capabilities \
  --mirror-home "$TMP_HOME/mirror" --format json
rm -rf "$TMP_HOME"
```

Expected: exit 0; one JSON document reports:

- `contractId: mirror.journey-projections`;
- `contractVersion: 1.0`;
- `extensionApiVersion: 1.0` (the installed baseline; DS3 owns the additive bump);
- `operations` contains only routes implemented at the DS1 boundary.

Run an unknown operation and an unsupported format in the same isolated home.
Expected: nonzero structured JSON with bounded code/message and no traceback,
payload, environment, or private path.

## Required Failure Tests

### Contract models

- reject identifiers outside `^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$`;
- reject incompatible contract/schema versions;
- reject non-UTC/non-`Z` generated timestamps;
- reject malformed producers, source revisions, source snapshots, and manifest
  entries;
- errors expose stable codes and bounded messages only.

### Schema validation

- all bundled schemas declare draft 2020-12 and resolvable local IDs;
- local `$ref` resolution performs no network call;
- envelope, manifest, Operational, and generic extension valid fixtures pass;
- missing, extra, wrong-type, wrong-const, bad-format, unsafe relative path, and
  nested-domain violations fail;
- error diagnostics identify schema/location without echoing document values;
- an extension-owned schema composes with the envelope and fails closed.

### Canonical serialization

- insertion order does not change bytes;
- Unicode is preserved as UTF-8 rather than ASCII escapes;
- output has sorted keys, two-space indentation, and exactly one trailing newline;
- non-JSON values and non-finite numbers fail with `serialization_failed`;
- SHA-256 digest is stable for identical canonical bytes.

### Test-only guard

- production environment is refused;
- missing explicit home is refused;
- configured production home is refused after canonical resolution;
- symlink alias of production home is refused;
- isolated test home is accepted;
- guard performs no DB open/write and includes no private path in errors.

### CLI

- exact capability JSON and exit 0;
- `--mirror-home` is accepted without touching a DB;
- unknown operation, missing argument, and unsupported format return structured
  errors and nonzero exit;
- stdout/stderr contain no environment dump or traceback;
- help/usage names the new command.

## Contract-Kit Integrity

```bash
CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
cd "$CONTRACT"
shasum -a 256 -c PROBE-SHA256SUMS
python3 -m unittest discover -s tests -p 'test_*.py'
```

Expected: hashes unchanged and 16 tests pass. The external black-box probe remains
blocked/nonconformant until later CV23 stories implement every required operation;
DS1 must not fake complete conformance.

## Full Repository Gate

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
uv run python scripts/check_doc_links.py
git diff --check
```

Expected: all green without API keys.

## Validation Decision

Navigator validation is explicitly waived by instruction. The Driver owns
validation against the approved specification, Mirror tests, isolated CLI E2E,
and unchanged consumer-contract tests. No waiver applies to automated checks or
failure-path coverage.
