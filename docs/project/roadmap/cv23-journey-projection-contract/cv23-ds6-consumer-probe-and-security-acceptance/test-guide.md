[< Story](index.md)

# Test Guide — CV23.DS6

## Aggregate Validation

All inputs are synthetic. Each subprocess receives a new temporary `HOME`,
`MIRROR_HOME`, and `MEMORY_ENV=test`. No command may fall back to a developer or
production database.

## Focused Route

```bash
uv run pytest \
  tests/unit/memory/cli/test_journey_projection.py \
  tests/unit/memory/journey_projections/ \
  tests/integration/memory/journey_projections/
```

Required cases:

- all five capability operations are advertised;
- rebuild publishes and returns the Operational document and identity;
- inspect returns the document plus current manifest entry;
- unknown/missing options and all Core errors return bounded JSON;
- test-only operations reject non-test mode, omitted homes, configured production
  home, unconfined paths, symlinks, malformed controls, actor mismatch, foreign
  namespace, and Ariad impersonation before mutation;
- the opened DB path equals `<isolated-home>/memory_test.db` according to
  `PRAGMA database_list` and no other DB is touched;
- invalid schema and unsafe identifiers preserve exact prior public bytes;
- no model/network seam is imported or invoked;
- existing publication failure injection, receipt, concurrency, inspection, and
  lifecycle coverage remains green.

## Unchanged Consumer Probe

```bash
set -euo pipefail
CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
TEMP_HOME="$(mktemp -d)"
trap 'rm -rf "$TEMP_HOME"' EXIT

python3 "$CONTRACT/probe/contract_probe.py" \
  --mirror-command-json '["uv","run","python","-m","memory"]' \
  --mirror-root /Users/alissonvale/Code/mirror-dev \
  --mirror-home "$TEMP_HOME" \
  --journey-fixture "$CONTRACT/fixtures/journey"
```

Expected source-runtime result:

```json
{
  "contractId": "mirror.journey-projections",
  "contractVersion": "1.0",
  "result": "passed",
  "gate": "open"
}
```

The result may contain additive checks and diagnostics. Exit must be `0`. This is
DS6 repository acceptance only, not the DS7 installed-runtime return gate.

## Immutable Kit

```bash
CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
cd "$CONTRACT"
shasum -a 256 -c PROBE-SHA256SUMS
python3 -m unittest discover -s tests -p 'test_*.py'
```

Expected: every hash is `OK`; 16 tests pass; `git`/filesystem comparison confirms
no acceptance-kit file changed.

## Full Repository Gate

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory/journey_projections src/memory/cli/journey_projection.py
uv run python scripts/check_doc_links.py
git diff --check
```

Known carried exception: D-014 may time out the unrelated runtime-diagnose web
test at its fixed two-second polling budget. No new failure is accepted.

## Privacy Review

Inspect captured stdout/stderr and failure tests. They must contain none of:

- fixture/document payload text;
- canonical Journey, DB, fixture, or home paths;
- environment values;
- prompts, transcripts, raw reasoning, provider output, or secrets.

Only contract identity, stable operation identity, projection identity on success,
and bounded error vocabulary may cross the public command boundary.

## Navigator Validation

- **Expected observation:** unchanged consumer probe reports `passed`, all listed
  security attacks are rejected, and the last valid pair survives.
- **Pass condition:** source probe gate opens, immutable hashes/16 tests pass, and
  full local quality gates have no new failure.
- **Fail condition:** any contract-kit edit, production-data access, payload/path
  leak, authority bypass, non-deterministic fixture, false success, implicit
  repair, model/network invocation, or unresolved normative deviation.

## Validation Evidence

Materialized in `validation.md` during Driver validation.
