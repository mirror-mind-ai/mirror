[< Story](index.md)

# Test Guide — CV22.DS4.US4

## Automated Validation

- **Routing table:** `identity set` routes to `ts`; `identity edit` (interactive),
  identity reads, journey writes, reinforcement, `memories --search`, and every
  other unported/mutating command still route to `python`.
- **`openDatabaseForWrite` guard:** opens a real path writable (no copy-guard
  throw), and remains distinct from the copy-guarded `openDatabaseCopyForWrite`
  used by parity harnesses.
- **id/now helpers:** `newId()` is an 8-char lowercase hex string; `nowIso()` is a
  microsecond ISO-8601 `Z` timestamp (matching Python `_uuid` / `_now` shapes).
- **`cli.ts` identity write handler (against a generated demo-DB copy):**
  - INSERT: `identity set <layer> <key> <content>` writes a new row with a
    generated id, `created_at == updated_at == nowIso()`, null metadata, and prints
    `✓ {layer}/{key} created`.
  - UPDATE/inherit: `identity set` again on an existing row updates content +
    updated_at, preserves id + created_at, inherits stored metadata (metadata=None),
    and prints `✓ {layer}/{key} updated`.
- TS suite green (`node:test`), `tsc` / `biome` clean, `ruff` clean.

## E2E Decision

A **real front-door write** against a demo-DB copy / dev database — a genuine
(non-fixture) end-to-end write, but never against production. Broader/production
E2E is out of scope.

## Navigator Validation

- **Route (dev runtime only):**
  1. Take a backup of the dev `memory.db`.
  2. `node frontDoor/cli.ts identity set <layer> <probe-key> "<content>"` →
     confirm `✓ ... created`, then `identity get <layer> <probe-key>` shows the row.
  3. `node frontDoor/cli.ts identity set <layer> <probe-key> "<new content>"` →
     confirm `✓ ... updated`, the content changed, and metadata is unchanged.
  4. Confirm an unported write (e.g. a journey write) still routes to Python.
- **Expected observation:** identity writes are answered by TS and land in the live
  dev DB correctly; unported writes remain on Python; no user-visible difference.
- **Pass condition:** the row is created/updated exactly as Python would (id/now
  shapes valid, metadata inherited on edit); fallback intact.
- **Fail condition:** a write throws (copy-guard/backup), a wrong/missing row, a
  divergent success line, or an unported command wrongly routed to TS.

## Validation Evidence

Pending implementation and validation.
