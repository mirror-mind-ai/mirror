[< Parent](../index.md)

# CV23.DS1.US1 — Discover the installed capability safely

**Status:** ✅ Done
**Type:** User Story

---

## User Story

As a local contract consumer, I want database-free JSON capability discovery so
I can identify the installed contract and Extension API versions without
mistaking planned routes for implemented behavior.

## Outcome

`python -m memory journey-projection capabilities --format json` reports
contract `1.0`, installed Extension API `1.0`, and only `capabilities` at the DS1
boundary. Unknown operations/formats return bounded nonzero JSON.

## Evidence

- thin route in `src/memory/cli/journey_projection.py`
- front-door dispatch/help in `src/memory/__main__.py`
- isolated subprocess E2E proved no Mirror home or database was created
- `require_isolated_test_home()` refuses production, missing, and symlink-aliased
  production homes for future probe-only operations
