# Mirror Mind — Command Reference

Command reference, configuration, and legacy migration workflow.

- **Commands:** this document
- **System architecture, schema, and runtime model:** [docs/product/architecture.md](docs/product/architecture.md)
- **Python API:** [docs/product/api.md](docs/product/api.md)
- **Extensions:** [docs/product/extensions/](docs/product/extensions/index.md)

---

## Commands

Claude Code uses the `/mm:` prefix. Pi and Gemini CLI use the `/mm-` prefix.
Codex uses the `$mm-` prefix. All runtimes call the same Python core.

| Pi / Gemini CLI | Codex | Claude Code | Purpose | Main Arguments |
|---------|-------|-------------|---------|----------------|
| `/mm-mirror` | `$mm-mirror` | `/mm:mirror` | Loads identity, persona, journey, and attachments for Mirror Mode | `load [--persona P] [--journey J] [--query Q] [--org]`, `log "summary"`, `journeys` |
| `/mm-build` | `$mm-build` | `/mm:build` | Builder Mode for a journey — loads context and project docs | `<slug>` |
| `/mm-explore` | `$mm-explore` | `/mm:explore` | Explorer Mode for a journey, with explicit deactivation, in-session story surfaces, and Builder handoff artifacts — preserves uncertainty before construction | `<slug>`, `deactivate`, `story show|update|clear|open|thicken|snapshot|attractors|experiment|handoff|promote` |
| `/mm-soul` | `$mm-soul` | `/mm:soul` | Soul Mode ritual entry and possible-listenings surface for inner-life listening | `[slug]` |
| `python -m memory mode` | — | — | Internal explicit Mirror operating mode lifecycle used by runtime skills and status bars | `activate <mode> [--journey J]`, `deactivate`, `status` |
| `/mm-identity` | `$mm-identity` | `/mm:identity` | Read and update identity directly in the database | `list [--layer L]`, `get <layer> <key>`, `set <layer> <key>`, `edit <layer> <key>` |
| `/mm-consult` | `$mm-consult` | `/mm:consult` | Asks other LLMs through OpenRouter with Mirror context | `<family> [tier] "prompt"`, `credits` |
| `/mm-journeys` | `$mm-journeys` | `/mm:journeys` | Lists journeys with status | no arguments |
| `/mm-journey` | `$mm-journey` | `/mm:journey` | Shows detailed journey identity, journey path, memories, and conversations | `[journey]`, `update <journey> <content>` |
| `/mm-memories` | `$mm-memories` | `/mm:memories` | Lists or searches memories by type, layer, and journey | `--type T`, `--layer L`, `--journey J`, `--search "Q"`, `--limit N` |
| `/mm-tasks` | `$mm-tasks` | `/mm:tasks` | Manages tasks by journey | `list`, `add "title"`, `done <id>`, `doing <id>`, `block <id>`, `delete <id>`, `import`, `sync` |
| `/mm-week` | `$mm-week` | `/mm:week` | Weekly planning | `view`, `plan "text"`, `save` |
| `/mm-journal` | `$mm-journal` | `/mm:journal` | Records a personal journal entry | `[--journey J] "text"` |
| `/mm-recall` | `$mm-recall` | `/mm:recall` | Loads a previous conversation into context | `<conversation_id> [--limit N]` |
| `/mm-conversations` | `$mm-conversations` | `/mm:conversations` | Lists recent conversations | `--limit N`, `--journey J`, `--persona P` |
| `/mm-backup` | `$mm-backup` | `/mm:backup` | Backs up the memory database | no arguments |
| `/mm-seed` | `$mm-seed` | `/mm:seed` | Seeds identity files from the active user home into the database | no arguments |
| `/mm-mute` | `$mm-mute` | `/mm:mute` | Toggles conversation logging | no arguments |
| `/mm-new` | `$mm-new` | `/mm:new` | Starts a new conversation | no arguments |
| `/mm-discard` | `$mm-discard` | `/mm:discard` | Discards the current runtime conversation from the database before quitting | no arguments |
| `/mm-consolidate` | `$mm-consolidate` | `/mm:consolidate` | Scan memories for patterns and propose consolidation | `scan`, `apply <id>`, `reject <id>`, `list` |
| `/mm-shadow` | `$mm-shadow` | `/mm:shadow` | Surface and promote shadow-layer observations | `scan`, `apply`, `reject`, `list`, `show` |
| `/mm-welcome` | `$mm-welcome` | `/mm:welcome` | Renders the state-aware welcome card on demand | no arguments |
| `/mm-release-notes` | `$mm-release-notes` | `/mm:release-notes` | Shows Mirror Mind release notes | `[latest|vX.Y.Z]`, `pending` |
| `/mm-update` | `$mm-update` | `/mm:update` | Updates the local Mirror runtime through the safe updater | no arguments |
| `/mm-help` | `$mm-help` | `/mm:help` | Lists available commands | no arguments |
| `python -m memory runtime` | — | — | Inspects Mirror runtime status, version, drift, backups, release notes, release promotion readiness, plans updates, and executes safe updates | `status [--mirror-home PATH] [--channel stable|main]`, `version [--start PATH] [--channel stable|main]`, `diagnose [--mirror-home PATH]`, `backup [--mirror-home PATH]`, `backup --verify PATH`, `release-notes [latest|vX.Y.Z]`, `release-notes pending [--from vX.Y.Z] [--ref REF] [--no-fetch]`, `release-doctor --target vX.Y.Z [--stable REF]`, `release-promote --target vX.Y.Z [--stable BRANCH] [--remote REMOTE] [--dry-run] [--push]`, `update --dry-run [--mirror-home PATH] [--channel stable|main]`, `update --check [--channel stable|main]`, `update [--no-fetch] [--skip-migrations] [--mirror-home PATH] [--channel stable|main]`, `update --repair-updater [--no-fetch] [--mirror-home PATH] [--channel stable|main]` |
| `python -m memory conversation-logger` | — | — | Runtime conversation logging and repair utilities | `discard-current [--interface pi] [--session-id ID]`, `repair-journeys [--limit N] [--apply]` |
| `python -m memory web` | — | — | Runs the local Mirror Web Console — Identity and Workspace perspectives, conversation intelligence, bulk conversation maintenance (assign/delete), and allowlisted operation runs | `[--host 127.0.0.1] [--port 8765]` |
| `ext-review-copy` | — | `ext:review-copy` | External multi-LLM copy review skill; install and expose it before use | skill-driven workflow |

