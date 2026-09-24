[< Docs](../index.md)

# Configuration Reference

This reference explains Mirror's configuration values: what each one is, what
reads it, how to change it, and what changes when you do. Every value named
here is read by the TypeScript core under `ts/`; the file that reads it is
named so a reader can check the claim rather than trust it.

Until CV22.DS10.US1 this page also backed the local web Configuration page. The
web console is [retired](../releases/pending-cutoffs.md#the-web-console-and-the-scene-surface-it-rendered),
and so is the Python core that used to read several of these values
(CV22.DS10.TS5). Values only the Python core read are listed as inert at the
end, so a leftover line in a `.env` can be recognized rather than trusted.

## Safety model

Mirror reads configuration; no command writes it. Values come from the process
environment and from the repository `.env`, which Node loads for every
invocation (`--env-file` in the skills, `--env-file-if-exists` in the hook
wrappers and the MCP launcher). A value already set in the environment wins
over the same value in `.env`. Secrets are read from the environment only,
never accepted as a command-line argument, never logged, and never included in
an error message.

## Mirror home

**What it is:** the local filesystem root for the active Mirror. It owns the runtime state for one local mind: database, backups, extensions, and related generated files.

**Used by:** database resolution, backup defaults, and extension discovery.

**How to change it:** set `MIRROR_HOME` to an explicit path, or set `MIRROR_USER` so Mirror derives `~/.mirror-minds/<user>`.

**Active in code:** yes. Resolution happens in `ts/src/frontDoor/dbPath.ts`; the MCP server resolves the same chain in `ts/src/mcp/main.ts`.

**Effects:** changing the active home changes which local database, extensions, and backups the runtime sees. Conflicting `MIRROR_HOME` and `MIRROR_USER` values fail hard when the basename does not match.

## Database

**What it is:** the SQLite `memory.db` used by the active Mirror.

**Used by:** all persisted identity, memories, conversations, messages, journeys, tasks, runtime sessions, and audit logs.

**How to change it:** normally by changing the active Mirror home. Advanced or test runs may set `DB_PATH` to an explicit database file.

**Active in code:** yes. `ts/src/frontDoor/dbPath.ts` resolves the path; `ts/src/db/bootstrap.ts` opens it, applies the connection pragmas, and applies any pending migration, backup first.

**Effects:** changing the database changes the visible identity, journeys, conversations, and memories for that runtime session. Use `DB_PATH` for isolated tests rather than pointing tests at production data.

## Backups

**What it is:** the default directory for Mirror database backups, `<mirror home>/backups`.

**Used by:** `backup`, `runtime backup`, the updater's backup stage, and the front door's pre-write snapshot.

**How to change it:** by changing the Mirror home. For one intentional destination, pass `backup --backup-dir <path>`. `BACKUP_DIR` is deprecated: `backup` warns and ignores it.

**Active in code:** yes. `ts/src/backup/zipBackup.ts` and `ts/src/frontDoor/liveBackup.ts`.

**Effects:** backup files are written outside the core database and can be used for recovery. A directory Mirror creates is owner-only (`0700`), and so is each archive (`0600`).

## Extensions

**What it is:** the local extension directory for the active Mirror, `<mirror home>/extensions`.

**Used by:** extension discovery, installation, and dispatch.

**How to change it:** by changing the active Mirror home.

**Active in code:** yes. `ts/src/extensions/`.

**Effects:** controls which local Mirror extensions are available to the runtime.

## MIRROR_HOME

**What it is:** an environment variable that explicitly sets the active Mirror home path.

**Used by:** Mirror home resolution before database and default directory construction.

**How to change it:** set it in `.env`, export it in the shell, or pass `--mirror-home` where a command supports it.

**Active in code:** yes. `ts/src/frontDoor/dbPath.ts`.

**Effects:** overrides the `MIRROR_USER`-derived default path. If set together with `MIRROR_USER`, the basename must match the user value or resolution fails.

## MIRROR_USER

**What it is:** an environment variable naming the local Mirror user/home slug.

**Used by:** deriving the default home `~/.mirror-minds/<MIRROR_USER>`.

**How to change it:** set it in `.env` or export it in the shell.

**Active in code:** yes. It is used when `MIRROR_HOME` is not explicitly set.

**Effects:** selects the default local Mirror without hardcoding an absolute path. This is the recommended setup for normal local use.

## MEMORY_ENV

**What it is:** the runtime environment selector: `production`, `development`, or `test`.

**Used by:** database name selection (`memory.db`, `memory_dev.db`, `memory_test.db`) and test isolation.

**How to change it:** set `MEMORY_ENV` in `.env` or the shell for the process.

**Active in code:** yes. `ts/src/frontDoor/dbPath.ts` selects the database name from it; `runtime status` and the welcome card report it.

**Effects:** selects the database **name** only, never the directory. Test and development modes should be used for isolated validation.

## MEMORY_DIR

**What it is:** an optional memory runtime directory override.

**Used by:** directory resolution when the Mirror home is not the sole source of paths. `MEMORY_PROD_DIR` overrides it in production only.

**How to change it:** set `MEMORY_DIR` in `.env` or the shell.

**Active in code:** yes. `ts/src/frontDoor/dbPath.ts`, as an advanced compatibility override.

**Effects:** can change where runtime files are resolved. Prefer `MIRROR_HOME`/`MIRROR_USER` for normal Mirror separation.

## DB_PATH

**What it is:** an optional explicit SQLite database path override.

**Used by:** database selection and isolated tests and smoke runs.

**How to change it:** set `DB_PATH` in `.env`, the shell, or a test process environment.

**Active in code:** yes. `ts/src/frontDoor/dbPath.ts`.

**Effects:** bypasses the default database path derived from the Mirror home. Use carefully: it can point the runtime at a completely different memory database.

## OPENROUTER_API_KEY

**What it is:** the secret API key used for OpenRouter-backed model calls.

**Used by:** embeddings, memory extraction, conversation summary and title generation, reception routing, `/mm-consult`, and every other LLM-backed feature.

**How to change it:** set `OPENROUTER_API_KEY` in `.env` or the shell.

**Active in code:** yes. `ts/src/providers/config.ts` reads it for every chat and embedding call.

**Effects:** when missing, LLM-backed actions fail safely or return no generated result depending on the caller; memory search degrades to lexical-only and says so.

## MEMORY_LOG_LLM_CALLS

**What it is:** the mode for local LLM call logging.

**Used by:** the shared ledger seam behind extraction, curation, task extraction, summaries, reception, journal classification, consolidation, shadow scan, conversation title/tag suggestions, and consult.

**How to change it:** one of `off | metadata | full`. Absence or `metadata` (the default) records call metadata only. `full` additionally stores prompt and response bodies. `off` (or `0`) disables logging. Legacy `1` maps to `full`.

**Active in code:** yes. `ts/src/providers/config.ts` resolves the mode; `ts/src/observability/ledgerHooks.ts` writes the rows.

**Effects:** in `metadata` mode Mirror records role, model, token counts, latency, estimated cost, and conversation id to the local `llm_calls` table with empty prompt/response â no conversation content is retained. `full` adds the bodies, which can retain sensitive prompt content locally and increase storage. Estimated cost comes from a static price table (`ts/src/providers/cost.ts`) and is labeled accordingly. Inspect with `mirror inspect llm-calls`.

## MEMORY_RECEPTION

**What it is:** a toggle for LLM-assisted reception/routing.

**Used by:** Mirror Mode persona/journey routing when the runtime classifies incoming turns beyond simple keyword heuristics.

**How to change it:** reception is **on** unless `MEMORY_RECEPTION=0`.

**Active in code:** yes. `ts/src/frontDoor/mirrorModeRoute.ts`.

**Effects:** when on, Mirror makes one classification call per Mirror-mode turn to route persona and journey, failing safe to keyword routing. `0` saves that call and loses turn-aware response shaping.

## MEMORY_EXTRACTION_MAX_ATTEMPTS

**What it is:** the retry budget before a conversation whose memory extraction keeps failing is quarantined.

**Used by:** the session-maintenance extraction loops. Each failed extraction (provider outage, oversized transcript, auth error) increments an `extraction_attempts` counter in the conversation metadata.

**How to change it:** set `MEMORY_EXTRACTION_MAX_ATTEMPTS` to a positive integer. Absence defaults to `3`.

**Active in code:** yes. `ts/src/providers/config.ts`, used by `ts/src/conversation/extractionRun.ts`.

**Effects:** once attempts reach this value the conversation is flagged quarantined and dropped from the pending extraction queue, so a poison-pill conversation is not retried at every session start and does not block the conversations queued behind it. The session-maintenance report names the quarantine count. Quarantine is sticky: a conversation quarantined by a transient outage stays quarantined until the flag is cleared.

## MEMORY_MAINTENANCE_MAX_EXTRACTIONS

**What it is:** the maximum number of pending conversations one session-start maintenance run extracts.

**Used by:** session maintenance, on every session start. Eligible conversations (ended, journey-bound, â¥4 messages, not quarantined) are processed oldest-ended first; any remainder stays pending and carries over to the next session start rather than being dropped.

**How to change it:** set `MEMORY_MAINTENANCE_MAX_EXTRACTIONS` to a positive integer. Absence defaults to `10`.

**Active in code:** yes. `ts/src/providers/config.ts`, used by `ts/src/conversation/extractionDriver.ts`.

**Effects:** bounds the worst-case spend and latency of a single session start â each processed conversation costs at least 2 LLM calls plus up to ~9 embedding calls. Without a cap, a backlog (a gap in usage, a dead API key, a quarantine-adjacent failure period) turns the next session start into a long, invisible, unbounded spend burst. The session-maintenance report names the carried-over count when it is greater than zero, so a chronic backlog stays visible instead of silently lagging.

## Environment

See [MEMORY_ENV](#memory_env).

## Memory search model

**What it is:** the embedding model used to convert memory text into vectors for semantic search.

**Used by:** memory insertion, search, retrieval, and similarity checks during curation.

**How to change it:** set `MEMORY_EMBEDDING_MODEL`; absence uses the pinned default.

**Active in code:** yes. `ts/src/providers/config.ts`.

**Effects:** changing it can affect search quality and may make old embeddings inconsistent with newly generated embeddings unless re-embedding is handled intentionally.

## Memory extraction model

**What it is:** the default model used for structured memory extraction and related generation tasks.

**Used by:** memory extraction, task extraction, summaries, journal classification, and conversation title suggestion.

**How to change it:** set `MEMORY_EXTRACTION_MODEL`; absence uses the pinned default. `runtime diagnose` checks that the pin still resolves.

**Active in code:** yes. `ts/src/providers/config.ts`.

**Effects:** affects quality, cost, latency, and behavior of LLM-backed memory operations. Follow the [model upgrade playbook](../process/development-guide.md#model-upgrade-playbook) before changing it.

## LLM audit logging

See [MEMORY_LOG_LLM_CALLS](#memory_log_llm_calls).

## Conversation routing

See [MEMORY_RECEPTION](#memory_reception).

## Hook Node resolution

**What it is:** `MIRROR_NODE`, the path of the `node` binary the runtime hook wrappers should run.

**Used by:** every hook wrapper under `.claude/hooks/`, `.gemini/hooks/`, and `plugins/mirror-mind/hooks/`.

**How to change it:** set `MIRROR_NODE=/path/to/node` in the environment the runtime is launched with. Without it a wrapper tries `command -v node`, then the nvm `current` symlink, `/opt/homebrew/bin/node`, and `/usr/local/bin/node`.

**Active in code:** yes. The wrappers read it before Node starts; `runtime diagnose` checks the same order from its own environment.

**Effects:** a GUI-launched runtime often does not inherit the `PATH` that holds `node`. A wrapper that cannot find Node skips the hook and writes one line to `<mirror home>/hooks.log` instead of failing the user's turn, so "Mirror stopped remembering" has a place to be diagnosed.

## TypeScript live-provider transport (CV22.DS8)

The core reaches OpenRouter through its own `fetch`-based transport
(`ts/src/providers/`) rather than an SDK.

### Per-call bounds

| Variable | Default | Meaning |
|---|---|---|
| `MEMORY_LLM_TIMEOUT_EXTRACTION` | `60` | Seconds bounding one extraction-tier call |
| `MEMORY_LLM_TIMEOUT_RECEPTION` | `10` | Seconds bounding one interactive reception call |
| `MEMORY_LLM_TIMEOUT_EMBEDDING` | `15` | Seconds bounding one embedding call |
| `MEMORY_LLM_MAX_RETRIES` | `2` | Retries **after** the first attempt (three attempts total) |

Every call is bounded at construction so a hung provider connection cannot
stall a session hook. Retries cover connection failures, 408, 409, 429, and
5xx â never another 4xx, which would spend money to receive the same answer. A
`retry-after` header is honored but capped at 60 seconds. A non-numeric
override fails loudly rather than silently reverting to the default.

### Replay fixtures

Every provider-crossing family accepts replay fixture paths: a deterministic
transport that answers from a recorded fixture and makes no network call. CI
and the smokes use them; so can you, to reproduce a run without spending.

| Family | Variables |
|---|---|
| `memories --search` | `MIRROR_TS_SEARCH_EMBEDDING_REPLAY` |
| `build` (`build load` composes search with the previous close tail) | `MIRROR_TS_BUILD_LLM_REPLAY` with `MIRROR_TS_BUILD_EMBEDDING_REPLAY` |
| the conversation close tail | `MIRROR_TS_CONVERSATION_LLM_REPLAY` with `MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY` |
| `consult` | `MIRROR_TS_CONSULT_LLM_REPLAY` with `MIRROR_TS_CREDITS_REPLAY` |
| `mirror load --query` | `MIRROR_TS_MIRROR_LLM_REPLAY` with `MIRROR_TS_MIRROR_EMBEDDING_REPLAY` |
| `consolidate`, `shadow` | `MIRROR_TS_CULTIVATION_LLM_REPLAY`, `MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY` |
| `journal` | `MIRROR_TS_JOURNAL_LLM_REPLAY` with `MIRROR_TS_JOURNAL_EMBEDDING_REPLAY` |
| `week plan`, `week save` | `MIRROR_TS_WEEK_LLM_REPLAY` |
| `descriptor generate` | `MIRROR_TS_DESCRIPTOR_LLM_REPLAY` |
| `soul harvest save` | `MIRROR_TS_SOUL_EMBEDDING_REPLAY` |

**Where a family declares two fixtures, both are required together.** Setting
only one is refused by name rather than treated as live or as unconfigured â
half a replay must never quietly become a live call that spends real money
while you believe you are replaying. One exception is deliberate:
`MIRROR_TS_CREDITS_REPLAY` alone is a complete replay setup for `consult
credits`, which needs no chat provider, and an incomplete one for `consult
ask`, which is refused by name. `MEMORY_RECEPTION=0` likewise removes the
classifier from `mirror load --query`, after which the embedding fixture alone
is complete.

With no fixture set, every family runs live. Without `OPENROUTER_API_KEY`,
`memories --search` degrades to lexical-only search and says so â no call is
attempted and no `llm_calls` row is written. For `build load`, the front-door
log records only `leaf=load calls=N` and a degraded category when present,
never the journey briefing used as the embedding query.

### The MCP server (CV22.DS9.TS2)

The Claude plugin manifest launches `${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh`,
not an engine. The launcher `exec`s the TypeScript server, so the entry point
can change without editing a plugin installed inside a runtime.

The server needs `node` (â¥ 24) on the `PATH` the MCP client spawns it with,
and a configured database (`.env` in the repository, or
`DB_PATH`/`MIRROR_HOME`/`MIRROR_USER` in the client's environment). A missing
`node` or an unconfigured home each fail loudly on stderr, which is where the
MCP client's log for this server goes.

An agent-initiated search records one `llm_calls` row. It is written through a
connection that can run nothing but that append; the tools' own handle is
read-only at the driver level.

### MCP wallet and abuse guards (CV22.DS9.TS1)

| Variable | Default | Meaning |
|---|---|---|
| `MIRROR_TS_MCP_GUARDS` | on | Set to `0` to remove every refusal and serve exactly what CV22.DS9.TS2 shipped. Recording and attribution stay on. |
| `MIRROR_MCP_EMBED_RATE_LIMIT` | `30` | Embedding calls the MCP surface may make inside the window, across `search_memories` and `mirror_context` together and across every MCP client at once. |
| `MIRROR_MCP_EMBED_RATE_WINDOW_MINUTES` | `10` | The sliding window. |
| `MIRROR_MCP_DAILY_USD_CEILING` | unset | Trailing-24h ceiling on attributed MCP spend. Unset means no ceiling. |

Set these where the launcher will find them â the repository `.env`, which
`launch.sh` passes to node â or in the environment the MCP client is started
with. **A malformed value fails the launch** with the variable named on stderr,
rather than silently serving unguarded; the client shows the server as failed
and its MCP log carries the reason.

**Why a rate and not a budget by default.** An embedding costs about
$0.000002, so a ceiling that actually bites would have to be set at cents. What
a runaway agent loop really does is exhaust the provider's rate limit â whose
429s then land on your *other* work â stall the agent about two seconds per
call, and fill its context with search results. The rate guard is the control;
the USD ceiling is there for when you have decided what this surface may cost
you per day.

**What a refusal looks like.** The agent receives a readable tool error, never a
protocol error, and the server stays up:

```text
Error: search_memories is rate-limited (30 query searches in 10 minutes).
Filtered calls â journey, layer, or type, with no query â are not metered and
still work. Ask the user to raise MIRROR_MCP_EMBED_RATE_LIMIT if you need more.
Do not send another query to this tool until the user replies.
```

The wording is deliberate and was corrected after watching a real agent read it.
Saying only "use a filter instead" got read as *a way around the limit*, so the
text now states the property plainly: filtered calls are not metered, because
they cross no provider. And "do not retry this tool" got read as *this call will
not succeed* â the agent moved to its next topic and was refused again â so the
stop is scoped to another query and gated on you.

**Where to see refusals.** The server writes one metadata-only line per refusal
to stderr â `guard refused tool=search_memories reason=rate_limit`, never the
query. Claude Code does not surface a connected server's stderr, so there the
refusal appears in the MCP log as the tool failure itself:

```text
Tool 'search_memories' failed after 0s: Error: search_memories is rate-limited â¦
```

Both carry the same fact; which one you see depends on the client.

**Seeing the spend.** Calls made by this surface are tagged in the `llm_calls`
ledger with session `mcp`, so `inspect llm-calls --session mcp` is the view of
what agents have spent. That tag is also what the guard counts: your own session
closes write embedding rows too, and counting those would refuse the agent
because *you* ended a conversation.

**Argument bounds.** `limit` must be an integer within each tool's cap
(`search_memories` 50, `list_conversations` 100, `recall_conversation` 200) and
a query may be at most 4,000 characters. The Python server accepted `limit=0`
on `recall_conversation` and returned the entire transcript; that is refused
here, and `MIRROR_TS_MCP_GUARDS=0` restores it.

### Node-specific environment differences

Two behaviors differ from the HTTP stack the Python core used, and are **not**
papered over in code. Both matter only if your machine needs them:

- **Custom CA certificates.** Node uses its bundled CA store. Point it at a
  private CA with `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`.
- **HTTP proxies.** Node's `fetch` ignores `HTTPS_PROXY` unless you set
  `NODE_USE_ENV_PROXY=1` (Node â¥ 24). Behind a proxy without that flag, a
  search degrades to lexical-only and the degraded note will say "offline or no
  API key", which is misleading. The front-door log records the real cause as a
  category â for example `embedding_degraded kind=provider_error` â which is
  how to tell the two apart.

### Observability

Live provider calls write one `llm_calls` row per round-trip, priced from the
static model price table (an embedding call has no generation id to fetch a
real cost for). Under `MEMORY_LOG_LLM_CALLS=metadata` â the default â the
`prompt` and `response` columns are empty strings: your query text is never
persisted.

### Conversation close tail (CV22.DS8.US2)

The close tail â title, tags, summary, memory and task extraction, and their
embeddings â runs when a session ends, including from the Pi `session-end`
hook. It reads the same per-call bounds as every other live surface, and its
replay fixtures are in the table above.

Every close-tail call is written to `llm_calls` with its token usage and a
cost computed from the static price table. Under `MEMORY_LOG_LLM_CALLS=metadata`
(the default) the `prompt` and `response` columns stay empty, so transcript
text is never persisted by the ledger.

### The long tail (CV22.DS8.US3)

The remaining provider-crossing leaves â `consult`, `mirror load --query`,
`journal`, `week plan`, `descriptor generate`, `soul harvest save`, and
`consolidate apply` â answer against the live provider with no configuration.

#### What `descriptor generate` costs

`descriptor generate` without `--layer` and `--key` makes one model call per
persona **and** per journey. Nothing bounds that but the arguments, so the
front-door log records `calls=N` for the invocation. Narrow it when you only
need one entity.

#### Reading a swallowed failure

`consolidate scan`, `shadow scan`, and reception report "nothing found" for a
provider outage, for model output that could not be parsed, and for an honest
empty result alike â the behavior the Python engine had, kept on purpose. The
front-door log carries the distinction as a category:

```text
consolidation outcome=parse_failed
consolidation calls=3 answered=2 parse_failed=1
reception outcome=transport_failed kind=rate_limit
```

`parse_failed` is a prompt-layer signal: the call arrived, was paid for, and
came back unusable. `transport_failed` with its `kind=` is a transport signal.
`empty` means the model answered and there was genuinely nothing to do.

## Inert values

Values a `.env` may still carry from an earlier release. Nothing reads them,
and setting them changes nothing.

**The migration's revert variables.** While the TypeScript core replaced the
Python one, each ported family kept one variable that sent it back to Python:
`MIRROR_TS_BACKUP`, `MIRROR_TS_BUILD`, `MIRROR_TS_CONSULT`,
`MIRROR_TS_CONVERSATION_APPEND`, `MIRROR_TS_CONVERSATION_LLM_TAIL`,
`MIRROR_TS_CONVERSATION_LOGGER`, `MIRROR_TS_CONVERSATIONS_LIFECYCLE`,
`MIRROR_TS_CULTIVATION`, `MIRROR_TS_DESCRIPTOR`, `MIRROR_TS_EXPLORE`,
`MIRROR_TS_EXTENSIONS`, `MIRROR_TS_IDENTITY_EDIT`,
`MIRROR_TS_JOURNAL`, `MIRROR_TS_MCP`, `MIRROR_TS_MIRROR_QUERY`,
`MIRROR_TS_REPAIR_ENCODING`, `MIRROR_TS_RUNTIME_READS`,
`MIRROR_TS_RUNTIME_UPDATE`, `MIRROR_TS_SEARCH`, `MIRROR_TS_SOUL`,
`MIRROR_TS_WEEK`, and `MIRROR_TS_WELCOME` — plus `MIRROR_TS_EXTERNAL_ROUTES`, the
opt-in DS8 retired. CV22.DS10.TS5 deleted the engine they reverted to, and
the gates with it. `runtime diagnose` names any still
set, as an `info` finding, so a revert nobody can perform is never mistaken
for one that is armed. The `*_REPLAY` variables above are **not** among them.

**Paths only the Python core read.** `EXPORT_DIR`, `TRANSCRIPT_EXPORT_DIR`, and
`DB_BACKUP_PATH` have no reader in the TypeScript core.

**The web preferences file.** `<mirror-home>/web/preferences.json` was read
only by the retired web console. Mirror leaves it where it is and reads nothing
from it.
