[< Parent](../index.md)

# CV22.DS4.US5 — Journey Write Routing

**Status:** 🟡 Planned
**Type:** User Story
**Depends on:** CV22.DS4.US2 (ported `setProjectPath`), CV22.DS4.US4 (the sanctioned
live-write seam + front-door write-handler pattern), CV22.DS3 (the routing table).

---

## User Story

As Mirror, I want the ported journey CLI write — `journey set-path` — to be answered
by the TS core through the Pi front door, reusing the US4 live-write seam, with
Python fallback for everything unported, so journey project-path updates run on TS
with no user-visible change. This is the last CLI-write family CV22.DS4 needs before
it collapses.

## Outcome

The front door routes `journey set-path` to the TS core over the live-write seam
(backup-gated), reusing US2's `setProjectPath` and a new `normalizeProjectPath` that
matches Python's `Path.expanduser().resolve()`. Everything else — unported journey
writes, identity reads, reinforcement — still falls back to Python. Dogfooded on
dev; no user-visible change.

## Scope

- `normalizeProjectPath` in TS matching Python `_normalize_project_path`
  (`Path(value).expanduser().resolve()`): the parity crux.
- Route `journey set-path` through the front-door write handler, reusing the US4
  `openDatabaseForWrite` seam, backup gate, and `nowIso()`, plus US2 `setProjectPath`.

## Out Of Scope

- Journey **create** — no `memory journey create` CLI (journeys are created via the
  `mm-journey` / build skills); `createJourney` is ported but not a front-door command.
- Journey **content update** (`journey update`) and stage/status setters — not ported.
- Reinforcement routing (CV22.DS5); external-API writes (CV22.DS5).
- The production skill cutover (deliberate, post dev-dogfood).

## Validation

Routing unit tests (`journey set-path` → TS; unported journey writes and reads →
Python); `normalizeProjectPath` tests; a front-door journey-write spawn E2E against a
DB copy asserting the journey row's `project_path` metadata (and the missing-journey
error); dev-runtime dogfooding; no user-visible change.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
