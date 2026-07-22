# Validation — CV22.DS6.US1

## Status

Passed

## Automated Checks

- ts: typecheck + lint clean; npm run test = 328 pass / 0 fail / 0 skipped (pyJson suite removed; canonical + read-tolerance + round-trip added)

Checks status: passed

## E2E

Decision: required

Evidence: E2E on a fresh TS-bootstrapped DB: seeded an old Python-dialect journey ({"parent_journey": "root", "project_path": "/old"}); journeys rendered the root->demo hierarchy (read-tolerance); TS journey set-path rewrote demo.metadata to canonical {"parent_journey":"root","project_path":"/new/resolved"} (compact JSON.stringify), values intact. pyJson.ts deleted; write-parity now grades journey metadata semantically (both value-divergence tests still fail).

## Navigator Validation

Route: On a fresh/copied DB: reuse/seed an old-dialect journey, run journey set-path <slug> <path> then journeys, inspect the row metadata is compact canonical JSON.stringify

Navigator accepted: yes

Expected observation: old-dialect journeys list correctly; after set-path the row metadata is compact canonical JSON with values intact; pyJson.ts gone

Pass condition: journeys render identically to before; set-path writes canonical form; parent_journey preserved

Fail condition: any journey read differs, a row fails to parse, or metadata keeps the spaced json.dumps dialect after a TS write

## Missing Evidence

- none
