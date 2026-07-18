[< Specs](../index.md)

# Runtime Interface Contract

A **runtime** is any frontend that presents the mirror to the user. Currently
four runtimes exist: Claude Code (hooks), Pi (TypeScript extension), Gemini CLI
(shell hooks), and Codex (wrapper script). This document defines what every
runtime must implement to integrate correctly with the Python `memory` core.

The Python CLI (`python -m memory ...`) is the stable interface. Inside this
repo, run it as `uv run python -m memory ...`. Runtimes are thin dispatchers —
they translate lifecycle events into CLI commands and do nothing else. A new
runtime built solely from this document will work.

---

## Lifecycle Events

Every runtime must handle four events. The table below lists the event, the
required CLI command, and any arguments the runtime must supply.

| Event | Required CLI command | Arguments supplied by runtime |
|-------|---------------------|-------------------------------|
| Session start | `uv run python -m memory conversation-logger session-start` | none |
| User prompt | `uv run python -m memory conversation-logger log-user <session_id> <prompt> --interface <name>` | `session_id`, `prompt text`, `interface name` |
| Assistant response | see note below | — |
| Session end | `uv run python -m memory conversation-logger session-end` or `session-end-pi <id>` | see note below |
| Backup | `uv run python -m memory backup --silent` | none |

Backup runs at session end immediately after the session-end command.

Optional runtime hygiene command:

```bash
uv run python -m memory conversation-logger discard-current --interface pi
```

This deletes the current runtime conversation and marks the session so the
assistant confirmation is not logged as a new conversation. It is intended for
test sessions the user wants to quit without preserving in Mirror history.

---

## Event Details

### Session Start

Runs once when the runtime initialises. Unmutes logging, clears stale session
orientation so the new session starts from present intention rather than the
last explicit mode or journey, closes stale orphan conversations (idle > 30
min), and extracts memories from any conversations that ended without
extraction.

```
uv run python -m memory conversation-logger session-start
```

No arguments. Prints a summary string (may be empty).

---

### User Prompt

Runs before each model turn. Persists the user message to the database.

```
uv run python -m memory conversation-logger log-user <session_id> <prompt> --interface <name>
```

- `session_id` — opaque identifier for the current agent session, supplied by
  the runtime environment
- `prompt` — full text of the user message; truncate at ~50 KB if needed
- `--interface` — runtime name used for attribution (e.g. `claude_code`, `pi`)

Skip if the prompt begins with `/` (skill invocation, not a conversational message).

---

### Assistant Response

Runtimes differ here by design. The difference is structural, not accidental:
Claude Code has access to the full session transcript; Pi logs messages
explicitly as they arrive.

**Pi** — logs each assistant turn explicitly at `agent_end`:

```
uv run python -m memory conversation-logger log-assistant <session_id> <content> --interface pi
```

Collect all assistant messages from the turn, concatenate, and log once.
Truncate at ~50 KB.

**Claude Code** — backfills from the JSONL transcript at session end via
`hook_session_end()`. No per-turn call is needed.

A new runtime should use whichever model matches its architecture: explicit
per-turn logging (like Pi) if messages are available as events; transcript
backfill (like Claude Code) if a session transcript file is available.

---

### Session End

Closes the conversation record. Runtimes differ on extraction timing:

**Claude Code** — has `session_id` and `transcript_path` from the environment.
Extracts memories immediately and backfills assistant messages from the
transcript.

```
uv run python -m memory conversation-logger session-end
```

Input: JSON on stdin — `{"session_id": "<id>", "transcript_path": "<path>"}`.
Claude Code's `Stop` hook provides this via stdin automatically.

**Pi** — does not have transcript access. Defers extraction to the next
`session-start`.

```
uv run python -m memory conversation-logger session-end-pi <session_id>
```

**Gemini CLI** — `SessionEnd` is best-effort (CLI exits without waiting for the
hook). Uses `session-end-pi` for deferred extraction, same as Pi.

```
uv run python -m memory conversation-logger session-end-pi <session_id>
```

**Codex** — has no lifecycle hooks. Uses a wrapper script that backfills the
session transcript from JSONL and then calls `session-end-pi` for deferred
extraction.

