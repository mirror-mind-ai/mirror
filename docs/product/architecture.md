[< Product](index.md)

# Architecture

System architecture for Mirror Mind. Written for contributors who want to add
a feature or fix a bug and need to understand how the system is organized
before touching code. If you want to integrate programmatically, see
[docs/product/api.md](api.md).

---

## 1. System Overview

Mirror Mind is a local-first memory and identity framework for agentic AI
runtimes. One Python core (`src/memory/`) handles all persistence, extraction,
search, and identity management. Multiple harness interfaces — Pi, Codex, Claude
Code, and Gemini CLI — connect to that core through thin adapter layers. The
database is SQLite, stored in the user's home directory. Nothing runs on a
server; all data stays on the user's machine.

---

## 2. Repository Structure

```text
src/memory/                  — Python package: all business logic
  cli/                       — CLI entry points (call services, no raw SQL)
  hooks/                     — Hook handlers (called by runtime lifecycle events)
  journey_projections/       — Versioned Journey projection contracts, schemas, serialization, and publication
  intelligence/              — LLM-powered extraction, search, routing
  services/                  — Domain services (the implementation layer)
  storage/                   — Persistence components (raw SQL lives here)
  surfaces/                  — Web read-model composition for Atlas, Workspace, detail, evidence, and search
  skills/                    — Shared skill logic callable by any harness
templates/identity/          — Generic bootstrap templates shipped in the repo
examples/extensions/         — Reference extensions (e.g. review-copy)
tests/                       — Automated tests
.pi/skills/                  — Pi skill surface (SKILL.md files)
.claude/skills/              — Claude Code skill surface
.agents/skills/              — Shared Gemini CLI/Codex surface (symlinked from .pi/skills/)
scripts/                     — Shell utilities (smoke tests, Codex wrapper)
evals/                       — LLM behavioral evaluations (not in CI)
```

**User home (outside the repo):**

```text
~/.mirror-minds/<user>/identity/   — real user-owned identity YAML files
~/.mirror-minds/<user>/extensions/ — user-installed extensions
~/.mirror-minds/<user>/memory.db   — runtime database (source of truth)
~/.mirror-minds/<user>/backups/    — database backups
```

---

## 3. Layer Model — Import Direction

The architecture enforces a strict one-way import hierarchy:

```
cli / hooks
    ↓
services
    ↓
storage
    ↓
db (SQLite)
```

- `cli` and `hooks` import from `services`. They never execute SQL directly.
- `services` import from `storage`. They hold domain logic and orchestrate
  storage calls.
- `storage` imports from `db`. It owns all raw SQL; no SQL lives above this layer.
- `MemoryClient` (`src/memory/client.py`) is a façade: it wires the services
  together and exposes a single public surface for all callers.

Reversing this direction — e.g. a service importing from CLI, or storage
importing from services — is a design violation. When in doubt, push logic down.

The web visibility surface adds a read-model layer above services:

```text
web -> surfaces -> services -> storage -> db
```

`web` routes must not execute SQL or compose domain meaning. They consume typed
surface DTOs produced by `src/memory/surfaces/`. See the [Web Surface
Specification](specs/web-surface/index.md).

The single documented exception: `RuntimeSessionService` still owns some
transaction-boundary SQL pending a separate architecture decision.

Ariad's Delivery cursor is the sole runtime owner of conditional Plan authority.
Each Pull advances an active-item generation. A bounded single-use receipt may
bind Journey, method, generation, active Delivery Story, flow unit, canonical
child-code set, Plan contract version, exact-scope policy, and the fixed
Navigator Validation stop. It stores no prompt or Plan body. Conditional
approval revalidates those coordinates and Plan completeness, then consumes the
receipt in the same cursor persistence update as approval. Mismatch invalidates
the receipt and preserves ordinary approval; child order is presentational while
set addition/removal is authoritative. No model, provider, persona, network
service, or semantic prose comparison participates in verification.

The same cursor carries optional Delivery Story release intent as bounded planning
state. `planned`, `none`, and `undecided` remain distinct from an unrecorded
state and are bound to the Delivery Story ancestor rather than one child story.
Intent survives Pulls within that DS and clears when work moves to another DS.
It never grants commit, push, tag, stable-promotion, publication, or remote
mutation authority.

Journey projections add a filesystem read-model boundary without changing this
import direction. CLI, Ariad lifecycle, and the public Extension API call one
Journey projection service; contract models/schema validation, deterministic
serialization, Operational compilation, and publication storage remain separate
owners. Production root authority always comes from the registered Journey, not
a caller-supplied path. The subsystem invokes no model or network service.

