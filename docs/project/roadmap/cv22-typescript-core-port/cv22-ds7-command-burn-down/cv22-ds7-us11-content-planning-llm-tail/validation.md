# Validation — CV22.DS7.US11

## Status

Passed

## Automated Checks

- cd ts && npm test (1830 pass / 0 fail); npm run typecheck; npx biome check src test; uv run python -m pytest tests/unit tests/integration -m 'not live'; six goldens regenerate byte-identically; scripts/check_oracle_drift.py; scripts/check_skill_command_parity.py; scripts/check_doc_links.py

Checks status: passed

## E2E

Decision: required

Evidence: Every ported surface exercised end to end through the real front door on a scratch home: week plan (replay) -> week save -> tasks list; journal under replay and without it; descriptor generate success and missing-identity paths; both ES-001 read faces. The lifecycle dry-run was compared byte-for-byte against Python on the same conversation (765 bytes, identical). The E2E is what caught the LlmRole/guard duplication that five plateaus of goldens, mutation checks and typechecks had missed.

## Navigator Validation

Route: Scratch home for write leaves, real home for reads (per the Plan review, so fixture-classified data never lands in production). Predict engines from the ledger's per-leaf table, then: week plan under replay -> week save -> tasks list; journal with and without replay config; conversations --metadata-lifecycle-dry-run compared across both engines on the real home; --metadata-backfill-preview refused naming DS10; MIRROR_TS_WEEK=0 revert; front-door.log delta and engine column.

Navigator accepted: yes

Expected observation: Predicted engines match the log; the cross-engine lifecycle dry-run prints IDENTICAL; journal without replay answers from Python; MIRROR_TS_WEEK=0 reaches Python; the log grows by exactly the number of invocations with no unexpected fell_back marker.

Pass condition: All predictions match, the byte-comparison is identical, and every revert reaches Python.

Fail condition: Any engine contradicting the ledger, any byte difference between engines on the same input, any gate that fails to revert, or any refusal that writes.

## Missing Evidence

- none
