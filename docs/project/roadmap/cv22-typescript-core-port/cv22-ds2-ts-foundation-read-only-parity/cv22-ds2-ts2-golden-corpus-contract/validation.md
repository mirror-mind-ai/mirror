# Validation — CV22.DS2.TS2

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test

Checks status: passed

## E2E

Decision: waived

Evidence: Test-oracle substrate with no user-facing end-to-end behavior; real-memory.db parity is deferred to the command stories DS2.US1-US3. Fixture-level synthetic-golden validation accepted by Navigator at plan approval.

## Navigator Validation

Route: Regenerate the synthetic golden (uv run python ts/parity/generate_golden.py) then run 'cd ts && npm test'; the verifier grades blobToFloat32/parseUtcMs against Python reference values embedded in the golden and asserts ordered-id parity via orderedIdsMatch.

Navigator accepted: yes

Expected observation: 14/14 node:test green; tsc --noEmit and Biome clean; regenerating the golden produces an empty git diff.

Pass condition: Verifier green and golden regeneration is a no-op.

Fail condition: Any ordered-id mismatch, decode mismatch vs Python reference values, or non-deterministic regeneration (non-empty diff).

## Missing Evidence

- none
