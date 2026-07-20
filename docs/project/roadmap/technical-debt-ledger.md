# Technical Debt Ledger

Ariad Review records technical debt here when debt should be paid now or deferred.

| ID | Source Story | Location | Kind | Description | Impact | Recommendation | Navigator Decision | Status |
|----|--------------|----------|------|-------------|--------|----------------|--------------------|--------|
| TD-001 | Pi external-skill home divergence fix (`c876c59`) | `.pi/extensions/mirror-logger.ts` (`resolveMirrorHome`, `_readDotenv`, `_effectiveMirrorEnv`, home-dir constants) ↔ `src/memory/config.py` (`resolve_mirror_home`, dotenv loader) | Duplicated contract / drift risk | The Pi logger re-implements the Python core's mirror-home resolution contract in TypeScript (upward `.env` walk, shell-env > `.env` precedence, `MIRROR_HOME` > `MIRROR_USER`, `.mirror-minds` preferred with legacy `.mirror` fallback) because a Pi extension cannot import `memory.config`. Two implementations of one contract can silently diverge. | If the core changes resolution semantics (new precedence, new env var, or another home-dir rename), Pi external-skill discovery breaks again exactly as it did here — and fails quietly, exposing zero external skills. | Contract is centralized on each side (constants + helpers). Longer term, make Python the single source of truth by exposing a machine-readable resolved-home command the extension can call, or a shared language-neutral config; add a regression check asserting Node and Python agree for representative env/`.env` cases. | Accept duplication now (Option 1); track for future consolidation. | Open — Accepted |
| TD-002 | mm-backup skill session, 2026-07-20 | `src/memory/cli/backup.py` (`backup()`, `main()`) ↔ `src/memory/config.py` (`db_name_for_env`, `MEMORY_ENV`) | Coherence gap / silent wrong-target risk | `backup()`'s CLI path always resolves `db_path` to `mirror_home / "memory.db"` whenever `mirror_home` is set — which it almost always is, via `_RESOLVED_MIRROR_HOME`. It never consults `db_name_for_env()`/`MEMORY_ENV`, even though that mapping exists precisely to isolate `production`/`development`/`test` databases (`memory.db` / `memory_dev.db` / `memory_test.db`). Only the fallback path (`mirror_home is None`) reads `DB_PATH`, which does respect `MEMORY_ENV`. | On a `development` or `test` environment, `uv run python -m memory backup` reports "Database not found" instead of backing up the actual environment database — a silent no-op that looks like an error but is actually pointing at the wrong file. Confirmed live: dev DB is `memory_dev.db`, but backup always looked for `memory.db`. Required a manual `backup(db_path=...)` call to work around it. | Make `backup.py`'s CLI path use `db_name_for_env()` (or equivalent) instead of hard-coding `"memory.db"`, so the environment-aware naming in `config.py` is respected consistently across all entry points, not just the `mirror_home is None` fallback. | Pending | Open — Pending |

## Deferred Debt Requirements

When debt is deferred, record the defer reason and revisit trigger.

- **TD-001 scope note (2026-07-12, CV9.E2.S6):** the duplicated TS-side
  resolution now also feeds the mirror-logger log destination
  (`_resolveMemoryDir`: `MEMORY_DIR` > resolved home > homes-root bootstrap
  fallback). No third copy was added — the log path reuses the existing
  `_effectiveMirrorEnv` machinery — and the same revisit trigger applies.
- **TD-001** — Defer reason: a Pi (TypeScript) extension cannot import the Python
  `memory.config` constants, so duplicating the resolution contract is the smallest
  correct fix today. Revisit trigger: any change to the core mirror-home resolution
  semantics (precedence, new `MIRROR_*` variable, or a home-directory rename), or the
  next time a non-Python runtime surface needs to resolve the home itself — at that
  point promote the shared resolution to a single source of truth (core command or
  language-neutral config) rather than adding a third copy.
