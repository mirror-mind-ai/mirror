[< Docs](../index.md)

# Configuration Reference

This reference explains the configuration values surfaced by the local Mirror web Configuration page. The web page is intentionally read-only: it shows active values or masked status, but changes still happen through environment files, shell exports, Mirror initialization, or dedicated service-backed flows.

## Safety model

The Configuration page does not dump `os.environ`, does not expose secrets, and does not edit `.env`, YAML, JSON, or the database directly. It shows a small allowlist of Mirror/runtime settings and links each surfaced value back to this reference.

## Mirror home

**What it is:** the local filesystem root for the active Mirror. It owns the runtime state for one local mind: database, preferences, backups, exports, extensions, and related generated files.

**Used by:** database resolution, web preference storage, backup/export defaults, extension discovery, and Mirror switching in the web app.

**How to change it:** set `MIRROR_HOME` to an explicit path, or set `MIRROR_USER` so Mirror derives `~/.mirror-minds/<user>`. The web Mirror selector can switch only among discovered local Mirror homes; it does not accept arbitrary paths from the browser.

**Active in code:** yes. Resolution happens in `memory.config.resolve_mirror_home()` and web sessions derive their database path from the selected Mirror home.

**Effects:** changing the active home changes which local database, preferences, extensions, backups, and exports the runtime sees. Conflicting `MIRROR_HOME` and `MIRROR_USER` values fail hard when the basename does not match.

## Database

**What it is:** the SQLite `memory.db` used by the active Mirror.

**Used by:** all persisted identity, memories, conversations, messages, journeys, tasks, runtime sessions, and audit logs.

**How to change it:** normally by changing the active Mirror home. Advanced or test runs may set `DB_PATH` to an explicit database file.

**Active in code:** yes. `MemoryClient` opens this path through `memory.db.get_connection()`.

**Effects:** changing the database changes the visible identity, journeys, conversations, memories, and preferences-dependent behavior for that runtime session. Use `DB_PATH` for isolated tests rather than pointing tests at production data.

## Preferences

**What it is:** the per-Mirror web preferences file, currently `<mirror-home>/web/preferences.json`.

**Used by:** web display name, avatar symbol, theme, and default perspective.

**How to change it:** through the web Preferences page. The file is scoped to the active Mirror.

**Active in code:** yes. `WebPreferenceStore` reads and writes this JSON file through bounded preference methods.

**Effects:** changes affect only the local web presentation for that Mirror. They do not alter structural identity in the memory database.

## Backups

**What it is:** the default directory for Mirror database backups.

**Used by:** backup tooling and the `mm-backup` flow.

**How to change it:** normally by changing the Mirror home. Advanced runtime configuration may use the backup-related environment settings supported by `memory.config`.

**Active in code:** yes. The default is derived by `default_backup_dir_for_home()`.

**Effects:** backup files are written outside the core database and can be used for recovery or migration.

## Exports

**What it is:** the default directory for general user exports.

**Used by:** export commands and future web export flows.

**How to change it:** normally by changing the Mirror home or export-related environment settings.

**Active in code:** yes. The default is derived by `default_export_dir_for_home()`.

**Effects:** affects where generated export artifacts are stored.

## Extensions

**What it is:** the local extension directory for the active Mirror.

**Used by:** extension discovery and runtime extension loading.

**How to change it:** normally by changing the active Mirror home or extension-related runtime settings.

**Active in code:** yes. The default is derived by `default_extensions_dir_for_home()`.

**Effects:** controls which local Mirror extensions are available to the runtime.

## MIRROR_HOME

**What it is:** an environment variable that explicitly sets the active Mirror home path.

**Used by:** Mirror home resolution before database/default directory construction.

**How to change it:** set it in `.env`, export it in the shell, or pass an equivalent runtime option where supported.

**Active in code:** yes. It is read by `resolve_mirror_home()`.

**Effects:** overrides `MIRROR_USER`-derived default path. If set together with `MIRROR_USER`, the basename must match the user value or resolution raises an error.

## MIRROR_USER

**What it is:** an environment variable naming the local Mirror user/home slug.

**Used by:** deriving the default home `~/.mirror-minds/<MIRROR_USER>`.

**How to change it:** set it in `.env` or export it in the shell.

**Active in code:** yes. It is used when `MIRROR_HOME` is not explicitly set.

**Effects:** selects the default local Mirror without hardcoding an absolute path. This is the recommended setup for normal local use.

## MEMORY_ENV

**What it is:** the runtime environment selector, such as production, development, or test.

**Used by:** database path selection, production safety checks, and test isolation.

**How to change it:** set `MEMORY_ENV` in `.env` or the shell for the process.

**Active in code:** yes. `MemoryClient` and config defaults read it during startup.

**Effects:** production mode blocks destructive reset behavior and uses production defaults. Test/development modes should be used for isolated validation.

## MEMORY_DIR

**What it is:** an optional memory runtime directory override.

**Used by:** legacy/default directory resolution when Mirror home is not the sole source of paths.

**How to change it:** set `MEMORY_DIR` in `.env` or the shell.

**Active in code:** yes, primarily as an advanced compatibility/configuration override.

**Effects:** can change where runtime files are resolved. Prefer `MIRROR_HOME`/`MIRROR_USER` for normal Mirror separation.

## DB_PATH

**What it is:** an optional explicit SQLite database path override.

**Used by:** `MemoryClient` database selection and isolated tests/smoke runs.

**How to change it:** set `DB_PATH` in `.env`, shell, or test process environment.

**Active in code:** yes.

**Effects:** bypasses the default database path derived from Mirror home. Use carefully: it can point the runtime at a completely different memory database.

