[< Parent](../index.md)

# CV22.DS4.TS1 — Write Parity Harness & Backup Gate

**Status:** ✅ Done
**Type:** Technical Story
**Depends on:** the reusable real-DB-copy parity harness from CV22.DS2.TS3 and the Pi front door from CV22.DS3.

---

## Technical Story

Before any write command is ported, DS4 needs a safe, reusable way to *prove*
write parity. This story delivers the write counterpart to DS2.TS3's read
harness: seed → copy → apply the write through Python and TS on parallel copies
under a frozen `now` → state-diff the mutated rows. It is backup-gated and
copy-only, and it emits redacted evidence by default. No user-facing write command
is ported here — this story exists to make the following write stories provable.

## Outcome

A documented, reusable write-parity route that:

- refuses to run against anything but a copy (never the live `memory.db`);
- requires a backup gate before any destructive proof;
- applies a write through the Python oracle and the TS core on parallel copies of
  the same seed, with a frozen `now`;
- diffs the mutated rows and emits redacted evidence (labels, counts, hashes,
  pass/fail — never raw ids/content).

## Acceptance Behavior

```text
Given the portable demo memory.db as seed
When the harness applies a sample write through Python and through TS on parallel copies
Then it reports an ordered, redacted state-diff verdict (pass when the mutated rows match)
And it aborts if pointed at a non-copy or if the backup gate is unmet
And a deliberately divergent write is reported as fail
```

## Scope

- Write-parity route: seed → copy → apply (Python ‖ TS) → state-diff under frozen `now`.
- Backup gate and copy-only guard (refuse the live database).
- Redacted evidence by default; the portable demo DB as the seed source.
- Extend the DS2.TS3 harness pattern to the write direction.

## Out Of Scope

- Porting any specific write command (CV22.DS4.US1–US3).
- External-API writes — extraction, embeddings, consult (CV22.DS5).
- Any schema or FTS5 change.

## Validation

The harness self-checks on the demo DB: a sample write shows pass, a deliberately
divergent write shows fail, and pointing it at a non-copy aborts.
