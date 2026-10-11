# Validation — CV22.DS2.US1

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test; uv run python ts/parity/generate_golden.py deterministic hash check; rg 'node:sqlite' ts/src; git diff --check; uv run python tmp/real_search_parity_generate.py && node tmp/real_search_parity_verify.mjs

Checks status: passed

## E2E

Decision: not_required

Evidence: No runtime route changed in CV22.DS2.US1; parity is core-level. Real-DB-copy parity passed on five probes against tmp/parity/memory.search-parity.db copied from /Users/alissonvale/.mirror-minds/mirror-dev/memory.db.

## Navigator Validation

Route: Navigator reviewed and accepted the validation evidence for synthetic golden parity plus real-DB-copy parity.

Navigator accepted: yes

Expected observation: TS ranker reproduces Python oracle ordered ids on synthetic and copied-real-database probes; automated checks pass; production TS source keeps node:sqlite isolated to ts/src/db/database.ts.

Pass condition: Navigator accepted ordered-id parity evidence after real-DB-copy validation passed.

Fail condition: Any ordered-id mismatch, failed automated check, node:sqlite production-source import outside the DB seam, or live production database mutation.

## Missing Evidence

- none
