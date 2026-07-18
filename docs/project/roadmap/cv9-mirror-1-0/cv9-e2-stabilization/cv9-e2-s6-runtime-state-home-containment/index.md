[< CV9.E2](../index.md)

# CV9.E2.S6 — Runtime State Home Containment

**Status:** Done — Navigator validated 2026-07-12
**Epic:** CV9.E2 — Stabilization & Robustness

---

## User-visible outcome

Everything user-scoped that Mirror Mind writes — databases, logs, locks,
backups — lives inside the resolved mirror home (`~/.mirror-minds/<user>/`).
The homes root (`~/.mirror-minds/`) contains only user-home directories. When
the mirror home cannot be resolved, Mirror fails loudly instead of silently
writing runtime state to the homes root.

---

## Problem

A field investigation (2026-07-12, `mirror` journey session) found the homes
root accumulating live runtime state alongside the per-user homes:

| Root artifact | Provenance (verified) |
|---|---|
| `memory_dev.db` (18.6 MB, **live**) | The de-facto development DB for the `mirror-dev` workspace. Contains 460 conversations (back to 2026-03-26), including the investigating session itself: with `MEMORY_ENV=development`, `db_path_for_env()` resolves to the homes root, so mirror-logger session registration and conversation logging land there — not in the configured `vinicius-dev` sandbox home. |
| `memory.db` (6.2 MB, orphan) | 190 conversations created in a 22-second burst on 2026-06-15 (`interface=pi`, no journeys, 0 memories) — a bulk import/backfill executed with no resolvable mirror home in production env, silently falling back to the root. Untouched since 2026-07-02. |
| `memory_test.db` (360 KB) | `MEMORY_ENV=test` suite artifacts (2026-07-04). Regenerable; wrong location by the same default. |
| `mirror-logger.log` (676 KB, live) | `mirror-logger.ts` hard-defaults `LOG_FILE` to the homes root regardless of the resolved home. |
| `*.bootstrap.lock`, `backups/` | Companions of the above defaults. |

Four root causes:

1. **Env bypasses the home.** `config.py` honors the resolved mirror home only
   when `MEMORY_ENV == "production"`; development and test envs default the
   runtime dir to the homes root — pre-CV4 flat-layout semantics.
2. **Silent fallback on resolution failure.** With no `MIRROR_USER`/`MIRROR_HOME`,
   production-env writes land in the root `memory.db` without warning.
3. **Logger ignores the resolved home.** The Pi mirror-logger resolves
   `MIRROR_USER` from `.env` for data routing but writes its log to one flat
   root path unconditionally.
4. **Split-brain DB resolution.** In one session, extension state
   (`ext_session_export_folders`) was written to `<home>/memory.db` while
   session registration went to the root `memory_dev.db`. This split made the
   live session invisible to the session-export extension and caused a wrong
   session to be exported (2026-07-12 incident).

This violates D3/CV4 framework–user separation: the framework-level homes root
is absorbing user-scoped runtime state.

---

## Scope

- One resolution rule: the runtime directory is the resolved mirror home for
  **all** `MEMORY_ENV` values; the environment selects the database *name*
  (`memory.db`, `memory_dev.db`, `memory_test.db`), never the *directory*.
- Loud failure: production-env writes with an unresolvable mirror home refuse
  with an actionable error instead of silently using the homes root.
- Logger containment: `mirror-logger.ts` writes to
  `<mirror-home>/mirror-logger.log` when the home is resolvable; the homes-root
  path remains only as a bootstrap fallback when resolution itself fails.
- Unify extension-runtime DB resolution with core DB resolution so one session
  cannot straddle two databases.
- `runtime diagnose` detects legacy root-level runtime state and points to a
  documented manual relocation route.
- Explicit overrides (`MEMORY_DIR`, `DB_PATH`) keep winning — explicit
  configuration is never second-guessed.

---

## Non-goals

- No automatic migration or merging of existing root DBs. The live root
  `memory_dev.db` and the seeded `vinicius-dev/memory.db` have diverged;
  merging histories is risky and out of scope. This story ships detection and
  a documented manual route; a migration command is a candidate follow-up.
- No change to the fail-quietly contract of runtime extensions (the logger
  still swallows failures; only its destination changes).
- No renaming of `~/.mirror-minds/` or changes to the user-home layout.

---

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [CV9.E2.S5 — Backup Destination Resolution](../cv9-e2-s5-backup-destination-resolution/index.md) — the same containment principle applied to backups
- [Briefing D3 — Database is the runtime source of truth](../../../../briefing.md)