## OPENROUTER_API_KEY

**What it is:** the secret API key used for OpenRouter-backed model calls.

**Used by:** embeddings, memory extraction, conversation summary/title generation, reception routing when enabled, `/mm-consult`, and other LLM-backed features.

**How to change it:** set `OPENROUTER_API_KEY` in `.env` or the shell. Do not paste it into the web UI.

**Active in code:** yes. `memory.intelligence.llm_router.send_to_model()` requires it for chat completions, and embedding generation uses OpenRouter-backed configuration.

**Effects:** when missing, LLM-backed actions fail safely or return no generated result depending on the caller. The web Configuration page only shows a masked status and never reveals the full key.

## MEMORY_LOG_LLM_CALLS

**What it is:** the mode for local LLM call logging.

**Used by:** the shared logger seam behind extraction, curation, task extraction, summaries, reception, journal classification, consolidation, shadow scan, and conversation title/tag suggestions.

**How to change it:** one of `off | metadata | full`. Absence or `metadata` (the default) records call metadata only. `full` additionally stores prompt and response bodies. `off` (or `0`) disables logging. Legacy `1` maps to `full`.

**Active in code:** yes. It maps to `config.LOG_LLM_CALLS_MODE`, with `config.LOG_LLM_CALLS` (on/off) and `config.LOG_LLM_BODIES` (full only) derived from it.

**Effects:** in `metadata` mode Mirror records role, model, token counts, latency, estimated cost, and conversation id to the local `llm_calls` table with empty prompt/response — no conversation content is retained. `full` adds the bodies, which can retain sensitive prompt content locally and increase storage. Estimated cost comes from a static price table (`intelligence/cost.py`) and is labeled accordingly. Inspect with `python -m memory inspect llm-calls`.

## MEMORY_RECEPTION

**What it is:** a toggle for LLM-assisted reception/routing.

**Used by:** Mirror Mode persona/journey routing when the runtime classifies incoming turns beyond simple keyword heuristics.

**How to change it:** set `MEMORY_RECEPTION=1` to enable. Any other value or absence disables it.

**Active in code:** yes. It maps to `config.RECEPTION_ENABLED`.

**Effects:** when enabled, Mirror may make an LLM call to classify a turn for persona/journey routing. When disabled, routing falls back to cheaper deterministic behavior.

## MEMORY_EXTRACTION_MAX_ATTEMPTS

**What it is:** the retry budget before a conversation whose memory extraction keeps failing is quarantined.

**Used by:** the session-maintenance extraction loops (`extract_pending`, `close_stale_orphans`). Each failed extraction (provider outage, oversized transcript, auth error) increments an `extraction_attempts` counter in the conversation metadata.

**How to change it:** set `MEMORY_EXTRACTION_MAX_ATTEMPTS` to a positive integer. Absence defaults to `3`.

**Active in code:** yes. It maps to `config.EXTRACTION_MAX_ATTEMPTS`.

**Effects:** once attempts reach this value the conversation is flagged quarantined and dropped from the pending extraction queue, so a poison-pill conversation is not retried at every session start and does not block the conversations queued behind it. The session-maintenance report names the quarantine count. Quarantine is sticky: a conversation quarantined by a transient outage stays quarantined until the flag is cleared.

## MEMORY_MAINTENANCE_MAX_EXTRACTIONS

**What it is:** the maximum number of pending conversations `extract_pending` processes in one session-start maintenance run.

**Used by:** `session_maintenance`, on every session start. Eligible conversations (ended, journey-bound, ≥4 messages, not quarantined) are processed oldest-ended first; any remainder stays pending and carries over to the next session start rather than being dropped.

**How to change it:** set `MEMORY_MAINTENANCE_MAX_EXTRACTIONS` to a positive integer. Absence defaults to `10`.

**Active in code:** yes. It maps to `config.MEMORY_MAINTENANCE_MAX_EXTRACTIONS`.

**Effects:** bounds the worst-case spend and latency of a single session start — each processed conversation costs at least 2 LLM calls plus up to ~9 embedding calls. Without a cap, a backlog (a gap in usage, a dead API key, a quarantine-adjacent failure period) turns the next session start into a long, invisible, unbounded spend burst. The session-maintenance report names the carried-over count when it is greater than zero, so a chronic backlog (more eligible conversations generated per session than the cap drains) stays visible instead of silently lagging.

## Environment

See [MEMORY_ENV](#memory_env).

## Memory search model

**What it is:** the embedding model used to convert memory text into vectors for semantic search.

**Used by:** memory insertion, search, retrieval, and similarity checks during curation.

**How to change it:** change the embedding model configuration in environment/runtime settings supported by `memory.config`.

**Active in code:** yes. It maps to `config.EMBEDDING_MODEL`.

**Effects:** changing it can affect search quality and may make old embeddings inconsistent with newly generated embeddings unless migration/re-embedding is handled intentionally.

## Memory extraction model

**What it is:** the default model used for structured memory extraction and related generation tasks.

**Used by:** memory extraction, task extraction, summaries, journal classification, and the single-conversation title suggestion introduced in CV13.E4.

**How to change it:** change the extraction model configuration in environment/runtime settings supported by `memory.config`.

**Active in code:** yes. It maps to `config.EXTRACTION_MODEL`.

**Effects:** affects quality, cost, latency, and behavior of LLM-backed memory operations. Web title suggestions use this model through OpenRouter.

## LLM audit logging

See [MEMORY_LOG_LLM_CALLS](#memory_log_llm_calls).

## Conversation routing

See [MEMORY_RECEPTION](#memory_reception).
