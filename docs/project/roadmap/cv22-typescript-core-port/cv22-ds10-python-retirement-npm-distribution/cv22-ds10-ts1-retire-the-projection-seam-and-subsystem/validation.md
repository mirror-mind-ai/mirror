# Validation — CV22.DS10.TS1

## Status

Passed

## Automated Checks

- npm test — 2372 pass, 0 fail
- uv run pytest -m 'not live' — 2656 pass, 0 fail
- node --test test/frontDoor/noPythonSpawn.test.ts — 3 pass, written red-first against the live seam
- ruff check, ruff format, biome, check_doc_links, check_skill_command_parity, check_oracle_drift — clean

Checks status: passed

## E2E

Decision: required

Evidence: Real front-door Builder write on the production journey with uv/python/python3 shimmed first on PATH: no spawn  recorded, .mirror/projections/current.json mtime unchanged. Explorer write proven by the same detector in a real subprocess against a real database.

## Navigator Validation

Route: Steps 1-5 of the TS1 validation route: tree residue, cutoff on both engines, detector self-test, automated guard plus both suites, then this traced write.

Navigator accepted: yes

Expected observation: The checkpoint renders as before; no uv or python process is executed; current.json does not move.

Pass condition: No spawn log, unchanged mtime, surfaces identical to pre-change.

Fail condition: Any entry in the spawn log, a moved mtime, a changed surface, or a write failed by a refresh.

## Missing Evidence

- none