## Operating Mode Lifecycle

```bash
uv run python -m memory mode [--session-id ID] activate "Builder Mode" --journey <slug>
uv run python -m memory mode [--session-id ID] status
uv run python -m memory mode [--session-id ID] deactivate
```

Operating mode lifecycle is a small runtime state surface used by Mirror skills
and status bars. It records the currently active operating lens, such as Builder
Mode or Explorer Mode, plus the active journey when present. When a runtime
session id is available, operating mode is session-scoped so simultaneous Pi
sessions do not overwrite each other's footer state. CLI-only calls retain a
global fallback. Mode activation and deactivation are semantic operations.
Rendering the Pi status line and clearing stale UI are internal effects of that
lifecycle.

The user-facing mode skills are `/mm-mirror`, `/mm-build`, `/mm-explore`, and
`/mm-soul`. The internal lifecycle command exists so Mirror can activate and
leave explicit lenses through contained operations. Users are never in "no
mode": when an explicit lens is deactivated, Mirror returns to Mirror Mode,
preserving journey context when one remains active.

`memory mirror load` activates `◌ Mirror Mode`. `memory build load <slug>`
activates `■ Builder Mode` for the selected journey. `memory soul load [slug]`
activates `☾ Soul Mode` and renders the ritual entry surface without opening a
rite or writing to the journal. `memory soul listen` renders situated Possible
Listenings; `memory soul rite self|shadow` renders listening-lens surfaces;
`memory soul fruit set|show|clear` manages one Fruit In Maturation; `memory soul
harvest set|show|save|decline` closes and optionally saves one harvested fruit;
and `memory soul prompt self` composes Self Voice with the user's `self/soul`
identity layer. `memory explore load <slug>` activates `△ Explorer Mode` for the selected journey and resumes the active
durable Exploratory Story when one exists. `memory explore story show|update|clear
<slug>` manages the current Exploratory Story; `clear` archives the active story
so it is no longer current but remains historical evidence. `memory explore story
list|archive <slug>` shows durable Explorer Story visibility and archives the
active story explicitly. `memory explore story open|thicken|snapshot <slug>`
renders the first visible Explorer story surfaces while persisting durable state.
`memory explore story attractors|experiment <slug>` records visible attractors and
small experiment proposals inside the current durable story state without
activating Builder. `memory explore story handoff <slug>` writes the Builder
transfer document set under `docs/project/explorations/<exploratory-story-slug>/`
when the journey has a project path, including `index.md`,
`exploratory-story.md`, `handoff-info.md`, and `product-design-proposal.md`. It can
attach reviewed source conversations with `--source-conversation <id>` or
`--source-conversation <id>:<role>`, and can write a privacy-obfuscated
`full-conversation.md` only when `--include-full-conversation` is passed.
`memory explore story promote <slug>` marks the durable story promoted and enters
Builder only after an explicit handoff exists. Required Explorer story surfaces
are wrapped with `[[MIRROR_REQUIRED_SURFACE_BEGIN:<surface-id>]]` and
`[[MIRROR_REQUIRED_SURFACE_END:<surface-id>]]` markers so runtimes can distinguish
product surfaces from ordinary command output; the marker lines are not
user-facing copy. `memory explore deactivate` is the Explorer-specific exit
operation and returns the runtime to Mirror Mode semantics
while preserving sticky journey context. Deactivation clears only the explicit
active mode state; it does not erase sticky persona/journey defaults or rewrite
conversation history.

