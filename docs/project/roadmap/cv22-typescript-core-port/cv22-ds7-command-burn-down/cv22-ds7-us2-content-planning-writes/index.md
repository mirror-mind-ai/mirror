[< Parent](../index.md)

# CV22.DS7.US2 — Content & planning writes

**Status:** 🟡 Planned
**Type:** User Story

---

## Outcome

The **deterministic** content & planning surface — the full `tasks` command tree
and the `week view` read — is answered by the TS core with ordered/behavioral
parity against the Python oracle, writes proven on database copies. The
LLM/embedding-gated paths (`journal`, `week plan`, `week save`) are explicitly
reassigned to US5 (extraction lifecycle) rather than ported here.

## Story Statement

As a Mirror user,
I want my task and weekly-view commands answered by the TS core at parity,
So that the deterministic planning surface burns down off Python with no
user-visible change.

## Acceptance Behavior

```text
Given a copied memory.db exercised through the front door
When the Navigator runs the deterministic tasks/week commands via TS
  (add, list, done/doing/block, delete, import, sync, sync-config, week view)
Then rendered output and resulting DB rows are identical to the Python oracle
And journal, week plan, and week save remain on Python fallback (unchanged)
And every write is backup-gated with redacted evidence and no real DB artifact
And the routing flip is user-invisible and revertible with no data migration
```

## Scope

- New `ts/src/tasks/` read/write model over the `node:sqlite` seam, including a
  single shared `resolveTaskByIdOrPrefix` that preserves Python's own
  ambiguous-match asymmetry (status-change reports "Ambiguous ID"; delete
  reports "not found") instead of unifying it.
- Shared `parse_journey_path_tasks` / `parse_done_tasks` parity port (one parser
  for `import` and `sync`).
- `tasks`/`week` sub-command routing in the front door (write-vs-read).
- Backup-gated write handlers + string-exact read renderers, with goldens built
  on frozen `now`/`newId`/`_now()` generators for byte-identical row and render
  comparison.
- Oracle-drift baseline entries + front-door redaction (titles, payloads, and
  the `sync-config`/`sync` reference-file path) for the new commands.

## Out Of Scope

- `journal` (double LLM/embedding-gated) — moves to US5.
- `week plan` / `week save` (LLM + cross-engine handshake) — move to US5.
  Not dropped from the DS7 burn-down: recorded as a US2→US5 reassignment (see
  Plan's Handoff Note) for the DS-level ledger to pick up at its next update.
- Any live provider/embedding call in TS (DS8 seam).
- Sibling DS7 families: utility tail, memory cultivation, mirror-mode
  orchestration, extraction lifecycle, Soul Mode, Explorer Mode, Ariad tree.

## Validation

- TS unit/golden tests in CI (parsers, store builder/mapper, status/prefix-match
  branches, week-view grouping) + determinism gate + oracle-drift checker.
- Redacted real-DB-copy parity harness with a `tasks`/`week` probe family.
- Per-family E2E smoke through the front door before the routing flip.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
