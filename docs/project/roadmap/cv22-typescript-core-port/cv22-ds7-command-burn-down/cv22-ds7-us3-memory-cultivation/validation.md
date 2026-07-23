# Validation — CV22.DS7.US3

## Status

Blocked

## Automated Checks

- npm run typecheck && npm run lint && npm test (801 tests)

Checks status: passed

## E2E

Decision: required

Evidence: 15 cultivationCli.test.ts tests spawn the real front door end-to-end (list/reject/apply/scan for both families, backup-gating, redaction); real-DB-copy cultivation probe family (cluster ordering + consolidation listing) passes at full byte-parity against the live Python oracle

## Navigator Validation

Route: Run consolidate/shadow list|reject|apply|scan against a copied memory.db via --db-path, per the Navigator Validation section of the story's test-guide.md

Navigator accepted: no

Expected observation: TS front-door output and resulting DB rows/identity match the Python oracle for every command; identity_update to a non-{self,ego} layer is refused loudly with no write; scan/consolidate apply stay on Python unless the replay gate is set

Pass condition: rendered stdout and affected rows/identity identical to Python for every deterministic command; allowlist refusal byte-identical and writes nothing; scan/merge under replay reproduce parity; front-door log shows no proposal/identity content

Fail condition: any output/row/identity divergence from the oracle; allowlist writing a non-allowlisted layer; a live provider call; any proposal/identity content in the front-door log

## Missing Evidence

- Navigator validation has not been accepted