`memory welcome --status-line [--session-id ID]` includes active mode context when present:

```text
◇ alisson-vale · Explorer Mode on ■ Builder Mode · ✓
```

When Builder Mode is deactivated while journey context remains active, the
status line returns to Mirror Mode:

```text
◇ alisson-vale · Explorer Mode on ◌ Mirror Mode · ✓
```

When no journey context is active it still shows the default mode:

```text
◇ alisson-vale · ◌ Mirror Mode · ✓
```

## Runtime Self-Update

The `runtime` subcommands operate in three layers: inspection (read-only), backup (preparatory), and update (planning and execution). They were designed to be composed in this order before any code or database mutation happens. See [Runtime Repair Policy](docs/process/runtime-repair-policy.md) for the rules that govern safe repairs.

### Recommended flow

```bash
# 1. Confirm the runtime is healthy
uv run python -m memory runtime status

# 2. Classify any drift the status surfaces
uv run python -m memory runtime diagnose

# 3. Check whether a new version is available
uv run python -m memory runtime update --check

# 4. Plan the update locally
uv run python -m memory runtime update --dry-run

# 5. Execute the update through the safe pipeline
uv run python -m memory runtime update
```

Each command exits non-zero when state is not safe enough for the next step.

### Inspection

#### `runtime status`

```bash
uv run python -m memory runtime status [--mirror-home PATH] [--channel stable|main]
```

Reports version, repository, git state, mirror home, database, core migration health, installed extensions, extension health, clone role, Python version, and environment. Exits `attention needed` when the git tree is dirty, the mirror home is not configured, core migrations are missing or unknown, or installed extension migrations are pending, drifted, or unknown.

#### `runtime version`

```bash
uv run python -m memory runtime version [--start PATH] [--channel stable|main]
```

Reports the installed version, repository, branch, commit, clone role, and update channel. Local and offline. `--start` inspects a repository from a chosen path instead of the current working directory.

#### `runtime diagnose`

```bash
uv run python -m memory runtime diagnose [--mirror-home PATH]
```

Classifies attention-needed drift into stable finding codes (`git_dirty`, `core_migration_pending`, `core_migration_unknown`, `extension_migration_pending`, `extension_migration_unknown`, `extension_migration_checksum_drift`, `extension_manifest_invalid`, `database_missing`, `mirror_home_missing`). Each finding carries severity, subject, recommendation, and a repair route. Read-only.

