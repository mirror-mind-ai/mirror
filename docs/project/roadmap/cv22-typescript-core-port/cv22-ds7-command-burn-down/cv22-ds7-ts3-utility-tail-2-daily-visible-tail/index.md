[< Parent](../index.md)

# CV22.DS7.TS3 — Ops/utility tail 2: daily-visible tail

**Status:** 🔵 Implemented — flipped 2026-09-08; validation accepted, debt
deferred (CR065, CR066), closure pending. `welcome` and
`runtime status|version|diagnose|release-notes` route to TS by default;
`MIRROR_TS_WELCOME=0` / `MIRROR_TS_RUNTIME_READS=0` revert independently.
**Type:** Technical Story

---

## Technical Story

In order to make the most-seen surface in the product answer from TypeScript
and stop `runtime diagnose` misreporting the schema TypeScript owns,
As the TS core,
I want `welcome` (card and per-turn status line) and the read-only `runtime`
subcommands — `status`, `version`, `diagnose`, `release-notes` — ported with
read-only git inspection,
So that the per-turn status refresh no longer pays a Python startup, the
TS-authored migration is known rather than "unknown", and the git updater
itself stays untouched for DS10.

## Outcome

`welcome`, `welcome --status-line`, and `runtime status|version|diagnose|
release-notes` are routed to TS ungated; `runtime update|pull|stable|backup|
release-doctor|release-promote` are refused to Python explicitly, never by
inheritance.

## Scope And Plan

See [plan.md](plan.md): option 2 of the 2026-09-08 decision — `welcome` whole,
including read-only git inspection, with no mutating git verb in
`ts/src/runtime/` by test.

## Out Of Scope

- The git updater and release machinery (DS10).
- Extension catalog commands (TS4); TS3 ports only the extension-migration
  read that `status`/`diagnose` need.
- A live model-catalog call (DS8); the pin probe is replay-or-inconclusive.

## Validation

Goldens on a fixture git repository with a `file://` remote (offline, frozen
clock, TZ=UTC), a spawn-spy proving the status line spawns no git, the smoke
through both engines, and a Navigator route on the real home whose one
expected difference is the absent `017_journey_parent_column` false alarm.