Projection publication is linearizable per Journey. Core and extension writers,
as well as inspection, share one cross-process Journey lock; different Journeys
remain independent. The manifest is re-read and merged only after lock
acquisition, preventing stale-manifest lost updates. Internal create-once
receipts bind each snapshot ID to its canonical byte digest, while the manifest
remains the public current-state authority. Projection replacement precedes
manifest replacement; controlled pre-manifest failures restore the old document,
and interrupted/unrecoverable states surface explicit divergence without
implicit repair.

Extension API `1.1` exposes this owner through a bound
`ExtensionJourneyProjections` façade. Its namespace and producer identity come
from `ExtensionAPI.extension_id`, never caller parameters; `ariad` remains
Core-only. A lazy resolver reads only the registered Journey `project_path` from
the existing registry connection, and the façade delegates all validation,
locking, receipts, publication, rollback, and inspection to the shared service.
The extension's raw SQLite handle grants no projection path authority.

The Ariad Operational compiler is a pure read-model compiler above that same
service. It resolves authored roadmap links from their containing documents with
shared Ariad grammar, then classifies safety by the canonical target beneath the
registered Journey root. Parent-relative traversal is valid only while confined;
absolute, URI-like, backslash-based, canonical-escape, and symlink-escape targets
remain bounded failures. The compiler preserves authored hierarchy order, reads
active work only from explicit durable state, and extracts only public
exploration/refinement fields and allowlisted artifact references. Its `sourceRevision` hashes the canonical projected content, so
excluded narrative bodies cannot perturb consumer identity. A registered-root
rebuild validates the Operational schema and delegates publication to the DS2
kernel; lifecycle-triggered refresh remains a separate coordinator concern.
Malformed, cyclic, duplicate, or escaping durable references fail before
publication and never trigger inference or implicit repair.

Operational refresh is a post-commit observer, not mutation authority. A generic
optional callback on `Store` is wired by `MemoryClient` to one
`ProjectionRefreshCoordinator`. Delivery cursor writes compare only projected
active-work fields; Explorer persistence compares only public story fields; and
Refinement service operations request once after their complete logical commit.
The coordinator compiles registered state, skips publication when the current
`sourceRevision` already matches, and otherwise delegates to DS2. Compilation,
inspection, or publication failure becomes bounded diagnostics and is never
re-raised into the already-successful source mutation. Read-only operations and
excluded Explorer evidence do not request refresh.

The Journey Projection CLI is a transport over these owners. Production rebuild
and inspection accept a Journey ID plus selected Mirror home, then resolve root
authority from that home's registry. Consumer-probe preparation is a separate
test-only adapter: it requires `MEMORY_ENV=test`, proves a non-production home,
confines fixture and active state below `.journey-projection-probe`, verifies the
isolated SQLite main path, and grants extension publication only through the
fixed `projection-probe` identity. Fixed compiler identities live in that
isolated control record and cannot be selected by production callers.

---

## 4. Identity Model

Identity is organized as Jungian layers. Each layer has a distinct purpose and
activation condition.

| Layer | Purpose | Stored as |
|---|---|---|
| `self` | Deep identity — worldview, soul, purpose. The unchanging core. | `identity` rows with `layer='self'` |
| `ego` | Operational identity — tone, behavior, postures, constraints. | `identity` rows with `layer='ego'` |
| `user` | User profile — name, background, context. | `identity` rows with `layer='user'` |
| `organization` | Organization identity, if applicable. | `identity` rows with `layer='organization'` |
| `persona` | Specialized domain lenses. Not separate agents — depth added by the ego. | `identity` rows with `layer='persona'` |
| `shadow` | Structural tensions and blind spots. Cultivated from memory patterns. | `identity` rows with `layer='shadow'` |
| `journey` | Journey identity — what it is, its current stage, why it matters. | `identity` rows with `layer='journey'` |
| `journey_path` | Living status document for a journey. Updated as things evolve. | `identity` rows with `layer='journey_path'` |

Journeys may name another journey through `metadata.parent_journey`, forming an
arbitrary-depth organizational tree. This relationship changes presentation and
lineage only: context, documents, memories, conversations, tasks, status,
routing, Builder state, and search remain scoped to the exact journey id.
`project_path` is independent of tree position; moving a journey never moves or
infers filesystem content. Parent assignment rejects cycles, and removing a
journey is allowed only for an empty leaf with no associated records.

