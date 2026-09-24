# Mirror Mind — Command Reference

Command reference, configuration, and legacy migration workflow.

- **Commands:** this document
- **System architecture, schema, and runtime model:** [docs/product/architecture.md](docs/product/architecture.md)
- **Extensions:** [docs/product/extensions/](docs/product/extensions/index.md)

---

## Running a command

Every command in this document runs through the front door, the one entry into
Mirror Mind's core. It names itself `mirror` in its own usage lines, and this
document does the same:

```bash
mirror runtime status
```

There is no `mirror` on your `PATH` yet: the npm package that installs it is
[CV22.DS10.US3](docs/project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/index.md).
Until then `mirror` stands for this invocation, run from the repository root:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts runtime status
```

To make every command here runnable as written, define it once per shell:

```bash
alias mirror='NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts'
```

The skills use the full invocation, not the alias: an agent runs them in a
non-interactive shell, where an alias does not exist.

## Commands

Claude Code uses the `/mm:` prefix. Pi and Gemini CLI use the `/mm-` prefix.
Codex uses the `$mm-` prefix. All runtimes call the same core.

| Pi / Gemini CLI | Codex | Claude Code | Purpose | Main Arguments |
|---------|-------|-------------|---------|----------------|
| `/mm-mirror` | `$mm-mirror` | `/mm:mirror` | Loads identity, persona, journey, and attachments for Mirror Mode | `load [--persona P] [--journey J] [--query Q] [--org]`, `log "summary"`, `journeys` |
| `/mm-build` | `$mm-build` | `/mm:build` | Builder Mode for a journey — loads context and project docs | `<slug>` |
| `/mm-explore` | `$mm-explore` | `/mm:explore` | Explorer Mode for a journey, with explicit deactivation, in-session story surfaces, and Builder handoff artifacts — preserves uncertainty before construction | `<slug>`, `deactivate`, `story show|update|clear|open|thicken|snapshot|attractors|experiment|handoff|promote` |
| `/mm-soul` | `$mm-soul` | `/mm:soul` | Soul Mode ritual entry and possible-listenings surface for inner-life listening | `[slug]` |
| `mirror mode` | — | — | Internal explicit Mirror operating mode lifecycle used by runtime skills and status bars | `activate <mode> [--journey J]`, `deactivate`, `status` |
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
| `mirror conversations append` | — | — | Atomically appends an explicit bounded user/assistant batch to one exact conversation | `--mirror-home PATH --format json`, JSON stdin |
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
| `mirror runtime` | — | — | Inspects Mirror runtime status, version, drift, backups, release notes, release promotion readiness, plans updates, and executes safe updates | `status [--mirror-home PATH] [--channel stable|main]`, `version [--start PATH] [--channel stable|main]`, `diagnose [--mirror-home PATH]`, `backup [--mirror-home PATH]`, `backup --verify PATH`, `release-notes [latest|vX.Y.Z]`, `release-notes pending [--from vX.Y.Z] [--ref REF] [--no-fetch]`, `migrate [--mirror-home PATH]`, `update --dry-run [--mirror-home PATH] [--channel stable|main]`, `update --check [--channel stable|main]`, `update [--no-fetch] [--skip-migrations] [--mirror-home PATH] [--channel stable|main]`, `update --repair-updater [--no-fetch] [--mirror-home PATH] [--channel stable|main]` |
| `mirror conversation-logger` | — | — | Runtime conversation logging and repair utilities | `discard-current [--interface pi] [--session-id ID]`, `repair-journeys [--limit N] [--apply]` |
| `ext-review-copy` | — | `ext:review-copy` | External multi-LLM copy review skill; install and expose it before use | skill-driven workflow |

## Explicit Conversation Append

```bash
mirror conversations append \
  --mirror-home <home> --format json < payload.json
