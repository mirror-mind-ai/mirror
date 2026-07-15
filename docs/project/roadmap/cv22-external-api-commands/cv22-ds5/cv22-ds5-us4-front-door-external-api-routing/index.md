[< Parent](../index.md)

# CV22.DS5.US4 — Front-Door External-API Routing And Dogfood

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a Pi/Mirror user,
I want validated external-API command families to route through the TS front door,
So that daily dogfooding exercises the port without exposing unported paths.

## Outcome

The TS front door selectively routes DS5-completed command families while preserving
Python fallback for every unported, unsafe, or configuration-missing path.

## Scope

- Route only command families whose DS5 child stories are validated.
- Preserve fallback behavior and actionable errors when credentials/config are absent.
- Dogfood through generated-demo/copy-safe DB where possible and live runtime only when safe.
- Document which commands remain Python fallback.

## Out Of Scope

- Routing unvalidated external calls.
- Removing Python fallback.
- DS6 MCP/npm convergence.

## Validation

Front-door routing tests, fallback tests, and Navigator-run smoke commands with
safe configuration.
