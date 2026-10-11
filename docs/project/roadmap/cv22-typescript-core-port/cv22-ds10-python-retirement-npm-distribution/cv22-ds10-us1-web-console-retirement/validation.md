# Validation — CV22.DS10.US1

## Status

Passed

## Automated Checks

- uv run pytest -m 'not live' — 2467 pass, 0 fail (2532 before, minus the retired suites)
- npm test — 2372 pass, 0 fail, unchanged: TypeScript never touched the console
- check_retired_surfaces.py — clean for journey-projections and web-console; written before the deletion and seen to fail against it
- ruff check, ruff format, check_doc_links, check_skill_command_parity, check_oracle_drift — clean

Checks status: passed

## E2E

Decision: required

Evidence: Navigator ran a real Pi session: worked fine, the deletion stayed inside its blast radius. Navigator ran uv run python -m memory eval --all: 10/11 modules passed, denominator 12 to 11 with scene absent and no import error. Every surviving module scored identically to the 2026-09-13 baseline in eval-history, probe for probe. The single failing module is routing, which is carried debt D-005 (stale persona fixtures since v0.31.0) and reproduced its recorded failures by name: treasurer-finances to None, ambiguous-finance-over-research to cfo, null-open-question to scholar, 11/15 against a 0.85 threshold. python -m memory web exits 1, zero help rows, and mirror-home/web/preferences.json is untouched at 41 bytes.

## Navigator Validation

Route: Test guide steps 1-5: the command is gone on both engines, eval --all runs with a smaller denominator, a real Mirror turn on Pi behaves identically, nothing was deleted from the user's home, and the docs no longer advertise a console.

Navigator accepted: yes

Expected observation: web is an unknown command with no help row; eval --all completes without scene and without an import error; a Pi session is unchanged; preferences.json survives.

Pass condition: All of the above, with every surviving eval module matching its recorded baseline.

Fail condition: The console still answering, an import error or traceback from eval discovery, any eval module moving against its baseline, a changed Mirror surface, or deleted state in the user's home.

## Missing Evidence

- none