```
uv run python -m memory conversation-logger backfill-codex-session <path>
uv run python -m memory conversation-logger session-end-pi <session_id>
```

A new runtime should use `session-end-pi` unless it can supply a transcript
path, in which case `session-end` gives immediate extraction.

---

## Optional: Runtime Status Line

Runtimes with a footer/status API may render Mirror's compact status line. When
the runtime has a stable session id, it should pass it so operating-mode status
is session-scoped rather than leaking across simultaneous sessions:

```bash
uv run python -m memory welcome --status-line --session-id <session_id>
```

Fallback for runtimes without a session id:

```bash
uv run python -m memory welcome --status-line
```

The command is cheap and cache-oriented. It includes active operating mode
context when present, for example:

```text
◇ alisson-vale · Explorer Mode on ■ Builder Mode · ✓
```

When no journey context is active, it still shows the default Mirror lens:

```text
◇ alisson-vale · ◌ Mirror Mode · ✓
```

Pi renders this through `ctx.ui.setStatus("mirror", ...)` and refreshes it at
startup and after agent turns. Other runtimes may ignore this optional surface.

Operating mode lifecycle is explicit and lives in the Python core as an internal
surface for Mirror skills and runtime integrations. Session-aware runtimes should
pass `--session-id`; CLI-only callers may use the global fallback:

```bash
uv run python -m memory mode --session-id <session_id> activate "Builder Mode" --journey <slug>
uv run python -m memory mode --session-id <session_id> deactivate
```

Activation and deactivation are semantic operations that can be triggered by the
user through natural language or by Mirror through contained commands. Users are
never in "no mode": deactivating an explicit lens returns to Mirror Mode, while
journey context remains visible when it is still sticky inside the active
session. A new runtime session clears stale explicit mode and sticky journey
context so the next session starts from present intention, not accidental
continuity. Rendering and clearing runtime UI are internal effects.

## Optional: Mirror Mode Identity Injection

Mirror Mode runtimes inject identity context before the model responds. This
is optional — a runtime that does not support Mirror Mode skips this entirely.

```
uv run python -m memory mirror load --context-only --query "<user prompt>" [--persona <id>] [--journey <id>] [--org] [--session-id <id>]
```

- `--context-only` — loads identity without starting a new database session
  (the model skill starts the session)
- `--query` — used for attachment search; pass the user's full prompt
- `--persona`, `--journey`, `--org` — optional; omit to let auto-detection decide
- `--session-id` — optional but preferred when the runtime has an explicit session identifier; enables session-scoped mirror state and routing

The command prints the identity block. The runtime injects this as a system
note before the model sees the prompt.

**Claude Code** runs this synchronously in `mirror-inject.sh` on
`UserPromptSubmit`, triggered when the prompt begins with `/mm:mirror` or when
Mirror Mode is already active.

**Pi** does not auto-inject. The `/mm-mirror` skill calls `mirror load`
explicitly at the start of each Mirror Mode response.

**Gemini CLI** runs this in the `BeforeAgent` hook. When Mirror Mode is active,
the hook calls `mirror load --context-only` and returns the identity block as
`hookSpecificOutput.additionalContext` — injected automatically before the model
processes the prompt.

---

## Reference Implementations

### Claude Code

| Event | Hook file | Claude Code trigger |
|-------|-----------|---------------------|
| Session start | `.claude/hooks/session-start.sh` | `SessionStart` |
| User prompt | `.claude/hooks/log-user-prompt.sh` | `UserPromptSubmit` |
| Mirror inject | `.claude/hooks/mirror-inject.sh` | `UserPromptSubmit` |
| Session end + backup | `.claude/hooks/log-session-end.sh` | `Stop` |

Hook files are registered in `.claude/settings.json`.

Current external-skill surfacing path:
- keep the installed source/runtime artifacts under `~/.mirror-minds/<user>/...`
- explicitly project installed Claude external skills into a project-local
  `.claude/skills/` surface with:

```bash
uv run python -m memory extensions expose-claude \
  --mirror-home ~/.mirror-minds/<user> \
  --target-root /path/to/project
```

- remove the projected Claude external skill surface later with:

```bash
uv run python -m memory extensions clean-claude \
  --target-root /path/to/project
```