Canonical desktop administration uses `mirror.journey-mutation@1.0`. The
Mirror-owned Journey administration service validates create, move, sibling order, project-path and empty-leaf deletion
operations against an exact registry `sourceVersion`.
The focused storage boundary acquires an immediate SQLite transaction, rejects
stale authority, commits Journey rows and a sanitized idempotency receipt once,
and provides native read-back for the `0.2.0` registry projection. Deletion
re-checks child Journeys and every database-backed Journey association inside
the same immediate transaction; any protected record blocks the operation and
nothing cascades. CLI is only a JSON transport; desktop harnesses never mutate Journey SQL directly. Registry
publication remains post-commit: a failed consumer export keeps its prior local
projection and retries the same receipt without compensating over newer Mirror
state. These operations invoke no model, conversation or dedicated-thread
lifecycle.

**User-home YAML → database flow:**

1. `memory init your-name` copies templates into `~/.mirror-minds/your-name/identity/`
   and substitutes the user's name.
2. `memory seed` reads those YAML files and writes rows into the `identity` table.
3. At runtime, the mirror reads exclusively from the database — never from YAML
   files directly.
4. Editing identity after the first seed: use `uv run python -m memory identity
   edit <layer> <key>` or the equivalent skill. Do not edit YAMLs and re-seed
   unless you intend to reset.

**Live persona list:** `uv run python -m memory list personas --verbose`  
(The database is the source of truth; there is no authoritative static table.)

---

### Explicit conversation append boundary

External callers that already hold one complete conversation ID may append a
bounded user/assistant batch through `memory conversations append`. Contract
validation and canonicalization occur before storage; one message-store-owned
`BEGIN IMMEDIATE` transaction then verifies the exact conversation and Journey,
classifies globally unique message IDs, rejects all conflicts, inserts missing
rows, and commits once. Caller IDs provide idempotency, canonical message
metadata preserves provenance, and reads use `ORDER BY created_at, id`.

This boundary is deliberately separate from runtime logging. It does not read or
write `runtime_sessions`, infer an active conversation, reuse
`conversation-logger`, change `ended_at`, or trigger extraction, titles,
summaries, tags, embeddings, or semantic-memory refresh. A late append therefore
extends transcript authority only; previously derived intelligence remains
unchanged.

## 5. Memory Model

Memories are extracted from conversations automatically at session end, when a
journey is set and the conversation has at least four messages (the quality
guard, D7 in the briefing).

**Extraction pipeline:**

1. Conversation ends → `end_conversation(extract=True)` fires
2. Two-pass extraction: LLM generates candidates → curation pass deduplicates
   against existing memories
3. Embeddings generated for each memory
4. Memories stored in the `memories` table with layer, type, journey, and embedding

**Memory layers:**

| Layer | What it holds |
|---|---|
| `self` | Deep realizations about identity, purpose, values |
| `ego` | Operational decisions, strategy, day-to-day knowledge |
| `shadow` | Tensions, avoided themes, recurring blind spots |
| `persona` | Domain-specific operational knowledge |
| `journey` | Journey-specific insights and decisions |
| `journey_path` | Journey status updates |

**Memory types:** `decision`, `insight`, `idea`, `journal`, `tension`,
`learning`, `pattern`, `commitment`, `reflection`

**Hybrid search scoring:**

```
score = 0.50 * semantic_similarity   (cosine, text-embedding-3-small)
      + 0.15 * recency
      + 0.15 * lexical               (FTS5 BM25)
      + 0.10 * reinforcement         (use_count + retrieval decay)
      + 0.10 * manual_relevance
```

MMR deduplication is applied to the final ranked list to suppress near-identical
results.

---

## 6. Runtime Model

Four harnesses connect to Mirror Core through different adapter patterns.

| Harness | Parity | Adapter pattern | Session ID source |
|---|---|---|---|
| Pi | L4 | TypeScript extension (`mirror-logger.ts`) calls Python CLI | Session file path |
| Gemini CLI | L4 | Shell hooks in `.gemini/hooks/` | `$GEMINI_SESSION_ID` env var |
| Codex | L3 | Wrapper script (`scripts/codex-mirror.sh`) + JSONL backfill | Session UUID in JSONL filename |
| Claude Code | L4 | Shell hooks in `.claude/hooks/` | Hook stdin payload |

**L4 (full parity):** session start, per-turn user logging, per-turn assistant
logging, mirror mode context injection, session end with extraction.

**L3 (wrapper parity):** session start via wrapper, JSONL backfill at session
end, no per-turn hooks.

Skills (`SKILL.md` files) are the primary way users invoke Mirror Mind
capabilities. Pi and Gemini CLI/Codex share the same skill files via symlinks:
`.pi/skills/` is the source; `.agents/skills/` symlinks to it.

