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

## TypeScript live-provider transport (CV22.DS8)

The TypeScript core reaches OpenRouter through its own `fetch`-based transport
rather than the OpenAI SDK. It reads the same environment variables Python
does, so a single configuration governs both engines during the migration.

### Per-call bounds

| Variable | Default | Meaning |
|---|---|---|
| `MEMORY_LLM_TIMEOUT_EXTRACTION` | `60` | Seconds bounding one extraction-tier call |
| `MEMORY_LLM_TIMEOUT_RECEPTION` | `10` | Seconds bounding one interactive reception call |
| `MEMORY_LLM_TIMEOUT_EMBEDDING` | `15` | Seconds bounding one embedding call |
| `MEMORY_LLM_MAX_RETRIES` | `2` | Retries **after** the first attempt (three attempts total) |

Every call is bounded at construction so a hung provider connection cannot
stall a session hook (the OpenAI SDK's own default is 600 seconds). Retries
cover connection failures, 408, 409, 429, and 5xx — never another 4xx, which
would spend money to receive the same answer. A `retry-after` header is
honored but capped at 60 seconds. A non-numeric override fails loudly rather
than silently reverting to the default, matching Python's `float()`/`int()`.

### Route control

| Variable | Meaning |
|---|---|
| `MIRROR_TS_SEARCH` | Set to `0` to send `memories --search` back to the Python engine. Wins over any replay fixture. |
| `MIRROR_TS_SEARCH_EMBEDDING_REPLAY` | Path to a replay fixture. Used by CI and the parity harness; selects a deterministic transport that makes no network call. |

With neither set, `memories --search` runs a live embedding through
TypeScript. Without `OPENROUTER_API_KEY` it degrades to lexical-only search
and prints the same note the Python engine prints — no call is attempted and
no `llm_calls` row is written.

### Node-specific environment differences

Two behaviors differ from Python's HTTP stack and are **not** papered over in
code. Both matter only if your machine needs them:

- **Custom CA certificates.** Python pins `certifi`; Node uses its bundled CA
  store. Point Node at a private CA with `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`.
- **HTTP proxies.** Python's `httpx` honors `HTTPS_PROXY` automatically; Node's
  `fetch` ignores it unless you set `NODE_USE_ENV_PROXY=1` (Node ≥ 24). Behind
  a proxy without that flag, a search degrades to lexical-only and the degraded
  note will say "offline or no API key", which is misleading. The front-door
  log records the real cause as a category — for example
  `embedding_degraded kind=provider_error` — which is how to tell the two
  apart.

### Observability

Live provider calls write one `llm_calls` row per round-trip, priced from the
static model price table (an embedding call has no generation id to fetch a
real cost for). Under `MEMORY_LOG_LLM_CALLS=metadata` — the default — the
`prompt` and `response` columns are empty strings: your query text is never
persisted. The API key is read from the environment only, never accepted as a
command-line argument, never logged, and never included in an error message.

### Conversation close tail (CV22.DS8.US2)

The close tail — title, tags, summary, memory and task extraction, and their
embeddings — runs when a session ends, including from the Pi `session-end`
hook. It reads the same per-call bounds as every other live surface.

| Variable | Meaning |
|---|---|
| `MIRROR_TS_CONVERSATION_LLM_TAIL` | Set to `0` to send the five close-tail subcommands (`switch`, `session-end-pi`, `session-end`, `session-start` full run, `session-maintenance`) back to the Python engine. The seven deterministic subcommands stay on TypeScript. |
| `MIRROR_TS_CONVERSATION_LOGGER` | Set to `0` to revert the **whole** fifteen-subcommand family, for a larger scare. |
| `MIRROR_TS_CONVERSATION_LLM_REPLAY` | Path to a chat replay fixture. Used by CI and the parity harness. |
| `MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY` | Path to the matching embedding replay fixture. |

**Both replay fixtures are required together.** Setting only one is refused by
name rather than treated as live or as unconfigured: falling back to Python
would not be safer, because the Python engine has no replay transport and
would reach the live provider anyway — spending real money on the other
engine while you believed you were replaying.

Every close-tail call is written to `llm_calls` with its token usage and a
cost computed from the static price table, matching the Python engine. Under
`MEMORY_LOG_LLM_CALLS=metadata` (the default) the `prompt` and `response`
columns stay empty, so transcript text is never persisted by the ledger.

### The long tail (CV22.DS8.US3)

The remaining provider-crossing leaves — `consult`, `mirror load --query`,
`journal`, `week plan`, `descriptor generate`, `soul harvest save`, and
`consolidate apply` — answer from TypeScript against the live provider with no
configuration. Each family keeps one variable that sends it back to Python.

| Variable | Meaning |
|---|---|
| `MIRROR_TS_CONSULT` | Set to `0` to revert both `consult credits` and `consult ask`. |
| `MIRROR_TS_MIRROR_QUERY` | Set to `0` to revert `mirror load --query` only. The deterministic `mirror load` stays on TypeScript: it is the most-used read in the product and must not be dragged back by a query-path problem. |
| `MIRROR_TS_CULTIVATION` | Set to `0` to revert `consolidate scan\|apply` and `shadow scan`. `consolidate list\|reject\|show` stay on TypeScript — they cross no provider seam. |
| `MIRROR_TS_JOURNAL` | Set to `0` to revert `journal`. |
| `MIRROR_TS_WEEK` | Set to `0` to revert `week plan` and `week save`. `week view` deliberately stays outside this gate — it was flipped ungated earlier and reverting a planning problem must not take a working read with it. |
| `MIRROR_TS_DESCRIPTOR` | Set to `0` to revert `descriptor generate`. |
| `MIRROR_TS_SOUL` | Set to `0` to revert the whole Soul family, including `harvest save` — the one Soul leaf that reaches a provider. |

Each family also accepts replay fixture paths for CI and the parity harness:
`MIRROR_TS_CONSULT_LLM_REPLAY` with `MIRROR_TS_CREDITS_REPLAY`,
`MIRROR_TS_MIRROR_LLM_REPLAY` with `MIRROR_TS_MIRROR_EMBEDDING_REPLAY`,
`MIRROR_TS_CULTIVATION_LLM_REPLAY`,
`MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY`,
`MIRROR_TS_JOURNAL_LLM_REPLAY` with `MIRROR_TS_JOURNAL_EMBEDDING_REPLAY`,
`MIRROR_TS_WEEK_LLM_REPLAY`, `MIRROR_TS_DESCRIPTOR_LLM_REPLAY`, and
`MIRROR_TS_SOUL_EMBEDDING_REPLAY`.

**Where a family declares two fixtures, both are required together** — the
same rule the close tail follows, and for the same reason. One exception is
deliberate: `MIRROR_TS_CREDITS_REPLAY` alone is a complete replay setup for
`consult credits`, which needs no chat provider, and an incomplete one for
`consult ask`, which is refused by name rather than sent half-live.
`MEMORY_RECEPTION=0` likewise removes the classifier from `mirror load
--query` on both engines, after which the embedding fixture alone is complete.

**`MIRROR_TS_EXTERNAL_ROUTES` is retired.** It was the opt-in that let these
leaves reach TypeScript while replay was their production route; after the live
cutover replay is a test transport, so the gate only added a second thing to
set. A leftover value in a shell or a script is inert — it neither enables nor
disables anything.

#### What `descriptor generate` costs

`descriptor generate` without `--layer` and `--key` makes one model call per
persona **and** per journey. Nothing bounds that but the arguments, so the
front-door log records `calls=N` for the invocation. Narrow it when you only
need one entity.

#### Reading a swallowed failure

`consolidate scan`, `shadow scan`, and reception report "nothing found" for a
provider outage, for model output that could not be parsed, and for an honest
empty result alike — this matches the Python engine exactly. The front-door log
carries the distinction as a category:

```text
consolidation outcome=parse_failed
consolidation calls=3 answered=2 parse_failed=1
reception outcome=transport_failed kind=rate_limit
```

`parse_failed` is a prompt-layer signal: the call arrived, was paid for, and
came back unusable. `transport_failed` with its `kind=` is a transport signal.
`empty` means the model answered and there was genuinely nothing to do.
