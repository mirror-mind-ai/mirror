[< Parent](../index.md)

# CV22.DS5.US3 — Consult Command Parity

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a Mirror user,
I want consult-style model calls to run through the TS core when ported,
So that external model access converges without changing command behavior.

## Outcome

The consult command family has a TS implementation path with provider safety,
replayable tests, redacted diagnostics, and Python-compatible output.

## Scope

- Identify the current Python consult command contract.
- Port transport/config handling through the DS5 provider boundary.
- Add record/replay tests with scrubbed responses.
- Preserve output shape and failure semantics.

## Out Of Scope

- Changing provider selection policy.
- Adding new consult capabilities.
- MCP server work.

## Validation

Replay tests, output compatibility checks, and optional manual live-provider smoke
outside CI.
