[< Parent](../index.md)

# CV22.DS3 — Pi TS Front Door

**Status:** 🟢 Implemented locally, awaiting validation
**Type:** Delivery Story

---

## Outcome

Pi TS Front Door

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV22.DS3.US1](cv22-ds3-us1-pi-ts-front-door/index.md) | Pi TS Front Door | User Story | Navigator can validate Pi TS Front Door as an observable behavior. | 🟡 Planned |

## Done Condition

The Delivery Story is done when child User/Technical Stories produce a coherent delivery outcome.

## Implementation Notes

Local implementation adds a TS front door at `ts/src/frontDoor/cli.ts` with an explicit routing table in `ts/src/frontDoor/routing.ts`.

Current DS3 routing policy:

- `detect-persona` routes to TS;
- `journeys` routes to TS;
- `memories` without `--search` routes to TS;
- `memories --search` falls back to Python because fresh semantic embedding/search remains DS5 scope;
- all unported commands fall back to Python by default, including writes, Builder/Ariad, Soul, Explorer, extraction, consult, and runtime operations.

Pi skill docs for `/mm-journeys` and `/mm-memories` now call the front door with `NODE_OPTIONS=--no-warnings` so Node's experimental SQLite warning does not leak into user-facing output.