`--target-root` is mandatory for both commands. Claude projection is an explicit
project operation, never an implicit write to the current working directory.

This creates project-visible skill directories such as:

```text
/path/to/project/.claude/skills/ext-review-copy/SKILL.md
/path/to/project/.claude/skills/extensions.external.json
```

Claude no longer relies on a repo-local `mm:review-copy` compatibility skill;
`review-copy` should now be surfaced as an installed external Claude skill.

### Pi

| Event | Extension file | Pi trigger |
|-------|---------------|------------|
| Session start | `.pi/extensions/mirror-logger.ts` | `session_start` |
| User prompt | `.pi/extensions/mirror-logger.ts` | `before_agent_start` |
| Assistant response | `.pi/extensions/mirror-logger.ts` | `agent_end` |
| Session end + backup | `.pi/extensions/mirror-logger.ts` | `session_shutdown` |
| Mirror load | `.pi/skills/mm-mirror/SKILL.md` | `/mm-mirror` skill invocation |

### Gemini CLI

| Event | Hook file | Gemini CLI trigger |
|-------|-----------|--------------------|
| Session start | `.gemini/hooks/session-start.sh` | `SessionStart` |
| User prompt + Mirror inject | `.gemini/hooks/log-user.sh` | `BeforeAgent` |
| Assistant response | `.gemini/hooks/log-assistant.sh` | `AfterAgent` |
| Session end + backup | `.gemini/hooks/session-end.sh` | `SessionEnd` (best-effort) |

Hook files are registered in `.gemini/settings.json`. Session ID is available
in hook stdin and may also be available as `$GEMINI_SESSION_ID` depending on the
installed Gemini CLI version. Hooks must support both. Mirror Mode injection
uses `BeforeAgent` `hookSpecificOutput.additionalContext` — automatic per-turn
injection without explicit user invocation.

Skills are discovered from the shared `.agents/skills/mm-*/SKILL.md` surface
(symlinked from `.pi/skills/mm-*/`). `.gemini/skills/` is intentionally absent
because Gemini CLI can read `.agents/skills/`, and keeping both surfaces creates
conflicting duplicate skills.

### Codex

| Event | Mechanism | Codex trigger |
|-------|-----------|---------------|
| Session start | `scripts/codex-mirror.sh` | Wrapper start |
| User prompt | `scripts/codex-mirror.sh` | JSONL backfill at exit |
| Assistant response | `scripts/codex-mirror.sh` | JSONL backfill at exit |
| Session end + backup | `scripts/codex-mirror.sh` | Wrapper exit |
| Mirror load | `AGENTS.md` + `$mm-mirror` skill | Explicit invocation |

Codex has no hook system. It uses a **wrapper script** (`scripts/codex-mirror.sh`)
that handles the lifecycle around the `codex` command. Context is supplied via a
static `AGENTS.md` in the project root, and Mirror Mode is activated through the
shared native skill surface at `.agents/skills/mm-*/SKILL.md` (symlinked from
`.pi/skills/mm-*/`). Unlike Pi and Gemini CLI, Codex activates these skills with
`$mm-*` syntax, for example `$mm-build mirror`.

---

## External Skill Runtime Surface Contract

External skills are installed into a user-owned source tree under:

```text
~/.mirror-minds/<user>/extensions/<id>/
```

Runtime-facing materialization happens separately under:

```text
~/.mirror-minds/<user>/runtime/skills/<runtime>/
```

For prompt-skills, the materialized shape is:

```text
~/.mirror-minds/<user>/runtime/skills/pi/ext-review-copy/SKILL.md
~/.mirror-minds/<user>/runtime/skills/pi/extensions.json
```

or, for Claude:

```text
~/.mirror-minds/<user>/runtime/skills/claude/ext-review-copy/SKILL.md
~/.mirror-minds/<user>/runtime/skills/claude/extensions.json
```

### `extensions.json` v1

Each runtime root contains an explicit catalog with this shape:

```json
{
  "schema_version": "1",
  "runtime": "pi",
  "target_root": "~/.mirror-minds/<user>/runtime/skills/pi",
  "generated_at": "2026-04-21T18:00:00+00:00",
  "extensions": [
    {
      "id": "review-copy",
      "name": "Review Copy",
      "category": "extension",
      "kind": "prompt-skill",
      "summary": "Multi-LLM copy review workflow that generates a structured HTML report",
      "runtime": "pi",
      "command_name": "ext-review-copy",
      "source_extension_dir": "~/.mirror-minds/<user>/extensions/review-copy",
      "manifest_path": "~/.mirror-minds/<user>/extensions/review-copy/skill.yaml",
      "source_skill_path": "~/.mirror-minds/<user>/extensions/review-copy/SKILL.md",
      "installed_skill_path": "~/.mirror-minds/<user>/runtime/skills/pi/ext-review-copy/SKILL.md"
    }
  ]
}
```

### Consumption rule

Runtimes should treat `runtime/skills/<runtime>/` plus `extensions.json` as the
canonical installed external skill surface. They should not inspect
`~/.mirror-minds/<user>/extensions/` directly during execution.

This keeps:
- authoring/source files separate from runtime materialization
- runtime loading deterministic
- installation and removal explicit

### Pi runtime consumption prep

Pi should prepare to consume the installed external skill surface with this
algorithm:

1. Resolve the active mirror home
2. Read `~/.mirror-minds/<user>/runtime/skills/pi/extensions.json`
3. Validate:
   - `schema_version == "1"`
   - `runtime == "pi"`
4. For each item in `extensions`:
   - trust `command_name` as the runtime-visible command
   - trust `installed_skill_path` as the materialized skill file
   - ignore the source extension tree during execution
5. If the catalog is missing or invalid:
   - continue safely with built-in Pi skills only
   - do not fail session logging or Mirror Mode hooks

Recommended first integration behavior:
- built-in Pi skills remain the default surface
- external skills are additive
- runtime catalog load failures should be logged, not fatal

Current prototype status:
- `.pi/extensions/mirror-logger.ts` now reads the installed Pi runtime catalog on
  `session_start`
- it validates `schema_version` and `runtime`
- it logs discovered external skill commands
- it surfaces a lightweight status hint in the Pi UI (`ext N`)
- on `resources_discover`, it returns installed `SKILL.md` paths from the Pi
  runtime catalog as dynamic `skillPaths`
- this makes installed external Pi skills part of Pi's discovered skill surface
  without re-reading source manifests at runtime

---

## CLI Reference

All commands assume the `memory` package is installed and accessible via
`python -m memory`. Inside this repo, prefer `uv run python -m memory ...` so
commands run inside the locked project environment.

```
uv run python -m memory conversation-logger session-start
uv run python -m memory conversation-logger log-user <session_id> <prompt> --interface <name>
uv run python -m memory conversation-logger log-assistant <session_id> <content> --interface <name>
uv run python -m memory conversation-logger session-end          # reads JSON from stdin
uv run python -m memory conversation-logger session-end-pi <id>  # explicit session id, deferred extraction
uv run python -m memory mirror load --context-only --query <q> [--persona <p>] [--journey <j>] [--org] [--session-id <id>]
uv run python -m memory backup --silent
```

---

## Runtime Adapter Patterns

Patterns extracted from building Claude Code, Pi, and Gemini CLI. A new
runtime should read this section before the reference implementations.

---

### Stdout purity (shell-hook runtimes)

**Rule:** A shell hook's stdout must contain exactly one JSON object — nothing
else. Not a status line, not a debug print, not a partial JSON. Any non-JSON
byte on stdout before the final object will break parsing silently or visibly
depending on the runtime.

**In practice:** redirect all Python CLI output to `/dev/null` or `2>/dev/null`,
never to stdout.

```bash
# Correct
uv run python -m memory conversation-logger session-start >/dev/null 2>&1 || true
echo '{}'

# Wrong — status line leaks to stdout before the JSON
uv run python -m memory conversation-logger session-start 2>/dev/null
echo '{}'
```

Found live in Gemini CLI integration. Claude Code's `Stop` hook does not use a
JSON envelope, so this class of bug was invisible there until Gemini CLI exposed
the constraint.

---

### Session ID delivery

| Runtime | Session ID source |
|---|---|
| Claude Code | `session_id` field in JSON stdin |
| Gemini CLI | `session_id` in JSON stdin; `$GEMINI_SESSION_ID` when provided by the installed CLI version |
| Pi | TypeScript `session.id` from extension context |

