# Migrations

Extensions own SQLite tables. To keep those tables consistent across
installs, every extension declares a sequence of SQL migrations. The mirror
applies them in order and tracks what has been applied.

This document specifies the migration contract.

## Where migrations live

```
<extension-root>/
  migrations/
    001_init.sql
    002_<short_description>.sql
    003_<short_description>.sql
    ...
```

- Files are applied in **lexicographic order** by filename. The numeric
  prefix exists to make ordering obvious and stable.
- Numbering does not have to be contiguous; gaps are allowed.
- Filenames must match `^[0-9]{3,}_[a-z0-9_]+\.sql$`.
- Each migration is a complete SQL script that can include multiple
  statements separated by semicolons.

## Tracking — `_ext_migrations`

The core owns a table that records what has been applied:

```sql
CREATE TABLE IF NOT EXISTS _ext_migrations (
  extension_id TEXT NOT NULL,
  filename     TEXT NOT NULL,
  checksum     TEXT NOT NULL,        -- sha256 of the file content
  applied_at   TEXT NOT NULL,        -- ISO-8601 UTC
  PRIMARY KEY (extension_id, filename)
);
```

The table is created lazily on first migration run. Extensions never read or
write it directly; they use `api.run_migrations(migrations_dir)`.

## Idempotence and checksums

The runner is idempotent at the granularity of one file:

- A file already recorded in `_ext_migrations` is skipped.
- A file recorded with a *different checksum* than what is on disk raises
  `ExtensionMigrationError`. The runner refuses to apply or skip it — it
  stops and tells the user that an applied migration has been edited.

This means: **never edit the SQL semantics of an applied migration**.
Create a new file that amends the schema.

### What the checksum considers

The checksum is computed over a normalised form of the file: line and
block comments (`--` and `/* ... */`) are stripped, and runs of
whitespace are collapsed. **String literals are kept intact** because
they are real SQL content (e.g. the value in an `INSERT`).

In practice this means:

- Adding or editing a comment → **allowed**, no drift.
- Reformatting whitespace, indentation, blank lines → **allowed**,
  no drift.
- Adding or removing a column, changing a table name, changing a
  value inside a string literal → **rejected** as drift.

The relaxation is comments and whitespace only. Anything that could
change how SQLite reads the statement is still treated as a
structural edit.

### Backwards compatibility

Rows recorded before this normalisation (raw-bytes checksums) are
accepted on the first run after upgrading and silently upgraded to
the normalised hash. Existing installs do not need a manual reset.

## Prefix enforcement

Every DDL statement in a migration is parsed (loosely; we only need
table-name extraction, not full SQL) and checked. A statement that creates,
alters, drops, or indexes a table outside `ext_<id>_*` raises
`ExtensionMigrationError` and aborts the entire migration.

Allowed shapes (assuming `id` is `finances`):

```sql
CREATE TABLE ext_finances_accounts (...);
CREATE INDEX idx_ext_finances_txn_date ON ext_finances_transactions(date);
ALTER TABLE ext_finances_accounts ADD COLUMN ...;
DROP INDEX idx_ext_finances_txn_date;
```

Rejected:

```sql
CREATE TABLE my_accounts (...);           -- missing prefix
CREATE TABLE eco_accounts (...);          -- wrong prefix (legacy)
ALTER TABLE memories ADD COLUMN ...;      -- core table
DROP TABLE journeys;                      -- core table
```

Index names should also follow the prefix (`idx_ext_<id>_*` is the
convention), but this is a recommendation, not enforced.

DML in migrations (`INSERT`, `UPDATE`, `DELETE`) is allowed as long as it
targets a prefix-owned table. Useful for seeding default rows (e.g. default
categories).

## Transactions

Each migration file runs inside a single transaction. If any statement
fails, the entire file is rolled back and `_ext_migrations` is not updated.

Exception: SQLite cannot run some DDL (e.g. `CREATE INDEX` after a `CREATE
TABLE` in the same transaction) in older versions. We assume SQLite ≥ 3.35
(matches the Mirror Mind baseline). If a project still hits this, splitting
into two migration files is the recommended workaround.

## When migrations run

The runner is invoked at three moments:

1. **Install.** `mirror extensions install <id>` runs all pending
   migrations. (Until CV22.DS10.TS2 it then called the extension's
   `register()`; install runs no extension code any more.)
2. **Upgrade.** If the user updates the extension's source and re-installs,
   new migration files are detected and applied.
3. **Manual.** `mirror ext <id> migrate` (provided by the core,
   not by the extension) re-runs pending migrations. Useful after recovering
   from a failed install.

The runner is **not** invoked on every `mirror ext <id> <cmd>`
call. Subcommands assume the schema is up to date — installs and upgrades
are the only path that mutates schema.

## Schema versioning beyond migrations

For extensions that need a stored schema version (e.g., to support data
format upgrades that span multiple migrations), the convention is to add a
single-row table:

```sql
CREATE TABLE ext_<id>_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO ext_<id>_meta (key, value) VALUES ('schema_version', '1');
```

Subsequent migrations bump the value. This is convention, not a contract;
extensions are free to ignore it.

## Anti-patterns

- **Editing an applied migration.** Always add a new file.
- **Long-running data migrations in SQL.** If a transformation needs more
  than a few seconds or touches external resources, write it as a CLI
  subcommand (`mirror ext <id> migrate-legacy`) and let the user
  invoke it explicitly. Migrations are for schema and small seed data.
- **Referencing tables of other extensions.** Even if you read another
  extension's data via `api.read`, never assume its schema in a migration.
  Other extensions may not be installed.
- **Storing secrets in migrations.** Migrations are versioned in the
  extension's repo. API keys, tokens, and personal data belong in
  `~/.mirror-minds/<user>/...` outside the repo.

## Rollback

There is no automatic rollback. SQLite migrations are forward-only by
design. If a migration introduces a regression:

1. Author writes a new migration that reverses the change.
2. Bumps the meta version if used.
3. Releases a patch of the extension.

For destructive changes (drops, renames), authors should preserve data with
intermediate copy steps in the same migration, or ship a separate
`migrate-data` CLI subcommand that runs before the destructive migration is
applied.
