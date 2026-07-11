[< CV9.E2](../index.md)

# CV9.E2.S5 — Backup Destination Resolution & `BACKUP_DIR` Demotion

**Status:** Done
**Epic:** CV9.E2 — Stabilization & Robustness

---

## User-visible outcome

Backups land where the mirror they belong to lives, predictably. Redirecting a
backup elsewhere is an explicit, per-invocation choice (`--backup-dir`) rather
than a hidden process-global env var that silently outranks the mirror you asked
to back up. The change is non-silent: a deprecated `BACKUP_DIR` env produces a
clear warning instead of quietly redirecting.

---

## Problem

`backup()` resolved its destination by reaching into `os.environ["BACKUP_DIR"]`
and `config.BACKUP_DIR` from inside a nested conditional. That single choice
caused three problems:

1. **Untestable without env games.** The only way to control the destination was
   to manipulate the process environment, which is why a developer's personal
   `.env` `BACKUP_DIR` leaked into the test suite (green in CI, red locally).
2. **Least-surprise violation.** A process-global env var silently outranked an
   explicitly passed `mirror_home` scope.
3. **Multi-user-unsafe.** A single global backup folder shared across mirrors
   risks `memory_{timestamp}.zip` filename collisions between users.

The web configuration surface already displayed `<mirror_home>/backups` as the
backup location, so actual behavior and the advertised model had already
diverged.

---

## Scope

- Extract a pure `resolve_backup_dir()` with explicit inputs and documented
  precedence: explicit path > `mirror_home/backups` > global default. No env or
  global-config reads inside path resolution (Tier 1, functional core).
- `backup()` delegates destination resolution to the resolver and no longer
  reads `BACKUP_DIR` internally.
- Add a `--backup-dir` flag to `python -m memory backup` for intentional,
  per-invocation redirection (Tier 2, demote).
- When `BACKUP_DIR` is set in the environment and no `--backup-dir` is given, the
  CLI emits a deprecation warning and writes to the mirror-scoped default.
- Remove the now-unused `config.BACKUP_DIR` constant.
- Update REFERENCE, the advanced env example, decisions, and worklog.

---

## Non-goals

- No change to the web/runtime backup callers, which correctly scope to
  `mirror_home/backups`.
- No per-user filename namespacing for shared backup directories (tracked as a
  future note; only relevant if multi-user shared-backup becomes a real need).
- No removal of `DB_BACKUP_PATH`, which remains the global default for the
  no-`mirror_home` fallback path.

---

## Behavior change

`python -m memory backup` with `BACKUP_DIR` set in the environment now writes to
`<mirror_home>/backups` and prints a deprecation warning, instead of silently
writing to `BACKUP_DIR`. To keep redirecting, pass `--backup-dir <path>`.

---

## Validation

See [test guide](test-guide.md).
