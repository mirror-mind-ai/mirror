[< Docs](../index.md)

# Runtime Repair Policy

Runtime repair starts after diagnosis, not before it. `runtime status` says whether the local runtime is ready for update planning. `runtime diagnose` explains the drift. This policy defines which repair routes are acceptable before Mirror gains commands that mutate files, migrations, or installed extensions.

## Safety Principles

Diagnosis comes before repair. Backup comes before database mutation. No command should silently delete files, rewrite migration history, reinstall extensions, or normalize drift just to make status green.

A clean status is only meaningful when the route to that cleanliness is documented. Preserve historical evidence until provenance is understood.

Development does not happen in `production` Mirror Mind clones. Mirror Mind clones declare their role through `.mirror-clone-role` at the repository root, with default `production`. Builder Mode applies this guard only when the active journey's `project_path` points at a Mirror Mind source checkout; ordinary journey projects are not blocked by a missing Mirror clone-role marker. If the Mirror project checkout is `production`, Builder refuses unless explicitly overridden with `--ignore-production-role`; when no `project_path` is configured, it falls back to the current directory. Production clones are updated through controlled paths (`git pull` today, `runtime update` later), not through direct edits.

## Drift Classes

### Generated Pi HTML exports

Pi stores resumable sessions as JSONL under `~/.pi/agent/sessions/`. Those files are the authoritative session history used by `pi -c`, `pi -r`, `pi --session`, `/resume`, `/tree`, `/fork`, and `/clone`.

Files named `pi-session-*.html` in the repository root are HTML exports, usually created by `/export`. They are useful for human reading or sharing, but they are derived artifacts and should not be versioned with Mirror Mind source code.

Policy:

- Preserve them when useful by moving them to a local archive folder.
- Keep the archive folder ignored by git.
- Do not treat exported HTML as the source of session restoration.
- Do not let exported HTML block update planning after it is archived outside tracked source.

Current repair route:

```text
mkdir -p pi_exports
mv pi-session-*.html pi_exports/
```

`pi_exports/` is ignored by git.

### Unknown core migration rows

Unknown core migration rows are entries in `_migrations` that are not present in `memory.db.migrations.MIGRATIONS` for the checked-out code.

Policy:

- Do not delete automatically.
- Classify provenance before repair.
- Require a database backup before any mutation.
- Prefer a documented legacy allowance when the row is historical and harmless.
- Prefer a dedicated repair command over manual SQL when mutation is necessary.

Current local findings:

- `005_create_testimonials`
- `2026-04-14-add-liquidity`

Likely interpretation: personal-domain or extension-era migrations that predate the current extension migration contract. They should not be erased only to satisfy runtime status.

### Unknown extension migration rows

Unknown extension migration rows are entries in `_ext_migrations` whose files are absent from the installed extension's `migrations/` directory.

Policy:

- Do not delete automatically.
- Prefer restoring missing migration files in the extension package if they are part of canonical history.
- If the migration is intentionally historical and no longer shipped, the extension should preserve a no-op historical migration file or declare a legacy allowance in a future contract.
- Require a database backup before any mutation.

Current local finding:

- `maestro`: `001_init.sql`

Likely interpretation: Maestro was installed with a migration file at some point, but the current installed package no longer includes it. Inspect the canonical Maestro source before touching the database.

### Windows/UTF-8 mojibake in user text

Portuguese mojibake such as `Ã©`, `Ã§`, `Ã£`, `Ã‰`, or `Ã“` can appear when older
Windows/local-runtime combinations persisted UTF-8 text after decoding it through
Latin-1 or Windows-1252. Current CLI entry points should prefer UTF-8 stdio, but
historical database content may still need repair.

Policy:

- Treat this as user-data repair, not a schema migration.
- Do not run silently during normal startup or runtime update.
- Require an explicit dry-run/apply command.
- Require a database backup before mutation.
- Repair only reversible mojibake patterns; do not guess at irrecoverable
  replacement characters or rewrite semantically ambiguous text.
- Preserve normal Portuguese text such as `Âncora`.

Current repair route:

```bash
uv run python -m memory repair-encoding
uv run python -m memory repair-encoding --apply
```

Use `--mirror-home PATH` when repairing a non-default local Mirror home.

### Temporarily unavailable production database

A production database can appear unavailable during `runtime status` when a local
runtime surface has recently opened it. This should not require final users to
kill processes or run ad hoc Python snippets.

Policy:

- Treat database-unavailable status as a recoverable update gate when the rest of
  the repository state is safe.
- Prefer a bounded, safe bootstrap through `MemoryClient` and a fresh status
  check before failing.
- Do not delete SQLite sidecars, kill arbitrary processes, or mutate migration
  ledgers as part of this recovery.
- If an older updater is itself blocked, use the explicit updater repair lane
  once, then rerun the normal update.

Current repair route:

```bash
uv run python -m memory runtime update --repair-updater
uv run python -m memory runtime update
```

Current versions run the database bootstrap automatically inside `runtime
update` when the status gate or post-update status reports database
unavailability.

### Core migration drift during runtime update

Core migration drift remains an attention-needed status. However, it is not
always a safe reason to block code update planning. If an older production clone
sees a migration row introduced by a newer release, the target code may be the
only thing capable of recognizing that row.

Policy:

- Keep `runtime status` strict: pending or unknown core migrations report
  attention needed.
- Let `runtime update` proceed through a narrow preflight lane only when the
  surrounding boundaries are safe: mirror home resolved, git clean, database
  exists, extension health ready, and the core migration ledger is readable.
- Require backup before migrations.
- Require post-update status to be ready.
- Never repair by inserting or deleting migration tracking rows manually.

### Pending migrations

Pending migrations are blockers for normal runtime readiness. During
`runtime update`, pending core migrations may pass the initial preflight only
through the backup-gated update path described above. Pending extension
migrations remain blockers until the extension repair path is explicit.

Policy:

- Require backup before running migrations.
- Repair by running the appropriate migration path.
- Never repair by inserting tracking rows manually.

### Checksum drift

Checksum drift means an applied migration file no longer matches the recorded semantics.

Policy:

- Treat as blocker.
- Do not normalize automatically.
- Repair by restoring the original migration file or adding a new migration.

### Invalid extension manifests

Invalid manifests are blockers because Mirror cannot reliably reason about the installed extension.

Policy:

- Repair the package or reinstall from canonical source.
- Do not mutate database state unless the later repair path explicitly requires migration work after backup.

## Future Repair Commands

Future repair commands must be explicit about mutation. They should print the planned changes, require backup for database mutation, and avoid combining unrelated repair classes in one command unless the user explicitly asks for a full repair plan.
