[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR157 — `REFERENCE.md` lists `DB_BACKUP_PATH`, `EXPORT_DIR`, and `TRANSCRIPT_EXPORT_DIR` as settings, though nothing has read them since the Python core was deleted

## Problem

`REFERENCE.md`'s paths table presents three variables as live settings, each with a
default and a role: `DB_BACKUP_PATH` ("global backup default used only when no mirror
home is in scope"), `EXPORT_DIR` ("Markdown export root"), and `TRANSCRIPT_EXPORT_DIR`
("full-transcript export dir"). Nothing reads any of them. CV22.DS10.TS5 deleted the
Python core, their only reader, and the configuration reference records all three
under *Inert values*, as `.env.example.advanced` does (`INERT since CV22.DS10.TS5`).

So the two references disagree, and the one a person is likelier to open is the wrong
one. A person who sets `EXPORT_DIR` from `REFERENCE.md` gets no export there and no
word about it.

## Expected Behavior

`REFERENCE.md` no longer presents the three as settings. Its paths table drops the
rows, or marks them inert and points to the configuration reference's *Inert values*,
which stays the one record of what a leftover line in a `.env` means. Every remaining
row in the table names a variable something in `ts/src` reads.

## Impact

Low; documentation. A setting that silently does nothing costs the person who trusts
it, and a reference that contradicts the configuration reference costs the next reader
who has to decide which one is true.

## Plan Or Decision

Captured, unassigned, 2026-10-21, found while CR153 removed `PI_SESSIONS_DIR`'s row from
the same file, at the Navigator's direction. Current Focus unchanged.

## Evidence

`REFERENCE.md`'s paths table lists the three. `docs/reference/configuration.md`,
*Inert values*: "`EXPORT_DIR`, `TRANSCRIPT_EXPORT_DIR`, and `DB_BACKUP_PATH` have no
reader in the TypeScript core." No match for any of the three in `ts/src`, the Pi
extension, or `bin/`, 2026-10-21; the table's other variables (`MEMORY_DIR`,
`MEMORY_PROD_DIR`, `DB_PATH`, `BACKUP_DIR`) each have readers.

## Outcome

Open.
