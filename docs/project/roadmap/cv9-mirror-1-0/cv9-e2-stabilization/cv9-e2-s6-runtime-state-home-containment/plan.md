[< CV9.E2.S6](index.md)

# CV9.E2.S6 — Plan

**Status:** Draft — pending Navigator approval

---

## Design

### One rule for runtime-state location

Today (`src/memory/config.py:141-163`) the directory and the database name are
entangled: `MEMORY_ENV != "production"` swaps the *directory* to the homes
root. The new rule separates the two axes:

- **Directory** = resolved mirror home. Always. For every `MEMORY_ENV`.
- **Name** = `_DB_NAMES[MEMORY_ENV]` (`memory.db` / `memory_dev.db` /
  `memory_test.db`), unchanged.

```
db_path(env) = resolve_mirror_home() / _DB_NAMES[env]
```

Precedence stays: explicit `DB_PATH` > explicit `MEMORY_DIR` (dir override) >
the rule above. Explicit configuration is never second-guessed (same principle
as S5's `resolve_backup_dir()`).

### Loud failure instead of root fallback

When `resolve_mirror_home()` raises (no `MIRROR_USER`/`MIRROR_HOME`) and no
explicit `MEMORY_DIR`/`DB_PATH` is set:

- **Any env:** database-touching commands fail with the actionable message the
  resolver already produces ("Set MIRROR_HOME or MIRROR_USER"), instead of
  materializing DBs in the homes root. This is what would have prevented the
  orphan root `memory.db` (2026-06-15 bulk import).
- Read-only, DB-less commands (e.g. `--help`) must keep working — resolution
  stays lazy where it already is, and import-time module constants must not
  crash on unresolvable homes (see Risks).

### Logger containment (`.pi/extensions/mirror-logger.ts`)

`_resolveMemoryDir()` currently returns `MEMORY_DIR` env or the homes root.
New order:

1. `MEMORY_DIR` env (explicit override wins, unchanged).
2. Resolved mirror home from `_effectiveMirrorEnv()` (the extension already
   computes shell-env-over-`.env` for `MIRROR_HOME`/`MIRROR_USER` — reuse it).
3. Homes root — only when 1 and 2 both fail. This preserves the bootstrap
   error channel: "could not resolve the mirror home" remains observable.

Update the radar note in `docs/project/roadmap/index.md` that hardcodes
`~/.mirror-minds/mirror-logger.log`, and REFERENCE where the log path is
documented.

### Unify extension-runtime DB resolution

Verified symptom: in one session, `ext session-export folder set` wrote to
`<home>/memory.db` while mirror-logger session registration wrote to the root
`memory_dev.db`. First implementation step is locating where the
`ExtensionAPI` connection is constructed (`src/memory/extensions/`) and which
path it opens. Fix direction: both core and extension runtime obtain the DB
path from the same resolver (`db_path_for_env()` post-change), so a given
(home, env) pair maps to exactly one database file.

Open question for implementation: whether the extension runtime intentionally
pins `<home>/memory.db` regardless of env. If so, that intent moves into the
shared resolver, not a second code path.

### Detection of legacy root state

`runtime diagnose` gains a check: report `*.db`, `*.log`, `*.lock`, `backups/`
directly under the homes root, with a pointer to a documented manual
relocation route (REFERENCE section). No automatic moves.

---

## Compatibility and migration

- `MEMORY_DIR` / `DB_PATH` overrides behave exactly as before.
- After the change, dev-env work in `mirror-dev` starts writing to
  `~/.mirror-minds/vinicius-dev/memory_dev.db` — a fresh file. The old root
  `memory_dev.db` (460 conversations, live until this ships) stays in place,
  reported by diagnose, relocatable manually (`mv` + optional re-seed is the
  documented route; histories are not merged).
- Test suites that relied on root-located `memory_test.db` must already pass
  `MEMORY_DIR`/`MEMORY_ENV=test` isolation per the engineering principles;
  the change makes un-isolated test runs fail loudly rather than silently
  writing to the root — a desirable tightening, but it must be verified
  against the existing suite and CI before merge.

---

## Risks

1. **Import-time constants.** `config.py` computes `MEMORY_DIR`, `DB_PATH`,
   `MUTE_FLAG_PATH` at module import. Making the home mandatory must not turn
   `import memory.config` into a crash when the home is unresolvable (CI has
   no `.env`). Mitigation: keep module-level values lazy/nullable and fail at
   *use*, mirroring the existing `_RESOLVED_MIRROR_HOME = None` pattern.
2. **Hidden dependents of the root layout.** Web surfaces, tests, or docs may
   assume root-located dev/test DBs. Mitigation: repo-wide audit for
   `DEFAULT_MEMORY_DIR` / `db_path_for_env` / hardcoded `.mirror-minds` paths
   before implementation.
3. **Live sessions during rollout.** Running Pi sessions hold the old paths
   until restarted. Acceptable: old sessions keep appending to the old file;
   new sessions use the contained path. Documented in the release note.
4. **TS/Python duplication.** The logger's home resolution in TS must match
   Python's (`shell env > .env > default`, legacy `~/.mirror/<user>` support).
   Drift here caused today's incident class; add a parity note and keep the TS
   logic minimal (reuse `_effectiveMirrorEnv()`, do not re-implement legacy
   fallbacks beyond what data routing already does).

---

## Verification approach

- Unit: resolution matrix over (`MEMORY_ENV` × home resolvable/unresolvable ×
  `MEMORY_DIR`/`DB_PATH` overrides) asserting directory, name, and
  fail-loudly behavior.
- Unit/integration: extension runtime and core resolve the identical DB path
  for the same (home, env).
- Smoke (isolated `HOME`): run `build load`, a logger round-trip, and an
  `ext` command; assert the homes root contains **only** user-home
  directories afterward.
- Full CI gate per the development guide.

Details in [test-guide.md](test-guide.md).