**Preference for shell-hook runtimes:** use the env var form when available,
but always fall back to stdin. It requires no subprocess to extract and is
available throughout the script, but runtime versions may differ in whether the
env var is populated.

**For new shell-hook runtimes:** check whether the runtime injects a session ID
as an env var. If yes, prefer it. In all cases, parse it from stdin as a
fallback and store the resolved value in a shell variable at the top of the
script.

---

### Extraction models

| Model | Command | Runtimes | Tradeoff |
|---|---|---|---|
| Immediate | `session-end` (reads JSON stdin with `transcript_path`) | Claude Code | Best memory freshness; requires transcript access |
| Deferred | `session-end-pi <session_id>` | Pi, Gemini CLI, Codex | Resilient to best-effort session end or wrapper-driven lifecycle; extraction at next session start |

Use **immediate** when the runtime can supply a `transcript_path` at session end.
Use **deferred** when session end is best-effort or the runtime lacks transcript access.

For new runtimes: inspect whether the runtime provides a stable transcript path
at session end. If yes, `session-end` gives better extraction timing. If no,
`session-end-pi` is the safe default.

---

### Mirror Mode injection models

| Model | Mechanism | Runtimes | UX |
|---|---|---|---|
| Automatic per-turn | `BeforeAgent` `additionalContext` | Gemini CLI | Best UX — no user action; latency cost on every turn |
| Hook-conditional | `UserPromptSubmit` inject when mirror state active | Claude Code | Zero cost when inactive; requires mirror state check |
| Explicit invocation | User types `/mm-mirror` or `$mm-mirror` | Pi, Codex | Zero runtime cost; requires user awareness |

For new shell-hook runtimes with a `BeforeAgent`-equivalent hook: use the
automatic per-turn model. Call `mirror load --context-only` and return the
identity block as the hook's context-injection field. Condition on mirror state
to avoid the cost when Mirror Mode is not active.

---

### Smoke test isolation

Use `DB_PATH` to override the database path directly, bypassing mirror home
resolution. This avoids conflicts between `MIRROR_HOME` and `MIRROR_USER` set
in `.env`.

```bash
export DB_PATH="/tmp/smoke-test/memory.db"
export MEMORY_ENV="production"
```

Do **not** use `MIRROR_HOME` for smoke tests if `MIRROR_USER` is set in `.env`.
The path resolver raises a `ValueError` when the `MIRROR_HOME` basename does
not match `MIRROR_USER`.

Standard smoke test structure:

1. Record production DB checksum before the test
2. Set `DB_PATH` to an isolated temporary path
3. Simulate each lifecycle hook with a representative payload
4. Inspect the isolated DB: verify `interface='<runtime>'` rows and message content
5. Confirm production DB checksum unchanged after the test

References: `scripts/smoke_gemini_cli.sh`, `scripts/smoke_codex.sh`

---

### Skill sharing (SKILL.md-native runtimes)

Runtimes that discover SKILL.md natively can share Mirror Mind's skill surface
via symlinks. Pi owns the source skill files in `.pi/skills/`; Gemini CLI and
Codex share one project-local surface at `.agents/skills/`:

```bash
# From .agents/skills/
ln -sf ../../.pi/skills/mm-mirror mm-mirror
```

This creates one source of truth: updating a Pi skill automatically updates the
Gemini CLI and Codex skill surface. Do not also create `.gemini/skills/`; Gemini
CLI can read `.agents/skills/`, and a second surface creates duplicate/conflicting
skills. The discovery format can be shared even when invocation syntax differs:
Gemini CLI uses `/mm-*`, while Codex uses `$mm-*`.

---

### Interface label

`interface` is a free-text field. Passing `--interface <runtime_name>` is all
that is needed. No Python migrations are required to add a new runtime label.

Established labels: `claude_code`, `pi`, `gemini_cli`, `codex`.

---

**See also:** [CV2 Runtime Portability](../../../project/roadmap/cv2-runtime-portability/index.md) · [Briefing](../../../project/briefing.md) · [CV8.E4 Runtime Adapter Hardening](../../../project/roadmap/cv8-runtime-expansion/cv8-e4-runtime-adapter-hardening/index.md)