For the full runtime lifecycle contract, including hook payload shapes and
injection models, see:
[docs/product/specs/runtime-interface/index.md](specs/runtime-interface/index.md)

---

## 7. Database Schema

**Default location:** `~/.mirror-minds/<user>/memory.db`

Set via `MIRROR_USER=<user>` (resolves to `~/.mirror-minds/<user>`) or
`MIRROR_HOME=~/.mirror-minds/<user>`. Override with `DB_PATH` when needed.

**Legacy path compatibility.** The default container was renamed from
`~/.mirror` to `~/.mirror-minds` in 2026-05. Installs that still keep data
at `~/.mirror/<user>` are resolved automatically when `MIRROR_USER` is used
and the new path does not exist; a one-time warning is emitted per process.
This is permanent supported behavior. See
[Decisions — Default mirror home directory renamed](../project/decisions.md).

### Main Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `conversations` | Conversation sessions | `id`, `title`, `persona`, `journey`, `started_at`, `ended_at` |
| `messages` | Conversation messages | `id`, `conversation_id`, `role`, `content`, `created_at` |
| `memories` | Extracted or manual memories | `id`, `memory_type`, `layer`, `title`, `content`, `journey`, `embedding` |
| `identity` | Identity, personas, journeys, journey paths | `id`, `layer`, `key`, `content`, `version` |
| `attachments` | Journey knowledge base | `id`, `journey_id`, `name`, `content`, `embedding` |
| `tasks` | Tasks linked to journeys | `id`, `journey`, `title`, `status`, `due_date`, `scheduled_at`, `source` |
| `memory_access_log` | Reinforcement access log | `memory_id`, `accessed_at` |
| `conversation_embeddings` | Conversation summary embeddings | `conversation_id`, `summary_embedding` |
| `runtime_sessions` | Runtime session ↔ conversation registry | `session_id`, `conversation_id`, `interface`, `mirror_active`, `persona`, `journey`, `hook_injected`, `active`, `started_at`, `updated_at`, `closed_at` |
| `exploratory_stories` | Durable Explorer Mode stories | `id`, `journey`, `title`, `status`, `current_story`, `narrative_summary`, `attractors_json`, `experiment_proposal_json`, `builder_handoff_json`, `source_conversations_json` |
| `identity_integrations` | Atomic Soul Mode identity integration records; additive identity updates with provenance | `id`, `layer`, `key`, `content`, `source`, `origin`, `conversation_id`, `journal_id`, `status`, `created_at` |
| `operation_runs` | Asynchronous Mirror Web Console operation runs | `id`, `operation_id`, `status`, `outcome`, `parameters_json`, `summary_json`, `result_json`, `started_at`, `completed_at`, `created_at` |
| `operation_run_events` | Event timeline for a web operation run | `id`, `run_id`, `sequence`, `kind`, `message`, `details_json`, `created_at` |
| `consolidations` | Memory consolidation proposals and decisions | `id`, `action`, `source_memory_ids`, `proposal`, `status`, `applied_content`, `created_at` |
| `identity_descriptors` | Routing-optimized descriptors for personas and journeys | `layer`, `key`, `descriptor`, `generated_at` |
| `llm_calls` | LLM call log for observability (metadata by default; bodies only in `full` mode) | `id`, `role`, `model`, `prompt`, `response`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `latency_ms`, `called_at` |

---

## 8. Runtime Session Model

The authoritative mapping between a runtime `session_id` and a `conversation_id`
lives in the `runtime_sessions` table (introduced in CV5 — Multisession Safety).

Mirror Mode state — `mirror_active`, `persona`, `journey`, `hook_injected` — is
stored per session row. Two simultaneous sessions under the same mirror home hold
independent state.

**Operational consequences:**

- **Concurrent sessions are safe.** One mirror home can host multiple runtime
  sessions at once. Session creation, stale-orphan cleanup, and mirror state
  updates are all routed by explicit `session_id`.
- **Hooks must pass `--session-id`.** Runtimes extract the session ID from the
  hook payload or environment. CLIs that change mirror state warn on stderr if
  `--session-id` is missing rather than silently no-op'ing.
- **No singleton files.** `current_session`, `mirror_state.json`, and
  `session_map.json` are gone. Their responsibilities moved into
  `runtime_sessions`. The only per-home flag file that remains is `mute`.

---

**See also:** [Briefing](../project/briefing.md) · [Python API](api.md) ·
[Runtime Interface Spec](specs/runtime-interface/index.md) ·
[Engineering Principles](../process/engineering-principles.md)