### Backup

```bash
uv run python -m memory runtime backup [--mirror-home PATH]
uv run python -m memory runtime backup --verify PATH_TO_BACKUP.zip
```

Runtime backup archives contain `memory.db` and SQLite sidecars (`memory.db-wal`, `memory.db-shm`) when present. Verification is structural: the zip must be readable, contain `memory.db`, and avoid unsafe archive paths. Recovery is manual in this version: stop active runtime sessions, move current database files aside, extract the backup into the Mirror home, and rerun `runtime status`.

### Update planning

#### `runtime update --check`

```bash
uv run python -m memory runtime update --check [--channel stable|main]
```

Queries the configured upstream branch through `git ls-remote`. May contact the network, but does not fetch, pull, change refs, back up, migrate, or modify files. Reports `up_to_date`, `update_available`, `local_ahead`, `diverged`, `no_upstream`, or `unknown`.

On the `stable` channel, this check remains intentionally conservative: it can know a remote commit is available, but it does not fetch release-note files. When release details are not already available from local refs, the output says so and points to the preview and update commands.

#### `runtime update --dry-run`

```bash
uv run python -m memory runtime update --dry-run [--channel stable|main]
```

Plans an update from local refs only. Reuses `runtime status` as the safety gate. Reports whether a real update would be a no-op, pull known remote commits, or require manual reconciliation because the branch is ahead, diverged, dirty, or missing an upstream. Does not contact the network.

When the channel is `stable` and the local upstream ref contains release notes newer than the installed version, the dry-run shows a release-aware notice with version, title, digest, and the concrete preview/update commands. If release notes are unavailable locally, the dry-run falls back to commit-oriented wording.

### Release notes

```bash
uv run python -m memory runtime release-notes [latest|vX.Y.Z]
uv run python -m memory runtime release-notes pending [--from vX.Y.Z] [--ref origin/stable]
```

Reads narrative release notes from `docs/releases/`. `latest` and explicit versions read the checked-out files. `pending` reads release notes from a git ref, defaults to `origin/stable`, fetches that ref safely before rendering, and lists every release newer than the installed runtime version. The fetch updates only remote-tracking refs; it does not merge, checkout, migrate, or modify the working tree. Use `--from` to simulate an older installed version or support a user report without mutating package metadata. Use `--ref HEAD --no-fetch` for local smoke tests before a release is published, or `--ref origin/stable` for the user-facing stable channel.

Examples:

```bash
uv run python -m memory runtime release-notes latest
uv run python -m memory runtime release-notes v0.10.5
uv run python -m memory runtime release-notes pending
uv run python -m memory runtime release-notes pending --from 0.9.0 --ref origin/stable
uv run python -m memory runtime release-notes pending --from 0.9.0 --ref HEAD --no-fetch
```

### Release promotion doctor

```bash
uv run python -m memory runtime release-doctor --target vX.Y.Z [--stable origin/stable]
```

Runs a read-only preflight before stable promotion. The doctor checks repository availability, clean git state, package version, release-note file and heading, release index link, release tag state, and stable ref relationship. It prints `pass`, `warn`, and `fail` checks. Warnings keep the command exit code at zero because a pre-promotion state may legitimately lack a tag or stable fast-forward; failures exit non-zero. The command does not fetch, tag, merge, push, edit files, back up, migrate, or modify refs.

### Stable release promotion

```bash
uv run python -m memory runtime release-promote --target vX.Y.Z --dry-run
uv run python -m memory runtime release-promote --target vX.Y.Z
uv run python -m memory runtime release-promote --target vX.Y.Z --push
```

Promotes a release to the stable channel through a controlled path. The command runs the release doctor first and blocks on failures. Dry-run prints planned stages without creating tags, moving branches, or pushing. Local promotion creates the missing target tag at `HEAD` or reuses an existing tag already at `HEAD`, then creates or fast-forwards the local `stable` branch to `HEAD`. Remote publication happens only with `--push`, which pushes the tag and stable branch to `origin`. The command does not fetch, force-push, rewrite existing tags, bump versions, write release notes, create GitHub Releases, back up, migrate, or update production clones.

