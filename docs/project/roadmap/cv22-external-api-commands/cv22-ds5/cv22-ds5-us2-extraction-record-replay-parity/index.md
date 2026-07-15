[< Parent](../index.md)

# CV22.DS5.US2 — Extraction Record/Replay Parity

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a Mirror user,
I want conversation-to-memory extraction to behave the same through the TS core,
So that memory creation can move toward TS without losing extraction semantics.

## Outcome

Extraction orchestration is ported behind replayable provider responses, preserving
Python-compatible parsing, curation, and persistence boundaries without live API use
in CI.

## Scope

- Map the Python extraction orchestration and prompt/response parsing contract.
- Use recorded/scrubbed LLM responses for deterministic tests.
- Preserve journey and quality guards where extraction is invoked.
- Prove persistence effects on DB copies only.

## Out Of Scope

- Redesigning extraction quality.
- Live LLM evals in CI.
- Consult command parity.

## Validation

Replay fixtures, parser parity checks, DB-copy persistence checks, and optional
manual live-provider smoke outside CI.
