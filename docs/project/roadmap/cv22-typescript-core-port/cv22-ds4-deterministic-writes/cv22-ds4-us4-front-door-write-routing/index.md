[< Parent](../index.md)

# CV22.DS4.US4 — Front-Door Write Routing

**Status:** ✅ Done
**Type:** User Story
**Depends on:** CV22.DS4.US3 (the ported `setIdentity`, including metadata-None
inheritance); [CV22.DS3 Pi TS Front Door](../../cv22-pi-ts-front-door/cv22-ds3/index.md)
(the read routing table this extends).

---

## User Story

As Mirror, I want `identity set` to be answered by the TS core through the Pi front
door — opening the first sanctioned live-write path over the real `memory.db` —
with conservative Python fallback for every other command, so a real identity write
runs on TS with no user-visible change.

## Outcome

The front door (`ts/src/frontDoor/routing.ts` + `cli.ts`) gains a sanctioned
live-write seam and routes `identity set` to the TS core (reusing the US3
`setIdentity`, including its metadata-None inheritance). All other commands
still fall back to Python. Dogfooded on the dev runtime with no user-visible
switch. This proves the live-write architecture that journey routing (fast-follow)
and DS4 collapse build on.

## Scope

- Add a sanctioned, explicitly-named live-write seam (`openDatabaseForWrite`) — the
  copy guard forbids live TS writes today, so this is the load-bearing new piece.
- Deterministic `id`/`now` generation matching Python (`uuid4().hex[:8]`,
  microsecond ISO-`Z`).
- Route `identity set` to TS, backup-gated, preserving the DS3 fallback discipline
  for everything else (`identity edit` spawns `$EDITOR` — interactive, not a
  deterministic write — so it stays on Python).

## Out Of Scope

- **Journey write routing** — immediate fast-follow (proposed CV22.DS4.US5), reusing
  this live-write seam.
- **Reinforcement write routing** — deferred to CV22.DS5 (it fires inside the Python
  search path, not as a CLI command).
- New write behavior, schema change, or parity re-proof (`setIdentity` proven in US3).
- Flipping the production `mm-identity set` skill to the front door — a deliberate
  cutover after dev-runtime dogfooding, not part of this story's code.
- External-API writes, memory creation, embeddings (CV22.DS5).

## Validation

Routing + live-write-guard unit tests; a real front-door `identity set` (create +
update) against a DB copy asserting the row; dev-runtime dogfooding with a backup
taken first; no user-visible change.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