After `release-promote --push` succeeds and CI is green, publish the matching GitHub Release on the same tag:

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z — Release Title" \
  --notes-file /tmp/mirror-release-notes.md \
  --latest
```

Use `gh release edit vX.Y.Z ... --latest` if the GitHub Release already exists. The notes body should come from `docs/releases/vX.Y.Z.md` with the YAML frontmatter removed.

### Update execution

```bash
uv run python -m memory runtime update [--no-fetch] [--skip-migrations] [--mirror-home PATH] [--channel stable|main]
uv run python -m memory runtime update --repair-updater [--no-fetch] [--mirror-home PATH] [--channel stable|main]
```

Executes the safe update pipeline. Stages run in order and the first failure stops execution:

1. **status gate** — normally requires `runtime status` to be ready. If status reports the database as unavailable, the updater first attempts a safe `MemoryClient` bootstrap, rebuilds status, and continues if the runtime becomes ready. If the only remaining blocker is core migration drift that may be resolved by the target version, such as pending or unknown core migration ids, the updater may proceed through the backup-gated update path and still requires post-update status to be ready.
2. **fetch upstream** — mutates only remote-tracking refs. Skipped with `--no-fetch`.
3. **plan** — accepts `none` (already up to date) and `pull`. Blocks `ahead`, `diverged`, and other unsafe states.
4. **backup database** — reuses the runtime backup pipeline.
5. **verify backup** — structural verification of the archive.
6. **fast-forward** — `git merge --ff-only` against the upstream. Refuses merges and rebases.
7. **migrations** — opens `MemoryClient` once to trigger migration application. Skipped with `--skip-migrations`.
8. **post-update status** — reruns `runtime status` and expects `ready`. If the database is temporarily unavailable, the same safe bootstrap/retry path runs before reporting failure.

Failures print a recovery block with the backup path and previous commit when relevant. Successful installs that move to a new commit include an `Installed changes` summary generated from `git log <previous>..<new>`. On the `stable` channel, successful installs also include an `Installed release` block when the new checkout contains narrative release notes. The pipeline does not roll back automatically: recovery is documented manual work.

If the full status gate crashes before update planning, `runtime update` automatically falls back to updater self-repair. The repair lane uses a minimal safety gate: clean git tree, configured upstream, optional fetch, optional database backup when the Mirror home and database are available, fast-forward only code update, and migrations skipped. It then asks the user to rerun `runtime update` with the repaired updater. The same lane can be invoked explicitly with `runtime update --repair-updater`. Older production clones whose updater is blocked before they receive the latest recovery behavior may need this explicit repair lane once.

### Builder Workbench composition

Ariad-adopted Builder journeys can compose Refinement Work without pulling it into active lifecycle execution:

```bash
uv run python -m memory build refinement-story create --journey <slug> --title "<title>" [--description "<description>"]
uv run python -m memory build change-request capture --journey <slug> --title "<title>" --body "<body>" [--refinement-story-id <rs-id>]
uv run python -m memory build change-request attach --journey <slug> --change-request-id <cr-id> --refinement-story-id <rs-id>
uv run python -m memory build refinement-story overview --journey <slug> --refinement-story-id <rs-id>
uv run python -m memory build refinement-story pull --journey <slug> --refinement-story-id <rs-id>
uv run python -m memory build change-request select --journey <slug> --change-request-id <cr-id>
uv run python -m memory build change-request confirm --journey <slug> --change-request-id <cr-id>
uv run python -m memory build change-request plan --journey <slug> --change-request-id <cr-id> --summary "<plan>"
uv run python -m memory build change-request mark-implemented --journey <slug> --change-request-id <cr-id> --evidence "<evidence>"
uv run python -m memory build change-request validate --journey <slug> --change-request-id <cr-id> --evidence "<evidence>"
uv run python -m memory build change-request done --journey <slug> --change-request-id <cr-id> --notes "<done note>"
uv run python -m memory build refinement-story review --journey <slug> --refinement-story-id <rs-id> --summary "<review>"
uv run python -m memory build refinement-story coherence --journey <slug> --refinement-story-id <rs-id> --summary "<coherence>"
uv run python -m memory build refinement-story close --journey <slug> --refinement-story-id <rs-id> --summary "<close summary>"
```

These commands render Ariad Workbench surfaces such as `CHANGE_REQUEST_CAPTURED`, `REFINEMENT_STORY_OVERVIEW`, `REFINEMENT_STORY_PULLED`, and `REFINEMENT_FLOW_EVENT`. Composition commands capture or organize Refinement Stories and Change Requests only. Pulling an RS selects active Refinement Work only. CR/RS flow commands update runtime state and evidence only; they do not mutate Delivery cursor state, implement files, commit, push, or release. Review and Coherence do not mutate files directly.

### Clone role

Each Mirror Mind clone declares its role through a `.mirror-clone-role` file at the repository root. Valid values are `production` and `dev`. The file is local to each clone and ignored by git. When the file is missing, unreadable, or contains an unknown value, the role defaults to `production`.

- `runtime status` and `runtime version` report the current clone role.
- `python -m memory build load <slug>` applies the clone-role guard only when the journey `project_path` points at a Mirror Mind source checkout. In that case it refuses `production` clones unless `--ignore-production-role` is passed. Non-Mirror journey projects are not blocked by missing `.mirror-clone-role`. When no `project_path` is configured, Builder falls back to inspecting the current directory.
- Production clones receive code through `runtime update`, not by direct development edits.

See [Runtime Repair Policy](docs/process/runtime-repair-policy.md) and [Decisions](docs/project/decisions.md#mirror-mind-clones-declare-a-role) for the boundary and rationale.

### Update channel

Each clone declares its update channel through `.mirror-update-channel`. Valid values are `stable` and `main`; missing, unreadable, or unknown values default to `stable`.

- `stable` is the user-facing release channel.
- `main` is the integration/dogfooding channel.
- A push to `main` is not a release.
- `stable` advances only through release promotion after versioning, release notes, CI, smoke validation, tagging, fast-forward, and GitHub Release publication.

Change a clone to stable releases:

```bash
printf 'stable\n' > .mirror-update-channel
uv run python -m memory runtime version
uv run python -m memory runtime update --check
```

Change a clone to dogfooding/main:

```bash
printf 'main\n' > .mirror-update-channel
uv run python -m memory runtime version
uv run python -m memory runtime update --check
```

Remove the marker to return to the safe default (`stable`):

```bash
rm .mirror-update-channel
```

The local git branch and the update channel are related but not identical. A checkout may report `Git branch: main` and `Update channel: stable`. In that state, `runtime update` still compares and fast-forwards against `origin/stable`; the channel controls the update target even if the local branch name remains `main`.

For common channel problems, see [Troubleshooting](docs/process/troubleshooting.md#runtime-update-channel-stable-is-not-fetched-or-unavailable).

To list the active personas for the current user:

```bash
uv run python -m memory list personas --verbose
```

The database is the source of truth for personas. There is no authoritative
static table; `list personas --verbose` reflects the current seeded state.

---

## Configuration

`.env` is loaded automatically by `memory.config` at import time; values
already present in the real environment take precedence.

Two starter files live at the repo root:

- `.env.example` — minimal template (identity + API keys)
- `.env.example.advanced` — canonical reference with every variable documented

### Identity (CV4 user home)

| Variable | Default | Role |
|----------|---------|------|
| `MIRROR_HOME` | (unset) | Explicit path to the user's mirror home. Takes precedence over `MIRROR_USER`. |
| `MIRROR_USER` | (unset) | Short user name; resolves to `~/.mirror-minds/<user>`. |

In production, one of the two must be set. Setting both is only valid when
they agree (`MIRROR_HOME` ends with the same user name).

**Legacy path compatibility.** The default container was renamed from
`~/.mirror` to `~/.mirror-minds` in 2026-05. When `MIRROR_USER` resolution
is used and `~/.mirror-minds/<user>` does not exist but `~/.mirror/<user>`
does, the legacy path is resolved and a one-time warning is emitted. This
is permanent supported behavior. To stop the warning, run
`mv ~/.mirror ~/.mirror-minds` once.

### API Keys

| Variable | Role |
|----------|------|
| `OPENROUTER_API_KEY` | Embeddings (`openai/text-embedding-3-small` via OpenRouter), extraction (Gemini Flash), and the multi-LLM `consult` command. |

### Environment Selection

| Variable | Default | Role |
|----------|---------|------|
| `MEMORY_ENV` | `production` | One of `production`, `development`, `test`. Controls DB file name and gates `MemoryClient.reset`. |

### Path Overrides

All of these derive from `MIRROR_HOME` in production. Set them only to
override the default layout.

| Variable | Default | Role |
|----------|---------|------|
| `MEMORY_DIR` | `MIRROR_HOME` (prod) or `~/.mirror-minds` | Runtime working dir for `mute` and `.bootstrap.lock`. |
| `MEMORY_PROD_DIR` | `MEMORY_DIR` | Production-only override. |
| `DB_PATH` | `<MIRROR_HOME>/memory.db` | Full SQLite path. |
| `DB_BACKUP_PATH` | `<DB_PATH parent>/backups` | Legacy alias for `BACKUP_DIR`. |
| `BACKUP_DIR` | `<MIRROR_HOME>/backups` | `memory backup` output. |
| `EXPORT_DIR` | `<MIRROR_HOME>/exports` | Markdown export root. |
| `TRANSCRIPT_EXPORT_DIR` | `<EXPORT_DIR>/transcripts` | Full-transcript export dir. |

### Runtime Integrations

| Variable | Default | Role |
|----------|---------|------|
| `PI_SESSIONS_DIR` | `~/.pi/agent/sessions` | Source directory for `backfill_pi_sessions`. Override for multi-user setups. |
| `MIRROR_SESSION_ID` | (unset) | Fallback session id for conversation-logger CLIs when neither `--session-id` nor a hook payload is present. Rarely set by humans. |
| `MIRROR_WELCOME` | (unset) | Set to `off`, `0`, `false`, or `no` to suppress the welcome card emitted by `python -m memory welcome`. See `docs/product/specs/welcome/index.md`. |

### Set by External Runtimes (do not set manually)

- `CLAUDE_PROJECT_DIR` — injected by Claude Code when it invokes hooks.
- Claude Code hook payloads carry `session_id` on stdin.
- Pi's extension passes the session file path to the logger CLI.

---

## Legacy Migration Workflow

> **Note:** This workflow exists for users migrating from Portuguese-era
> databases (pre-CV0). Most early users have already completed this migration.
> This section is a removal candidate for a future CV.

Use this when you have a Portuguese-era source database such as `memoria.db`
and want to migrate it into a user home.

### Supported Source Policy

Supported:
- clean Portuguese legacy databases

Rejected explicitly:
- already-English/current databases
- mixed Portuguese/English databases
- unsupported or ambiguous SQLite shapes

### Commands

```bash
uv run python -m memory migrate-legacy validate \
  --source ~/.espelho/memoria.db \
  --target-home ~/.mirror-minds/<user> \
  --report /tmp/mirror-migration-validate.json

uv run python -m memory migrate-legacy run \
  --source ~/.espelho/memoria.db \
  --target-home ~/.mirror-minds/<user> \
  --report /tmp/mirror-migration-run.json
```

### Safety Guarantees

- explicit source required
- explicit target home required
- source is never mutated
- target `memory.db` must not already exist
- no silent merge into an existing target
- `validate` performs no writes
- `run` copies first, migrates the copy, and verifies the result

Both commands support `--report PATH`. The JSON report includes: generation
timestamp, command mode, source and target paths, source classification,
source row counts, applied migrations, detected legacy columns/indexes/identity
layers, planned translations, and post-migration verification details.

---

**See also:** [Getting Started](docs/getting-started.md) ·
[Architecture](docs/product/architecture.md) · [Python API](docs/product/api.md)
