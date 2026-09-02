[< Story](index.md)

# Test Guide — CV23.DS7

## Pre-release Local Gate

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
uv run python scripts/check_doc_links.py
git diff --check
uv run python -m memory runtime release-doctor --target v0.31.10
```

Expected: no new failure; release doctor passes version, notes, clean-state, and
stable ancestry checks. D-014 remains a carried unrelated polling-budget defect
if reproduced locally; central CI must still be green.

## Central Publication Gate

```bash
git push origin main
gh run list --commit <release-sha>
uv run python -m memory runtime release-promote --target v0.31.10 --push
gh release create v0.31.10 \
  --title "v0.31.10 — Journey Projection Contract" \
  --notes-file /tmp/mirror-v0.31.10-notes.md --latest
```

Verify `refs/tags/v0.31.10` and `refs/heads/stable` at the release commit, GitHub
Release URL exists, and Tests plus Docs are green for that commit.

## Production Transition

Use the configured production Mirror home and installed stable checkout:

```bash
python -m memory runtime status --channel stable
python -m memory runtime backup
python -m memory runtime backup --verify <backup>
python -m memory runtime update --channel stable
python -m memory runtime version --channel stable
python -m memory journey-projection capabilities --mirror-home <production-home> --format json
```

Expected installed version `0.31.10`, contract `1.0`, Extension API `1.1`, and
five operations. No schema migration was added by CV23.

## Installed Unchanged Probe

```bash
set -euo pipefail
CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
TEMP_HOME="$(mktemp -d)"
trap 'rm -rf "$TEMP_HOME"' EXIT
python3 "$CONTRACT/probe/contract_probe.py" \
  --production-return \
  --mirror-command-json '<installed command JSON>' \
  --mirror-root '<installed checkout>' \
  --mirror-home "$TEMP_HOME" \
  --journey-fixture "$CONTRACT/fixtures/journey" \
  > "$CONTRACT/installed-probe-result.json"
```

Expected exit `0`, `result: passed`, `gate: open`, eight checks, snapshot
`op-probe-0001`, and source revision `sha256:probe-operational-revision`.

## Immutable Contract and Return

```bash
cd "$CONTRACT"
shasum -a 256 -c PROBE-SHA256SUMS
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m json.tool mirror-return.json >/dev/null
```

Inspect `mirror-return.json` against `RETURN-CONTRACT.md`. Every required field
must be populated, `knownDeviations` must be empty, and `gate` may be `open` only
when release, CI, backup, installation, installed probe, and fixture evidence all
pass.

## Failure Condition

Keep the gate blocked and stop on any mismatch, failed/absent CI, unverifiable
backup, failed update, source-checkout substitution for installed runtime,
contract hash change, probe failure, private evidence, or unresolved normative
deviation.