```

The request is a strict JSON object with `schemaVersion: "1.0.0"`, one complete
`conversationId`, its exact `journeyId`, a bounded ASCII `sourceInterface`, and
1–20 externally identified user/assistant messages. Each message supplies
`id`, `role`, non-empty `content`, timezone-aware RFC 3339 `createdAt`, and an
optional caller-owned metadata object. Message IDs match exactly
`[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. The CLI reads at most 262,145 bytes for a
262,144-byte payload limit; content is limited to 51,200 UTF-8 bytes per message
and the complete persisted metadata envelope to 4,096 UTF-8 bytes.

Mirror resolves only the complete conversation ID and checks exact Journey
equality. It does not inspect or mutate runtime sessions, infer an active
conversation, reopen an ended conversation, or run extraction and other semantic
refreshes. One storage-owned `BEGIN IMMEDIATE` transaction classifies all IDs,
rejects every conflict, inserts only missing rows, and commits once. Identical
retries return `existing`; divergent or cross-conversation ID reuse rejects the
whole batch.

Idempotency compares caller metadata by **JSON value, not by stored bytes**.
JSON has a single number type, so `1` and `1.0` are the same value and a retry
carrying either is `existing` rather than `idempotency_conflict`. Booleans are
never equal to numbers: `true` and `1` remain a conflict. A retry only
classifies; it never rewrites the metadata already stored. Any other difference
in role, content, timestamp, target conversation, or metadata value still
rejects the whole batch.

Success and expected failure are compact bounded JSON. Success receipts contain
only conversation/Journey identity, counts, and validated message IDs with
`inserted` or `existing` state. Failure reasons are
`malformed_request`, `unsupported_schema_version`, `limit_exceeded`,
`conversation_not_found`, `journey_mismatch`,
`duplicate_request_message_id`, `idempotency_conflict`, and
`persistence_failure`. Receipts never echo message content, caller metadata,
private paths, environment values, or raw exceptions.

## Operating Mode Lifecycle

```bash
mirror mode [--session-id ID] activate "Builder Mode" --journey <slug>
mirror mode [--session-id ID] status
mirror mode [--session-id ID] deactivate
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

`mirror mirror load` activates `◌ Mirror Mode`. `mirror build load <slug>`
activates `■ Builder Mode` for the selected journey. `mirror soul load [slug]`
activates `☾ Soul Mode` and renders the ritual entry surface without opening a
rite or writing to the journal. `mirror soul listen` renders situated Possible
Listenings; `mirror soul rite self|shadow` renders listening-lens surfaces;
`mirror soul fruit set|show|clear` manages one Fruit In Maturation; `mirror soul
harvest set|show|save|decline` closes and optionally saves one harvested fruit;
and `mirror soul prompt self` composes Self Voice with the user's `self/soul`
identity layer. `mirror explore load <slug>` activates `△ Explorer Mode` for the selected journey and resumes the active
durable Exploratory Story when one exists. `mirror explore story show|update|clear
<slug>` manages the current Exploratory Story; `clear` archives the active story
so it is no longer current but remains historical evidence. `mirror explore story
list|archive <slug>` shows durable Explorer Story visibility and archives the
active story explicitly. `mirror explore story open|thicken|snapshot <slug>`
renders the first visible Explorer story surfaces while persisting durable state.
`mirror explore story attractors|experiment <slug>` records visible attractors and
small experiment proposals inside the current durable story state without
activating Builder. `mirror explore story handoff <slug>` writes the Builder
transfer document set under `docs/project/explorations/<exploratory-story-slug>/`
when the journey has a project path, including `index.md`,
`exploratory-story.md`, `handoff-info.md`, and `product-design-proposal.md`. It can
attach reviewed source conversations with `--source-conversation <id>` or
`--source-conversation <id>:<role>`, and can write a privacy-obfuscated
`full-conversation.md` only when `--include-full-conversation` is passed.
`mirror explore story promote <slug>` marks the durable story promoted and enters
Builder only after an explicit handoff exists. Required Explorer story surfaces
are wrapped with `[[MIRROR_REQUIRED_SURFACE_BEGIN:<surface-id>]]` and
`[[MIRROR_REQUIRED_SURFACE_END:<surface-id>]]` markers so runtimes can distinguish
product surfaces from ordinary command output; the marker lines are not
user-facing copy. `mirror explore deactivate` is the Explorer-specific exit
operation and returns the runtime to Mirror Mode semantics
while preserving sticky journey context. Deactivation clears only the explicit
active mode state; it does not erase sticky persona/journey defaults or rewrite
conversation history.

`mirror welcome --status-line [--session-id ID]` includes active mode context when present:

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
mirror runtime status

# 2. Classify any drift the status surfaces
mirror runtime diagnose

# 3. Check whether a new version is available
mirror runtime update --check

# 4. Plan the update locally
mirror runtime update --dry-run

# 5. Execute the update through the safe pipeline
mirror runtime update
```

Each command exits non-zero when state is not safe enough for the next step.

### Inspection

#### `runtime status`

```bash
mirror runtime status [--mirror-home PATH] [--channel stable|main]
```

Reports version, repository, git state, mirror home, database, core migration health, installed extensions, extension health, clone role, update channel, Node version, and environment. Exits `attention needed` when the git tree is dirty, the mirror home is not configured, core migrations are missing or unknown, or installed extension migrations are pending, drifted, or unknown.

#### `runtime version`

```bash
mirror runtime version [--start PATH] [--channel stable|main]
```

Reports the installed version, repository, branch, commit, clone role, and update channel. Local and offline. `--start` inspects a repository from a chosen path instead of the current working directory.

#### `runtime diagnose`

```bash
mirror runtime diagnose [--mirror-home PATH]
```

Classifies attention-needed drift into stable finding codes (`git_dirty`, `core_migration_pending`, `core_migration_unknown`, `extension_migration_pending`, `extension_migration_unknown`, `extension_migration_checksum_drift`, `extension_manifest_invalid`, `database_missing`, `mirror_home_missing`). Each finding carries severity, subject, recommendation, and a repair route. Read-only.

### Backup

```bash
mirror runtime backup [--mirror-home PATH]
mirror runtime backup --verify PATH_TO_BACKUP.zip
```

Runtime backup archives contain `memory.db` and SQLite sidecars (`memory.db-wal`, `memory.db-shm`) when present. Verification is structural: the zip must be readable, contain `memory.db`, and avoid unsafe archive paths. Recovery is manual in this version: stop active runtime sessions, move current database files aside, extract the backup into the Mirror home, and rerun `runtime status`.

### Update planning

#### `runtime update --check`

```bash
mirror runtime update --check [--channel stable|main]
```

Queries the configured upstream branch through `git ls-remote`. May contact the network, but does not fetch, pull, change refs, back up, migrate, or modify files. Reports `up_to_date`, `update_available`, `local_ahead`, `diverged`, `no_upstream`, or `unknown`.

On the `stable` channel, this check remains intentionally conservative: it can know a remote commit is available, but it does not fetch release-note files. When release details are not already available from local refs, the output says so and points to the preview and update commands.

#### `runtime update --dry-run`

```bash
mirror runtime update --dry-run [--channel stable|main]
```

Plans an update from local refs only. Reuses `runtime status` as the safety gate. Reports whether a real update would be a no-op, pull known remote commits, or require manual reconciliation because the branch is ahead, diverged, dirty, or missing an upstream. Does not contact the network.

When the channel is `stable` and the local upstream ref contains release notes newer than the installed version, the dry-run shows a release-aware notice with version, title, digest, and the concrete preview/update commands. If release notes are unavailable locally, the dry-run falls back to commit-oriented wording.

### Release notes

```bash
mirror runtime release-notes [latest|vX.Y.Z]
mirror runtime release-notes pending [--from vX.Y.Z] [--ref origin/stable]
```

Reads narrative release notes from `docs/releases/`. `latest` and explicit versions read the checked-out files. `pending` reads release notes from a git ref, defaults to `origin/stable`, fetches that ref safely before rendering, and lists every release newer than the installed runtime version. The fetch updates only remote-tracking refs; it does not merge, checkout, migrate, or modify the working tree. Use `--from` to simulate an older installed version or support a user report without mutating package metadata. Use `--ref HEAD --no-fetch` for local smoke tests before a release is published, or `--ref origin/stable` for the user-facing stable channel.

Examples:

```bash
mirror runtime release-notes latest
mirror runtime release-notes v0.10.5
mirror runtime release-notes pending
mirror runtime release-notes pending --from 0.9.0 --ref origin/stable
mirror runtime release-notes pending --from 0.9.0 --ref HEAD --no-fetch
```

### Release promotion doctor

**Moved out of the product command surface (CV22.DS10.US2).** `runtime release-doctor`
no longer exists as a Mirror command: it needs a git checkout, a clean tree, and local
tags, which an installed user does not have. It is maintainer tooling now, and the front
door answers the old name with its [cutoff](docs/releases/pending-cutoffs.md#release-tooling-leaves-the-product-command-surface).

```bash
cd ts
npm run release:doctor -- --target vX.Y.Z [--stable origin/stable]
```

Runs a read-only preflight before stable promotion. The doctor checks repository availability, clean git state, package version, release-note file and heading, release index link, release tag state, and stable ref relationship. It prints `pass`, `warn`, and `fail` checks. Warnings keep the command exit code at zero because a pre-promotion state may legitimately lack a tag or stable fast-forward; failures exit non-zero. The command does not fetch, tag, merge, push, edit files, back up, migrate, or modify refs.

### Stable release promotion

**Moved out of the product command surface (CV22.DS10.US2)**, with `release-doctor` and
for the same reason: it needs tags, a `stable` branch, and push rights. The front door
answers the old name with its cutoff, *before dispatch*, so a stray `--push` reaches
nothing.

```bash
cd ts
npm run release:promote -- --target vX.Y.Z --dry-run
npm run release:promote -- --target vX.Y.Z
npm run release:promote -- --target vX.Y.Z --push
```

Promotes a release to the stable channel through a controlled path. The command runs the release doctor first and blocks on failures. Dry-run prints planned stages without creating tags, moving branches, or pushing. Local promotion creates the missing target tag at `HEAD` or reuses an existing tag already at `HEAD`, then creates or fast-forwards the local `stable` branch to `HEAD`. Remote publication happens only with `--push`, which pushes the tag and stable branch to `origin`. The command does not fetch, force-push, rewrite existing tags, bump versions, write release notes, create GitHub Releases, back up, migrate, or update production clones.

After `npm run release:promote -- --push` succeeds and CI is green, publish the matching GitHub Release on the same tag:

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z — Release Title" \
  --notes-file /tmp/mirror-release-notes.md \
  --latest
```

Use `gh release edit vX.Y.Z ... --latest` if the GitHub Release already exists. The notes body should come from `docs/releases/vX.Y.Z.md` with the YAML frontmatter removed.

### Update execution

```bash
mirror runtime update [--no-fetch] [--skip-migrations] [--mirror-home PATH] [--channel stable|main]
mirror runtime update --repair-updater [--no-fetch] [--mirror-home PATH] [--channel stable|main]
```

Executes the safe update pipeline. Stages run in order and the first failure stops execution:

The updater first identifies **how Mirror is installed**, from where the front door
itself lives — never from configuration. A `clone` (a git checkout) fast-forwards against
`origin/<channel>`; a `package` (an install under `npm root -g`) installs the version its
channel's dist-tag resolves to. Anything else is `unknown` and is refused with the reason
printed, rather than updated on a guess. A project-local `node_modules` is deliberately
*not* a package install: `npm install -g` would update a different tree from the one
running.

1. **status gate** — normally requires status to be ready. If the only remaining blocker is core migration drift that the target version may resolve, the updater proceeds through the backup-gated path and still requires post-update status to be ready. If the gate *crashes*, the repair lane runs automatically — an updater that cannot evaluate its own status is exactly what that lane is for.
2. **capture** — records where to go back to, before anything moves: the current commit for a clone, the installed version for a package. The recovery block prints the pasteable route with that value in it.
3. **fetch** — mutates only remote-tracking refs. Skipped with `--no-fetch`.
4. **plan** — accepts already-up-to-date and pull. Blocks ahead, diverged, and other unsafe states. Plan and fetch are read-only and run *before* the backup, so an update with nothing to do never archives the database.
5. **backup** — writes the dated archive.
6. **verify backup** — extracts `memory.db` and runs `PRAGMA quick_check` against it. Verifying entry names alone would accept an archive that cannot be opened.
7. **apply** — `git merge --ff-only` for a clone, `npm install -g <name>@<resolved version>` for a package. Never a merge, a rebase, or a bare dist-tag.
8. **migrate** — spawns `runtime migrate` in a **fresh process**, so the code that migrates is the code that was just installed, and prints the `_migrations` ledger before and after. Skipped with `--skip-migrations`.
9. **post-update status** — reruns `runtime status` in a fresh process and expects `ready`.

Failures print a recovery block with the backup path and previous commit when relevant. Successful installs that move to a new commit include an `Installed changes` summary generated from `git log <previous>..<new>`. On the `stable` channel, successful installs also include an `Installed release` block when the new checkout contains narrative release notes. The pipeline does not roll back automatically: recovery is documented manual work.

If the status gate crashes before update planning, `runtime update` automatically falls back to updater self-repair. The repair lane uses a minimal safety gate — readable checkout, clean tree, configured upstream, optional fetch — applies a fast-forward-only code update, and skips migrations, which the next ordinary update owns. It then asks the user to rerun `runtime update` with the repaired updater. The same lane can be invoked explicitly with `runtime update --repair-updater`. Older production clones whose updater is blocked before they receive the latest recovery behavior may need this explicit repair lane once.

### Builder Refinement authority

Builder selects Refinement behavior from one explicit project-relative path:

```text
docs/project/refinement/index.md
```

When the file exists, it is the sole shared authority for Refinement focus, ordering,
and current RS/CR status. Builder reads that index and its linked project documents; it
does not inspect, compare, synchronize, or mutate personal SQLite Workbench rows. Builder
entry surfaces point to the canonical index rather than rendering SQLite state. An
unreadable or ambiguous canonical document never causes a silent fallback to SQLite.

When asked to inspect or show file-first Refinement Work, Builder renders a compact
agent-composed `Refinement Workbench` view from those documents. The view names its
canonical source, shows current focus, RS status, ordered open CRs, terminal history,
the next safe action, and a read-only boundary; it also states that SQLite was not
consulted. When the canonical index assigns a CR, the view also shows its human Driver
and pull-request or branch Delivery reference; unassigned rows omit those details.
This is an agent presentation contract, not a runtime Markdown parser or a deterministic
Ariad surface. Builder preserves canonical ordering and status, reports invalid
document structure instead of recovering from legacy state, and makes no mutation
during inspection.

Driver and Delivery are explicit project facts. Builder never infers them from the
current checkout, latest committer, active journey, conversation, or SQLite. Projects
may require both fields before `in_progress`, `blocked`, or `validated`; reassignment
and stale-work disposition remain explicit Navigator decisions. Git and pull requests
remain authoritative for diffs, collaboration, conflicts, and history.

The project-owned
[Collaborative Refinement Protocol](docs/project/refinement/rs002-collaborative-refinement-work/collaboration-protocol.md)
defines the default contributor route: inspect, capture without changing focus, select,
plan, assign and start, record implementation evidence, validate with the Navigator,
review, reach a terminal state, and return a compact handoff. Capture allocates the next
unused project-wide ID from the complete index and requires an explicit RS target under
the current artifact layout. Git surfaces concurrent ID and semantic edits; Builder
never silently renumbers, overwrites, merges narratives, or consults SQLite to resolve
them. The protocol deliberately adds no ID service, lock, watcher, parser,
synchronization layer, or custom Git command.

Read-only requests remain read-only. During an already-authorized mutable operation,
Builder may repair and report a structural defect without another confirmation only when
the repair is deterministic, local, non-destructive, reversible, meaning-preserving, and
contained in the original request. A repair that chooses status, priority, focus,
identity, deletion, or conflict meaning stops with a concrete recommendation for the
Navigator. This repair policy never authorizes a commit, push, publication, release,
configuration change, or legacy data mutation.

**The SQLite Workbench is removed.** Until CV22.DS10.TS4, an Ariad-adopted
journey whose project had no canonical index fell back to twenty
compatibility-only `build refinement-story` / `build change-request` commands
backed by SQLite. Those commands no longer exist, and the front door answers
each of them with its
[cutoff](docs/releases/pending-cutoffs.md#the-sqlite-refinement-workbench).
Refinement Work lives in project files, for every journey, with no second
authority to fall back to.

### Clone role

Each Mirror Mind clone declares its role through a `.mirror-clone-role` file at the repository root. Valid values are `production` and `dev`. The file is local to each clone and ignored by git. When the file is missing, unreadable, or contains an unknown value, the role defaults to `production`.

- `runtime status` and `runtime version` report the current clone role.
- `mirror build load <slug>` applies the clone-role guard only when the journey `project_path` points at a Mirror Mind source checkout. In that case it refuses `production` clones unless `--ignore-production-role` is passed. Non-Mirror journey projects are not blocked by missing `.mirror-clone-role`. When no `project_path` is configured, Builder falls back to inspecting the current directory.
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
mirror runtime version
mirror runtime update --check
```

Change a clone to dogfooding/main:

```bash
printf 'main\n' > .mirror-update-channel
mirror runtime version
mirror runtime update --check
```

Remove the marker to return to the safe default (`stable`):

```bash
rm .mirror-update-channel
```

The local git branch and the update channel are related but not identical. A checkout may report `Git branch: main` and `Update channel: stable`. In that state, `runtime update` still compares and fast-forwards against `origin/stable`; the channel controls the update target even if the local branch name remains `main`.

For common channel problems, see [Troubleshooting](docs/process/troubleshooting.md#runtime-update-channel-stable-is-not-fetched-or-unavailable).

To list the active personas for the current user:

```bash
mirror list personas --verbose
```

The database is the source of truth for personas. There is no authoritative
static table; `list personas --verbose` reflects the current seeded state.

---

## Configuration

`.env` is read by Node, not by Mirror: every invocation passes it. The skills
and the `mirror` alias use `node --env-file=.env`; the hook wrappers and the
MCP launcher use `--env-file-if-exists`, so a fresh clone without one still
starts. Values already present in the real environment take precedence over
the file.

Two starter files live at the repo root:

- `.env.example` — minimal template (identity + API keys)
- `.env.example.advanced` — canonical reference with every variable documented

### Platform envelope

Mirror Mind's core is one TypeScript package, run by **Node.js ≥ 24**, required for
`node:sqlite` and direct `.ts` execution). There is no build step and no other
runtime: the Python engine was deleted in CV22.DS10.TS5. `runtime status`
reports the Node version; the front door refuses to run on Node below 24 with
an actionable message.

**Supported today: POSIX (macOS, Linux).** The documented skill invocation uses
POSIX shell syntax (`NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts …`),
which native Windows PowerShell does not parse. The PowerShell installer and
the Windows Frame still install and call the Python engine, and are re-homed
by CV22.DS10.US3; a native-Windows story for the front door (invocation syntax,
path handling, ACL-based data-at-rest posture) is explicitly deferred. The
front door must be invoked from the repository root (the relative-path
invocation enforces this).

### Data at rest

A mirror home holds a person's identity, memories, and conversations. The
expected filesystem posture is **owner-only**: directories `0700`, data files
`0600` (POSIX; Windows ACLs are currently out of scope).

- **Enforced at creation points:** the database bootstrap
  (`ts/src/db/bootstrap.ts`) applies the posture to a directory it creates and
  to the database file and its `-wal`/`-shm` sidecars; the front door creates
  `backups/` at `0700` and its snapshot at `0600`. Pre-existing directories
  are never mutated — a
  user-chosen location like `~/Documents` stays as the user set it.
- **Reported on drift:** `mirror runtime diagnose` emits a
  `loose_permissions` finding (severity: attention) when the mirror home or
  database is group/other-accessible, including the exact `chmod` to run.
- **Pre-write backup:** every front-door live write first snapshots the
  database (WAL-safe `VACUUM INTO`) to `<mirror home>/backups/`
  `frontdoor-pre-write-backup.db`. The name is fixed and overwritten per write:
  it is an undo of the most recent routed write, not an archive — scheduled
  archives remain `mm-backup`'s job.

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

### Intelligence Flags

The four flags that determine what the mirror does and costs on every
conversation. Their 1.0 posture and full reasoning are recorded in
[Decisions](docs/project/decisions.md).

| Variable | Default | Effect, cost, and trade-off |
|----------|---------|------------------------------|
| `MEMORY_RECEPTION` | `1` (on) | One classification call per Mirror-mode turn before the mirror answers; fails safe to keyword routing (10s timeout). Set `0` to disable — saves one interactive call per turn, loses turn-aware response shaping. |
| `MEMORY_TWO_PASS` | unset (off) | Second-pass curation that dedups and refines new memories against history at write time: a query embedding per candidate plus one curation call. Set `1` to enable — fewer near-duplicate memories, at added per-conversation cost (not yet in the `llm_calls` ledger, debt D-003) and a risk of over-merging distinct memories. Off for 1.0; revisit when embedding spend is measurable. |
| `MEMORY_SUMMARIZE` | unset (off) | LLM-written conversation summary instead of the free mechanical one. Set `1` to enable — marginal summary-quality gain for one call per conversation. |
| `MEMORY_LOG_LLM_CALLS` | `metadata` | `off`, `metadata`, or `full`. `metadata` records role/model/tokens/latency/estimated-cost with no bodies; `full` adds prompt/response bodies; `off` disables logging. Legacy `1` maps to `full`. |

### Environment Selection

| Variable | Default | Role |
|----------|---------|------|
| `MEMORY_ENV` | `production` | One of `production`, `development`, `test`. Selects the database **name** only (`memory.db`, `memory_dev.db`, `memory_test.db`) — never the directory — and gates `MemoryClient.reset`. |

### Path Overrides

All of these derive from the resolved mirror home in **every** environment
(CV9.E2.S6 — runtime state home containment). Set them only to override the
default layout. When no mirror home is resolvable and no override is set,
database-touching commands fail with an actionable error instead of writing
to the homes root (`~/.mirror-minds`).

| Variable | Default | Role |
|----------|---------|------|
| `MEMORY_DIR` | resolved mirror home | Runtime working dir for the database, `mute`, and `.bootstrap.lock`. |
| `MEMORY_PROD_DIR` | `MEMORY_DIR` | Production-only override. |
| `DB_PATH` | `<mirror home>/<env db name>` | Full SQLite path. |
| `DB_BACKUP_PATH` | `<DB_PATH parent>/backups` | Global backup default used only when no mirror home is in scope. |
| `BACKUP_DIR` | — | **Deprecated.** No longer redirects backups. `mirror backup` now writes to `<mirror_home>/backups`; if this variable is set, the command warns and ignores it. Use `--backup-dir <path>` for an intentional, per-invocation destination. |
| `EXPORT_DIR` | `<MIRROR_HOME>/exports` | Markdown export root. |
| `TRANSCRIPT_EXPORT_DIR` | `<EXPORT_DIR>/transcripts` | Full-transcript export dir. |

### Runtime Integrations

| Variable | Default | Role |
|----------|---------|------|
| `PI_SESSIONS_DIR` | `~/.pi/agent/sessions` | Source directory for `backfill_pi_sessions`. Override for multi-user setups. |
| `MIRROR_SESSION_ID` | (unset) | Fallback session id for conversation-logger CLIs when neither `--session-id` nor a hook payload is present. Rarely set by humans. |
| `MIRROR_WELCOME` | (unset) | Set to `off`, `0`, `false`, or `no` to suppress the welcome card emitted by `mirror welcome`. See `docs/product/specs/welcome/index.md`. |
| `MIRROR_TS_MCP_GUARDS` | (unset) | Set to `0` to remove the MCP wallet and abuse guards (rate limit, spend ceiling, argument caps). See [Configuration](docs/reference/configuration.md#mcp-wallet-and-abuse-guards-cv22ds9ts1). |

The plugin manifest launches `${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh`, which
`exec`s the TypeScript server, so the entry point can change without editing a
plugin installed inside a runtime. The server requires `node` ≥ 24 on the
PATH the MCP client spawns it with. The `MIRROR_TS_*` revert variables of the
migration, `MIRROR_TS_MCP` among them, are inert since CV22.DS10.TS5: nothing
reads them, and `runtime diagnose` names any still set.

### Set by External Runtimes (do not set manually)

- `CLAUDE_PROJECT_DIR` — injected by Claude Code when it invokes hooks.
- Claude Code hook payloads carry `session_id` on stdin.
- Pi's extension passes the session file path to the logger CLI.

### Relocating Legacy Root Runtime State

Before CV9.E2.S6, development/test databases, the Pi `mirror-logger.log`,
bootstrap locks, and a `backups/` directory could land directly in the homes
root (`~/.mirror-minds/`) instead of inside a mirror home. `mirror runtime
diagnose` reports such artifacts as `legacy_root_runtime_state`.

Relocation is deliberately manual — histories are never merged automatically:

1. Stop running Pi/agent sessions that may still hold the old paths.
2. For each reported database, decide which mirror home owns it, then move it:
   `mv ~/.mirror-minds/memory_dev.db ~/.mirror-minds/<user>/memory_dev.db`.
   If the destination already has a database of the same name, keep both
   files and choose one as the survivor — merging is out of scope; the
   non-survivor can be archived elsewhere.
3. `*.bootstrap.lock`, `*.db-wal`, and `*.db-shm` sidecars belong next to
   their database; move them with it (or delete lock files when no process
   is running).
4. `mirror-logger.log` in the root can be deleted or archived; new sessions
   write to `<mirror home>/mirror-logger.log`.
5. Re-run `mirror runtime diagnose` and confirm no
   `legacy_root_runtime_state` findings remain.

The Pi logger still falls back to `~/.mirror-minds/mirror-logger.log` when no
mirror home is resolvable — that file reappearing is itself a signal that a
workspace is running without `MIRROR_USER`/`MIRROR_HOME`.

---

## Legacy Migration Workflow

**Removed in the CV22 migration.** The Portuguese-era database conversion
(`memoria.db` → a user home, pre-CV0) was retired rather than ported to the
TypeScript core — see the
[cutoff](docs/releases/pending-cutoffs.md#legacy-migration) for what to do
instead and what still works.

In one line: if you still hold a Portuguese-era database, convert it with the
last Python-bearing release, once; a home that was already converted keeps
working, and nothing about it changed.

---

**See also:** [Getting Started](docs/getting-started.md) ·
[Architecture](docs/product/architecture.md)
