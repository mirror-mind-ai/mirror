[< Specs](../index.md)

# Runtime Interface Contract

A **runtime** is any frontend that presents the mirror to the user. Currently
five runtimes exist: Claude Code (hooks), Pi (TypeScript extension), Codex
(the shipped plugin), Antigravity (the same plugin with its agy-native
layer), and Grok Build (the shipped plugin, with the Operating Instructions as
a home-level rule). This document defines what every runtime must implement to
integrate correctly with Mirror Mind's core.

The front door is the stable interface: one process per command, entered as
`mirror <command> …` — the `bin` the npm package installs (`bin/mirror.js`,
a loader shim over `ts/src/frontDoor/cli.ts`; US3 D15), on the `PATH` from
`npm install -g mirror-mind` or from `npm link` at a clone's root. A skill says
exactly that, in every runtime's copy, and a guard forbids any other form. The
hooks do not go through the `PATH`: the in-tree wrappers run their own tree's
`bin/mirror-hook.js`, and the plugin's find the installed `mirror-hook`
([Node resolution for hook runtimes](#node-resolution-for-hook-runtimes)). The front door reads its configuration
itself — the clone's `.env` when there is one, then the user's
`~/.config/mirror/env` — so no invocation passes a flag:

```bash
mirror <command> …
```

Runtimes are thin dispatchers — they translate lifecycle events into front-door
commands and do nothing else. A new runtime built solely from this document
will work.

Until CV22.DS10.TS5 this interface was the Python CLI; the commands, their
arguments, and their effects are the same, answered by the TypeScript core.

---

## Parity Matrix

What each runtime gets from Mirror, and how well. This table is the single
authority for runtime parity
([decision](../../../project/decisions.md#the-contracts-parity-matrix-is-the-single-authority-for-runtime-parity)):
every row is a measurement, taken on the version and binary it names, on the date it
names, and held in the record it links. A newer version of a runtime is not
re-measured until a story does it, and a cell changes only with a new measurement.
README, Getting Started, and REFERENCE link here rather than keep levels of their
own; the [architecture](../../architecture.md#6-runtime-model) repeats the levels,
and `ts/test/scripts/runtimeParityDocs.test.ts` holds the five docs to this table.

| Runtime | Level | Skills | Instructions at start | Mirror context before the model answers | Logging | MCP | Version | Binary | Measured | Record |
|---------|-------|--------|-----------------------|-----------------------------------------|---------|-----|---------|--------|----------|--------|
| Pi | **L4** | `/skill:mm-<skill>`, picked from the menu as `/mm-` is typed | the extension adds `AGENTS.md` to Pi's context files (D13; [CV22.DS10.US3](../../../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us3-npm-distribution/index.md), 2026-10-06, version not recorded) | the extension's `before_agent_start`, through the one doorman (`mirror doorman`): the full folder on the explicit form, a delta on each ordinary turn while Mirror Mode is on, nothing otherwise — carried into the run as a `mirror-context` message; the session named in the environment for the model's own loads | `pi`: the prompt as typed and its one reply; a skill turn is not recorded | not wired: the extension calls the front door | 1.4.0 | `~/.local/bin/pi` (the managed install's 1.4.0 release) | 2026-10-25 | [DS8.US5](../../../project/roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-us5-pi-through-the-one-doorman-at-l4/index.md) (the extension's harness test is Pi's automated proof; there is no isolated `smoke_pi.sh`), [CR159](../../../project/refinement/rs010-cv22-oracle-and-port-hygiene/cr159-pi-skills-are-spelled-by-their-bare-name-and-step-7a-lost-two-dashes.md), [CR160](../../../project/refinement/rs010-cv22-oracle-and-port-hygiene/cr160-a-pi-skill-invoked-as-skill-is-logged-as-its-body.md) |
| Claude Code | **L4** | 25, the plugin | the plugin's `SessionStart` hook | the inject hook: on a Mirror turn, and once on the first turn after Mirror Mode turns on | `claude_code`, replies from `Stop` | 7 tools | 2.1.296 | `~/.local/bin/claude` → `~/.local/share/claude/versions/2.1.296` | 2026-10-13 | [DS12.TS1](../../../project/roadmap/cv21-runtime-expansion-ii/cv21-ds12-runtime-re-baseline/cv21-ds12-ts1-claude-code-re-probe/index.md), [DS2](../../../project/roadmap/cv21-runtime-expansion-ii/cv21-ds2-mirror-plugin-mcp-foundation/index.md) |
| Codex | **L4** | 25, the plugin from Mirror's marketplace | the plugin's `SessionStart` hook, as a developer message | the inject hook, as on Claude Code | `codex`, replies included; the session closes when Codex reaps its thread, 30 min after `/quit` | the tools, reached through `tool_search` | 0.163.0 | `/opt/homebrew/bin/codex` → `/opt/homebrew/Caskroom/codex/0.163.0/bin/codex` | 2026-10-17 | [DS4.US4](../../../project/roadmap/cv21-runtime-expansion-ii/cv21-ds4-codex-through-the-canonical-plugin/cv21-ds4-us4-codex-at-l4-through-the-shipped-plugin-measured-live/index.md) |
| Antigravity | **L4** | 25, `agy plugin install` | the plugin's `rules/AGENTS.md` (its marker quoted on agy 1.4.2, DS7.US4); Mirror Mode turned on at `SessionStart` | `PreInvocation`, through the one doorman (`mirror doorman`), the turn's prompt read from the payload's `lastUserInput`: the full folder on the explicit form and on a new conversation's first turn, a delta on each ordinary turn while Mirror Mode is on, nothing otherwise — one persistent `systemMessage` step; a payload without the prompt (agy before 1.4.7) gets the whole folder each turn as an `ephemeralMessage` | `antigravity`, from the transcript | 7 tools (agy 1.4.2, DS7.US4) | agy 1.4.7 | `~/.local/bin/agy` | 2026-10-25 | [DS8.TS6](../../../project/roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/index.md) (the skills, the doorman's turns, the logging), [DS7.US4](../../../project/roadmap/cv21-runtime-expansion-ii/cv21-ds7-antigravity-through-skills-and-a-native-layer/cv21-ds7-us4-antigravity-at-the-bar-measured-live/index.md) |
| Grok Build | **L3** | 25, the plugin | the home-level rule `~/.grok/rules/mirror-mind.md` | none: Grok discards hook context, and the model loads it through `/mm-mirror` | `grok_build`, replies included | 7 tools, through `search_tool` and `use_tool` | 1.0.62 (1474f9cbdd91) | `~/.grok/bin/grok` → `~/.grok/downloads/grok-1.0.62-macos-aarch64` | 2026-10-18 | [DS10.US3](../../../project/roadmap/cv21-runtime-expansion-ii/cv21-ds10-grok-build-through-the-canonical-plugin/cv21-ds10-us3-grok-at-honest-l3-through-the-shipped-plugin-measured-live/index.md), [DS10.TS2](../../../project/roadmap/cv21-runtime-expansion-ii/cv21-ds10-grok-build-through-the-canonical-plugin/cv21-ds10-ts2-the-mcp-server-attaches-on-grok-or-the-reason-is-recorded/index.md) |

The levels are [CV8's](../../../project/roadmap/cv8-runtime-expansion/index.md#runtime-parity-levels),
which CV21 reuses:

- **L0, CLI-assisted:** the runtime can call `mirror …`, with no automatic logging or
  context.
- **L1, logged:** user and assistant turns are recorded, sessions close cleanly, and
  backups run.
- **L2, command surface:** Mirror's commands are reachable through the runtime's own
  command mechanism.
- **L3, Mirror Mode:** Mirror Mode works, with session-scoped state: identity and
  context reach the model, if only through the `/mm-mirror` skill the model runs.
- **L4, full parity:** logging, the command surface, Mirror Mode, Builder Mode, external
  skills, and an isolated smoke that proves them — and Mirror's context put before the
  model by the runtime itself, a hook that injects it, rather than loaded by the model
  through `/mm-mirror`. CV21 measured that line: Codex and Antigravity reached L4 by it,
  and Grok Build stayed at L3 for want of it
  ([decision](../../../project/decisions.md#grok-build-is-at-l3-through-the-canonical-plugin)).
  Pi, claimed L4 until DS11, had Grok's model and was L3 by the same line
  ([CR165](../../../project/refinement/rs010-cv22-oracle-and-port-hygiene/cr165-pi-puts-no-mirror-context-before-the-model.md));
  CV9.DS8.US5 gave its extension the one doorman and measured it at L4.

Gemini CLI was retired in [v0.35.0](../../../releases/v0.35.0.md) (CV21.DS8); Antigravity
is its successor
([decision](../../../project/decisions.md#gemini-cli-is-retired-and-antigravity-is-its-successor)).

---

## Lifecycle Events

Every runtime must handle four events. The table below lists the event, the
required command, and any arguments the runtime must supply.

| Event | Required command | Arguments supplied by runtime |
|-------|------------------|-------------------------------|
| Session start | `mirror conversation-logger session-start` | none |
| User prompt | `mirror conversation-logger user-prompt --interface <name>`, its JSON payload on stdin or as `--payload` | `session_id`, `prompt`, `turn_id` |
| Assistant response | `mirror conversation-logger stop --interface <name>`, likewise; see the note below | `session_id`, `turn_id`, `last_assistant_message` |
| Session end | `mirror conversation-logger session-end` or `session-end-pi <id>` | see note below |
| Backup | `mirror backup --silent` | none |

Backup runs at session end immediately after the session-end command.
`--silent` hides progress, never failure (CR060): a backup that wrote no
archive exits 1 with one stderr line, `backup: no archive was written: <why>`.
The Pi extension logs that line as a WARN in `mirror-logger.log`, the hook
wrappers record the exit in `hooks.log`, and the front-door log records why,
as a content-free category such as `backup=database_missing`.

**The hook runtimes do all of this in one process per event.** Claude Code
and the packaged plugin register short shell wrappers (`.claude/hooks/`,
`plugins/mirror-mind/hooks/`, `plugins/mirror-mind/agy/`, generated by
`scripts/generate_hook_wrappers.sh`). Each wrapper finds Node and runs a
single entry, the `mirror-hook` bin (`bin/mirror-hook.js`, running
`ts/src/hooks/main.ts <runtime>:<event>`), which reads configuration itself,
reads the runtime's JSON payload from stdin once, and runs the sequence above
in-process over the front door's own modules. A hook never fails the user's
turn: every path exits 0, and a failure is recorded in `<mirror home>/hooks.log`
instead. That includes a wrapper that cannot find `node` or `mirror-hook`, and
a `node` that cannot run the hook. See
[Node resolution](#node-resolution-for-hook-runtimes) and
[Installed package wiring](#installed-package-wiring).

Optional runtime hygiene command:

```bash
mirror conversation-logger discard-current --interface pi
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
mirror conversation-logger session-start
```

No arguments. Prints a summary string (may be empty).

---

### User Prompt

Runs before each model turn. Persists the user message to the database.

```
mirror conversation-logger user-prompt --interface <name>   # the payload on stdin, or as --payload <json>
```

The payload is a JSON object:

- `session_id` — opaque identifier for the current agent session, supplied by
  the runtime environment
- `prompt` — the text the person sent, before the runtime expands anything;
  truncate at ~50 KB if needed
- `turn_id` — the runtime's id for the turn (`prompt_id` and `promptId` are read
  too); a runtime that has none mints one per turn

`--interface` is the runtime name used for attribution (e.g. `claude_code`, `pi`).
`--payload` carries the payload in argv for a caller that cannot write stdin, Pi's
`pi.exec` (CR160); a route given it never reads stdin.

Skip a command turn: a prompt that opens with a skill invocation in any
runtime's sigil (`isCommandTurn`, CV21.DS4.TS3). A prompt opening with `/` is a
command whatever follows, since every runtime uses `/` for its own built-ins too.
A prompt opening with `$`, Codex's skill sigil, is a command when a skill name
follows — lowercase segments of letters, digits, hyphens, and underscores, an
optional plugin prefix joined by `:`, ending at whitespace or the end
(`$mm-journeys`, `$mirror-mind:mm:build mirror`) — and conversation otherwise
(`$5 a month`, `$HOME`). One exception in both sigils: a prompt that opens with
the Mirror skill's explicit form, in any runtime's spelling, is a conversation
turn, and the question that follows the form is what is logged (CV21.DS2.US8).
The forms are the inject hook's (see
[Mirror Mode Identity Injection](#optional-mirror-mode-identity-injection)). A
skipped turn is recorded by its turn id so the Stop hook skips its reply too:
what a person says to the mirror is remembered; a skill they invoke is not.

The `user-prompt` handler applies both rules itself, for the Claude-family
hooks (Claude Code, Codex, Grok) and, since
[CR160](../../../project/refinement/rs010-cv22-oracle-and-port-hygiene/cr160-a-pi-skill-invoked-as-skill-is-logged-as-its-body.md), Pi's extension.
It reads the turn id from the payload into the message's metadata, and stamps
`runtime_sessions.interface` with the runtime on every prompt, skipped or not, so
a conversation the Mirror Mode path creates inherits the right label. Pi hands its
extensions the prompt after expanding a skill into its body, so the extension sends
the text Pi's `input` event carried, as typed, with a turn id it mints for each run;
with no typed text kept for a run, it reads Pi's skill wrapper back to the command.
`log-user` and `log-assistant`, which Pi's extension called before CR160, write what
they are given and stay for one release, for extensions already loaded in running
sessions.

---

### Assistant Response

Every runtime reaches the same `stop` handler. They differ in how the answer
arrives: the Claude-schema runtimes hand their Stop hook the turn's final answer;
Pi's extension collects it.

**Pi** — collects the assistant text of every run a prompt takes (`agent_end`) and
sends it once, when the prompt settles (`agent_settled`), with the prompt's turn id
(CR160):

```
mirror conversation-logger stop --interface pi --payload <json>
```

One reply row per prompt; truncate at ~50 KB. A reply still unsent is sent before
the next prompt and at session end, since a Pi before 0.80.4 has no `agent_settled`.

**Claude Code, Codex, Grok** — the Stop hook (`claude:stop`, through
`log-assistant-reply.sh`) logs the payload's `last_assistant_message`
(`lastAssistantMessage` on Grok) beside its prompt:

```
mirror conversation-logger stop --interface <name>   # the Stop payload on stdin
```

A reply is logged when it answers a logged prompt — by turn id when both
carry one, else when the conversation's last message is a logged prompt — and
never otherwise: the reply to a command turn is not recorded, a repeat Stop
(Grok fires one at session end) adds nothing, an empty message (an
interrupted or tool-only turn) adds nothing, and the hook never creates a
conversation. The hook prints nothing and exits 0 whatever happens. A skip
says why: the prompt hook records the turn it skipped as a command (the
session's `skipped_turn_id`), so that turn's reply is an expected skip, as is a
Stop that names no turn. Only a reply nothing explains -- its turn's prompt
neither logged nor skipped, the race with an async prompt logger -- is one
`hooks.log` line, never the text, because `runtime diagnose` reads every line
there as a failure (CV21.DS2 Debt Review).
The transcript backfill at session end stays as the fallback, and fills only a
conversation that holds no assistant message, so a Stop-logged reply is not
recorded twice (CV21.DS2.US8).

**Antigravity** — hook payloads carry no text, so the `Stop` handler reads
the session's transcript JSONL and logs each turn beside its prompt, keyed on
a `step_index` high-water mark (CV21.DS7.TS3). (Gemini CLI, retired by
CV21.DS8, logged from the `AfterAgent` payload's `prompt_response` field; the
Node port first read the wrong field and dropped every assistant turn for a
day — CV22.DS10.TS5 finding F11. The payload shape is the contract, not the
variable name a port guesses.)

A new runtime should use whichever model matches its architecture: explicit
per-turn logging (like Pi) if messages are available as events; the Stop
hook's payload (like the Claude family) if the runtime hands it the answer;
transcript backfill if only a session transcript file is available.

---

### Session End

Closes the conversation record. Runtimes differ on extraction timing:

**Claude Code** — has `session_id` and `transcript_path` from the environment.
Extracts memories immediately and backfills assistant messages from the
transcript.

```
mirror conversation-logger session-end
```

Input: JSON on stdin — `{"session_id": "<id>", "transcript_path": "<path>"}`.
Claude Code's `SessionEnd` hook provides this via stdin automatically.

The hook passes `--interface <runtime>` as Stop does. Since CV21.DS4.TS2 the tail
depends on the session's runtime (the label US8 stamps on every prompt, the hook's
detection when the row has none):

- **Claude Code** registers the hook `async`, so it runs in the background after
  exit: the full tail runs — `ended_at`, the runtime session inactive, the
  transcript backfill, extraction, then title/summary/tags.
- **Codex** runs the hook synchronously under 1 s (DS12.TS2 L2; DS2's live `/hooks`
  table) and **Grok** under 1.5 s (DS12.TS4): the close runs no LLM work. On Codex
  0.163.0 the hook fires not at `/quit` — the TUI detaches from a thread that persists
  in the shared daemon — but when the daemon reaps the idle thread, thirty minutes
  later (CV21.DS4.US4, measured 2026-10-17). Until then the conversation is open and
  its runtime session `active`, meaning resumable: session maintenance treats such a
  session as not attended (`runtimePolicy.ts`, `sessionOutlivesTui`), closes the
  conversation as an idle orphan past `MIRROR_STALE_ORPHAN_MINUTES` (30) if the daemon
  never does, and deactivates the session; a prompt on a session whose conversation
  has ended binds a new conversation, so a `codex resume` does not write into a closed
  one; and a conversation already ended is not closed twice. It writes
  `ended_at`, marks the session inactive, backfills, flags the conversation
  `close_tail_pending`, and returns; the backup follows inside the bound. The next
  session start's maintenance, on any runtime, extracts the conversation
  (`extractPending`) and then finishes the tail (`Finished deferred close tails: N`,
  five per start, FIFO). A Codex conversation's memories, title, summary, and tags
  therefore arrive at the next session start, as Pi's do. `runtime diagnose` reports
  a flag older than a day.

On every runtime the session is marked inactive before any LLM work, so a tail cut
by the runtime's bound never leaves a session `active = 1` (the state behind
DS12.TS2 L9). The hook registrations carry no `timeout` for SessionEnd: there is
nothing left at exit worth holding the user's exit for.

**Pi** — does not have transcript access. Defers extraction to the next
`session-start`.

```
mirror conversation-logger session-end-pi <session_id>
```

**Antigravity** — has no session-end hook. The conversation closes by the
stale-orphan path at the next session start, as Codex's does (CV21.DS7.TS3),
and extraction follows the close.

```
mirror conversation-logger session-end-pi <session_id>
```

**Codex** — through the plugin, Codex runs the Claude-family hooks as they are
(CV21.DS12.TS2), prompts and replies included, with the deferred tail above
(CV21.DS4.TS2). The wiring v0.32.1 shipped — a wrapper script that backfilled
the session transcript from JSONL and then called `session-end-pi` — was
removed by CV21.DS4.TS5, and its JSONL import command retired with it.

A new runtime should use `session-end-pi` unless it can supply a transcript
path, in which case `session-end` gives immediate extraction.

---

## Optional: Runtime Status Line

Runtimes with a footer/status API may render Mirror's compact status line. When
the runtime has a stable session id, it should pass it so operating-mode status
is session-scoped rather than leaking across simultaneous sessions:

```bash
mirror welcome --status-line --session-id <session_id>
```

Fallback for runtimes without a session id:

```bash
mirror welcome --status-line
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
startup and after agent turns.

**Claude Code** shows it when the user wires it, once, as `statusLine.command` in
`~/.claude/settings.json`:

```bash
mirror welcome --status-line --session-id $CLAUDE_CODE_SESSION_ID
```

It is a user step because a plugin cannot carry a status line: on 2.1.296 a manifest
`statusLine` is ignored at load time and a plugin-root `settings.json` status line did
not show (CV21.DS12.TS1, static 3 and L7). Measured on Claude Code 2.1.310
(`~/.local/share/claude/versions/2.1.310`), 2026-10-24, through
[CV21.DS11's route](../../../project/roadmap/cv21-runtime-expansion-ii/cv21-ds11-contract-docs-refresh/route.sh)
with two sessions side by side, one of which ran `mirror build load` from the agent's
shell (CV21.DS11.US2):

- Claude Code runs the command at the start of a session and when the conversation
  changes, and gives it `CLAUDE_CODE_SESSION_ID`, equal on every run to the
  `session_id` in the JSON it writes to the command's stdin and to the session the
  plugin's hooks registered.
- With `--session-id`, each footer shows its own session's mode: `■ Builder Mode` in
  the session that activated it, `◌ Mirror Mode` in the other. Without it, neither
  footer shows Builder Mode, because the activation is bound to the session; a
  missing variable degrades to that unscoped line.
- The journey beside Mirror Mode is the global sticky journey, so a session that chose
  none shows the last one any session chose.
- Each run is one `mirror` process, 0.3 to 1.5 s on the Apple M3 Pro measured.

Codex, Antigravity, and Grok Build have no Mirror status line; they may ignore this
optional surface.

Operating mode lifecycle is explicit and lives in the core as an internal
surface for Mirror skills and runtime integrations. Session-aware runtimes should
pass `--session-id`; CLI-only callers may use the global fallback:

```bash
mirror mode --session-id <session_id> activate "Builder Mode" --journey <slug>
mirror mode --session-id <session_id> deactivate
```

Activation and deactivation are semantic operations that can be triggered by the
user through natural language or by Mirror through contained commands. Users are
never in "no mode": deactivating an explicit lens returns to Mirror Mode, while
journey context remains visible when it is still sticky inside the active
session. A new runtime session clears stale explicit mode and sticky journey
context so the next session starts from present intention, not accidental
continuity. Rendering and clearing runtime UI are internal effects.

## Optional: Mirror Mode Identity Injection

Mirror Mode runtimes put Mirror's context before the model before it answers, and
one decision in the core says what that context is: the doorman
(`ts/src/mirror/doorman.ts`, CV9.DS8). A runtime hands it the turn's prompt and its
session and passes on whatever it returns; the runtime decides nothing itself. This
is optional — a runtime that does not support Mirror Mode skips this entirely.

```
mirror mirror doorman --prompt "<the turn's prompt>" [--session-id <id>]
mirror mirror doorman --forget [--session-id <id>]
```

Given the prompt and the session's state, the doorman prints one of three answers:

1. **The full folder**, when the prompt opens with the Mirror skill's explicit form:
   what `mirror mirror load --query` builds from the question — the identity
   layers, the persona routed from it, the journey, the shadow patterns, and the
   memories and attachments relevant to it. The session is marked in Mirror Mode
   by its id.
2. **A delta**, on an ordinary turn while Mirror Mode is on: the section of a
   persona the prompt newly scores above threshold (`detectPersona`, a keyword
   score, no model call), which becomes the session's persona; up to five memories
   scoring at least 0.4 on the semantic score that the session has not been given
   yet; and the attachments scoring above 0.4. The identity layers are not
   repeated: they are already in the transcript. Without an embedding (no provider,
   or the call failed) the memories come from the lexical search and the
   attachments are skipped.
3. **Nothing**, when Mirror Mode is off, and on a skill invocation other than the
   Mirror form, which is a command, not a question (CR160's rule, held by the
   doorman since CV9.DS8.US5).

Mirror Mode is on for a session when its `mirror_active` flag is set **and** its
operating mode (the session's own, else the global record) is still Mirror Mode
(CV9.DS8.US4). `mirror mirror deactivate`, which `/mm-new` runs, clears the flag;
switching to Builder, Explorer, or Soul Mode in the same session changes the mode,
and the deltas stop. When the runtime compacts the transcript, `--forget` tells the
doorman the folder has left it: the next ordinary turn in Mirror Mode gets the full
folder again, and the list of memories already given starts over (CV9.DS8.US5).

Every block opens with one line the model reads, on every turn Mirror Mode is on,
even when nothing follows it. It says what was delivered and carries the signature
rule `AGENTS.md` states, `◇ persona-name`, across the conversation:

```text
=== mirror context delivered by the runtime for this turn: full — answer as the mirror; sign ◇ cfo ===
```

The `mm-mirror` skill loads the folder itself only when no such line arrived with
the turn, so an explicit turn loads once (CV9.DS8.TS3).

The session is the one the runtime names: `--session-id`, else `MIRROR_SESSION_ID`,
else `CLAUDE_CODE_SESSION_ID`, else `CODEX_SESSION_ID`. The doorman never guesses
one. On Pi, Claude Code, and Codex, a load the model runs by itself names the same
session from its shell's environment, so the doorman takes over from the next turn
(CV9.DS8.TS1). On Antigravity the model's own commands — a load, a mode switch —
cannot name the session yet
([CR169](../../../project/refinement/rs010-cv22-oracle-and-port-hygiene/cr169-on-agy-the-model-s-own-mirror-commands-cannot-name-the-session.md)).

The explicit form is read by one grammar (`ts/src/mirror/mirrorForm.ts`,
CV21.DS2.US7) in every runtime's spelling: `/mm:mirror`, `/mirror-mind:mm-mirror`,
`/mirror-mind:mm:mirror`, `$mirror-mind:mm:mirror`, `/mm-mirror`, and `$mm-mirror`,
followed by whitespace or the end of the prompt.

How each runtime reaches the doorman:

- **Claude Code** and **Codex** run it in process from the inject hook on
  `UserPromptSubmit` (`mirror-inject.sh` → `claude:inject`), with the payload's
  prompt and `session_id`, and return the block as the hook's context, which both
  read (CV9.DS8.US4).
- **Pi** runs the command from the extension's `before_agent_start`, awaited, and
  carries the block into the run as a `mirror-context` message; on
  `session_compact` it runs `--forget` (CV9.DS8.US5).
- **Antigravity** runs it in process from `PreInvocation` at `invocationNum == 0`
  (once per user turn), with the payload's `lastUserInput` and `conversationId`, and
  answers the block as one persistent `systemMessage` step. `SessionStart` turns
  Mirror Mode on and sets the refresh, so a conversation's first turn gets the full
  folder. A payload without `lastUserInput` (agy before 1.4.7) keeps the earlier
  injection: the whole folder every turn, from `mirror load --context-only`, as an
  `ephemeralMessage` (CV9.DS8.TS6).
- **Grok Build** registers the inject hook, which returns at once: Grok discards
  `UserPromptSubmit` context (CR143), so Mirror Mode there comes from the skill.

What a turn costs, and where it is counted, is in
[REFERENCE — The doorman](../../../../REFERENCE.md#the-doorman).

---

## Reference Implementations

### Claude Code

| Event | Hook wrapper | Node entry | Claude Code trigger |
|-------|--------------|------------|---------------------|
| Session start | `.claude/hooks/session-start.sh` | `claude:session-start` | `SessionStart` |
| User prompt | `.claude/hooks/log-user-prompt.sh` | `claude:user-prompt` | `UserPromptSubmit` |
| Mirror inject | `.claude/hooks/mirror-inject.sh` | `claude:inject` | `UserPromptSubmit` |
| Assistant reply | `.claude/hooks/log-assistant-reply.sh` | `claude:stop` | `Stop` |
| Session end + backup | `.claude/hooks/log-session-end.sh` | `claude:session-end` | `SessionEnd` |

Hook wrappers are registered in `.claude/settings.json`, whose allowlist grants
nothing under `ts/src/hooks` and never a bare `node *`, which would be an
auto-approved arbitrary-execution grant. The packaged plugin carries the same
five hooks under `plugins/mirror-mind/hooks/`, registered in its `hooks.json`,
in the wrapper form that finds the installed `mirror-hook` instead of a tree
(see [Installed package wiring](#installed-package-wiring)). Every command in
both files quotes its root variable (`"${CLAUDE_PLUGIN_ROOT}/…"`,
`"$CLAUDE_PROJECT_DIR/…"`), and every `timeout` is in seconds, which is how
Claude Code and Grok read it (CV21.DS2.TS5).

The same five hooks run as they are on Codex and Grok, which install the
plugin natively (CV21.DS12). They detect the runtime they are in
(`ts/src/hooks/runtimeDetection.ts`: Grok's `GROK_HOOK_EVENT` /
`GROK_SESSION_ID` or its camelCase `hookEventName`; Codex's `turn_id`; Claude
Code otherwise) and label the session `claude_code`, `codex`, or `grok_build`.
Opening this checkout in Grok runs the checkout's `.claude/settings.json`
hooks too, once the project is trusted (CV21.DS2.US8). Its
`SessionStart` hook also returns the Operating Instructions (`AGENTS.md` from
the tree the hook runs from) as `hookSpecificOutput.additionalContext`, unless
the project the session opened in is that same tree — the checkout, whose
`CLAUDE.md` imports the file (US3, D13).

Claude Code reads a project's own `AGENTS.md` by itself only when the project has no
`CLAUDE.md`. Beside a `CLAUDE.md`, the file reaches the model only if `CLAUDE.md`
imports it (`@AGENTS.md`). The project's files arrive in the conversation among the
project instructions ("Contents of …/AGENTS.md (project instructions, checked into
the codebase)"), and Mirror's Operating Instructions in the system prompt, from the
plugin's `SessionStart` hook: both reach the model, one copy each, and Mirror claims
no precedence between them. In this repository's checkout, the import brings the Operating
Instructions in and the tree's hook withholds its copy, so they arrive once, 3,410
input tokens on `claude-haiku-5-5`; without the import they would not arrive at all.
Read from the API request blobs each session's transcript records, on Claude Code
2.1.310, 2026-10-24 (CV21.DS11.TS3). DS12.TS1 L8 first saw the native read on 2.1.296,
in a folder with no `CLAUDE.md`.

External skills reach Claude Code at home level through the per-home extensions
plugin, linked once into `~/.claude/skills/mirror-ext-<user>` and read in place
([each runtime's path](#how-an-installed-extension-reaches-each-runtime)). A project
can also carry a copy of its own:
- project the home's installed Claude external skills into a project-local
  `.claude/skills/` surface with:

```bash
mirror extensions expose-claude \
  --mirror-home ~/.mirror-minds/<user> \
  --target-root /path/to/project
```

- remove the projected Claude external skill surface later with:

```bash
mirror extensions clean-claude \
  --target-root /path/to/project
```

`--target-root` is mandatory for both commands. Claude projection is an explicit
project operation, never an implicit write to the current working directory.

This creates project-visible skill directories such as:

```text
/path/to/project/.claude/skills/ext-review-copy/SKILL.md
/path/to/project/.claude/skills/extensions.external.json
```

#### Claude Code's login in isolated routes

Claude Code keys its login to the config directory and to `HOME`. A logged-in scratch
`CLAUDE_CONFIG_DIR` answers under the real `HOME` and "Not logged in" under a scratch
one, and `/tmp/…` and `/private/tmp/…` are two logins. Measured on claude 2.1.296
([CV21.DS5.TS1](../../../project/decisions.md#user-extensions-reach-every-runtime-as-a-per-home-plugin));
CV21.DS5.US3's Claude cell relied on it on 2.1.304. A route that isolates Claude Code
therefore keeps the real `HOME` with a logged-in scratch config directory, and that
scratch login leaves a `Claude Code-credentials-<hash>` entry in the login keychain,
to remove when the route is done.

### Pi

| Event | Extension file | Pi trigger |
|-------|---------------|------------|
| Session start | `.pi/extensions/mirror-logger.ts` | `session_start` |
| User prompt | `.pi/extensions/mirror-logger.ts` | `input`, then `before_agent_start` |
| Assistant response | `.pi/extensions/mirror-logger.ts` | `agent_end`, then `agent_settled` |
| Session end + backup | `.pi/extensions/mirror-logger.ts` | `session_shutdown` |
| Mirror load | `.pi/skills/mm-mirror/SKILL.md` | `/mm-mirror` skill invocation |

#### Invoking a skill on Pi

Measured on Pi 1.4.0, 2026-10-22, in a scratch home
([CR159](../../../project/refinement/rs010-cv22-oracle-and-port-hygiene/cr159-pi-skills-are-spelled-by-their-bare-name-and-step-7a-lost-two-dashes.md)).
Pi registers each skill as the command `/skill:<name>` and lists it in its command
menu under that name, matched as the person types `/mm-`. Picking it sends
`/skill:mm-<skill>`, which Pi expands into the skill's body before the model or the
extension sees the prompt; the skill runs. A prompt that only names the skill,
`/mm-<skill>` sent as typed, is not a Pi command: it reaches the model as text, and in
the one turn measured the model read the skill by its name and ran it. So the docs give
a person the `/mm-` form, which finds the skill in the menu, and give the model the
skill's name. Since
[CR160](../../../project/refinement/rs010-cv22-oracle-and-port-hygiene/cr160-a-pi-skill-invoked-as-skill-is-logged-as-its-body.md)
the extension logs what was typed, not what Pi expanded: a skill invocation, from the
menu or typed, is not recorded, and neither is its reply; a Mirror question in either
form (`/mm-mirror …`, `/skill:mm-mirror …`) is recorded as the question, with one
reply. CR160's route measured both sides on Pi 1.4.0. `mirror conversations
skill-turns` repairs what earlier versions stored.

### Antigravity

| Event | Hook wrapper | Node entry | agy trigger |
|-------|--------------|------------|-------------|
| Session start (logging on, Mirror Mode on) | `plugins/mirror-mind/agy/session-start.sh` | `agy:session-start` | `SessionStart` |
| Mirror inject, once per turn | `plugins/mirror-mind/agy/pre-invocation.sh` | `agy:pre-invocation` | `PreInvocation` (`invocationNum == 0`) |
| Turn logging from the transcript | `plugins/mirror-mind/agy/stop.sh` | `agy:stop` | `Stop` |

Hook files are registered in the plugin's `hooks.json`, in agy's schema, and
staged with the plugin by `agy plugin install`. Payloads are camelCase
protojson and carry no text: the session id is `conversationId`, and the
`Stop` handler reads the transcript JSONL for the turn (CV21.DS7.TS3). The
Operating Instructions reach the model as `rules/AGENTS.md`, merged into the
active rule set. Skills are the plugin's, as `mm:*`, invoked as
`/mirror-mind:mm:<skill>` (CV21.DS7.US4, agy 1.4.2).

### Codex

| Event | Mechanism | Codex trigger |
|-------|-----------|---------------|
| Session start | plugin `SessionStart` hook | Session start |
| User prompt | plugin `UserPromptSubmit` hooks | Each prompt |
| Assistant response | plugin `Stop` hook | Each reply |
| Session end + backup | plugin `SessionEnd` hook, with the deferred tail and the stale-orphan fallback close | Daemon reaps the idle thread |
| Mirror load | `SessionStart` context + `$mm-mirror` skill | Explicit invocation |

Codex installs the shipped plugin from the package's marketplace
(`codex plugin marketplace add "<pkg>"`, then
`codex plugin add mirror-mind@mirror-mind`; CV21.DS4.US1) and runs its
Claude-family hooks as they are (CV21.DS12.TS2), measured live at L4
(CV21.DS4.US4). Runtime detection reads Codex's `turn_id` from the hook
payload and labels the session `codex`. On 0.163.0 sessions outlive the TUI
and `SessionEnd` fires only when the daemon reaps the idle thread, so session
maintenance's stale-orphan close (`MIRROR_STALE_ORPHAN_MINUTES`) is the
fallback. The plugin's `SessionStart` hook delivers the Operating
Instructions as a developer message, and Mirror Mode is activated through the
plugin's skills, which Codex spells `$mm-*` — for example `$mm-build mirror`.
(In a checkout, the shared surface at `.agents/skills/mm-*/SKILL.md` serves
the same skills.) The wrapper-script wiring v0.32.1 shipped was removed by
CV21.DS4.TS5.

### Grok Build

| Event | Mechanism | Grok trigger |
|-------|-----------|--------------|
| Session start | plugin `SessionStart` hook (its `additionalContext` is discarded; the Operating Instructions arrive as the home-level rule) | Session start |
| User prompt | plugin `UserPromptSubmit` hooks: the logger logs the prompt; the inject hook returns at once, since Grok discards prompt context (CR143) | Each prompt |
| Assistant response | plugin `Stop` hook; Grok also fires a Stop at session end, which adds nothing | Each reply, and session end |
| Session end + backup | plugin `SessionEnd` hook under Grok's 1.5 s bound, with the deferred tail | TUI quit, or the headless process ending |
| Mirror load | the `/mm-mirror` skill, explicit | Explicit invocation |

Grok Build installs the shipped plugin as a trusted copy —
`grok plugin install "<pkg>/plugins/mirror-mind" --trust`, under
`~/.grok/installed-plugins/` — and takes the Operating Instructions from a
home-level rule, `ln -s "<pkg>/AGENTS.md" ~/.grok/rules/mirror-mind.md`, the two
steps `mirror init` prints (CV21.DS10.US1, grok 1.0.62). Grok reads the plugin's
root `plugin.json` first and alone, so that marker carries the manifest's
`version` and `mcpServers`. It runs the plugin's Claude-family hooks as they are
(DS12.TS4 L1); runtime detection reads `GROK_HOOK_EVENT`/`GROK_SESSION_ID` from
the hook's environment or the camelCase `hookEventName` from the payload and
labels the session `grok_build`; the turn id is `promptId`, the reply
`lastAssistantMessage`. Grok fires a Stop at session end beyond each turn's own
(two for one turn, five for four), which the Stop hook ignores as a repeat.
Grok's guide gives a `SessionEnd` hook 1.5 s by default, a plugin's hook at most
that default whatever its own `timeout`, and exit at most 10 s for all of them;
the shared hook closes without its LLM tail and the next session start finishes
it (CV21.DS4.TS2) — measured on 1.0.62: `ended_at` 213–259 ms after SessionEnd,
the backup written, the tail finished at the next start with a key
(CV21.DS10.US3). The MCP server attaches to every session (CV21.DS10.TS2); the
model reaches its seven tools as `mirror-mind__<tool>` through Grok's
`search_tool` and `use_tool` meta-tools, and the session-start count and the
headless `init` snapshot are taken while the server is still `pending`. What
Grok does not do: a SessionStart `systemMessage` is shown on screen only and
`additionalContext` is ignored on both events (DS12.TS4 L2/L3; US3 on 1.0.62,
by a canary the probe hook emitted and the model never saw), so nothing is
injected per turn and Mirror Mode lasts as long as the skill's own instructions
do. Skills are the plugin's in Pi's spelling, `/mm-mirror`, qualified by the
plugin's name only when a name collides. Honest parity **L3**: grok 1.0.62
(1474f9cbdd91), 2026-10-18.

### Node resolution for hook runtimes

A runtime spawns its hooks with the `PATH` it was launched with, and a runtime
launched from the desktop often does not have the one that holds `node`. Each
hook wrapper therefore resolves Node explicitly, in this order: `$MIRROR_NODE`,
`command -v node`, the directory the Mirror entry was found in (an npm global
bin holds the `node` that installed the package beside `mirror-hook`, while a
system `/usr/local/bin/node` can be years older), `~/.nvm/current/bin/node`,
`/opt/homebrew/bin/node`, `/usr/local/bin/node`. A wrapper that finds
none writes one line to `<mirror home>/hooks.log` and exits 0: it skips the
hook, never fails the turn, and is never silent. The Node it finds must be 24
or later. An older one fails before the hook starts, and the wrapper records
that exit the same way. The wrapper passes no flag: the entry reads
configuration and silences its own warnings (US3, D3). The log's home is
resolved as the core resolves it: `MIRROR_HOME`, else `MIRROR_USER`, from the
environment, else from the tree's `.env` when the wrapper is in a tree, else
from `~/.config/mirror/env`.

`runtime diagnose` reports when Node is not resolvable from its own
environment. That environment is a terminal's, not the runtime's, so it also
reports the failures `hooks.log` recorded in the last seven days
(`hook_failures_recorded`). (The Python hooks could end in `|| true` safely,
because `/usr/bin/python3` is on every macOS; the same silence here would hide
a new failure.)

The generator writes two wrapper forms (US3, D5), which differ only in how
the entry is found and `hooks.test.ts` asserts that:

- **tree** — `.claude/hooks/`: the
  wrapper resolves its tree from its own file (`$BASH_SOURCE`) by a fixed
  depth, never from the working directory, and runs that tree's
  `bin/mirror-hook.js`. The tree is a checkout or the installed package; the
  depth is the same in both.
- **bin** — `plugins/mirror-mind/hooks/`: Claude Code copies a plugin into its
  own cache, so no relative path reaches a tree. The wrapper finds the
  installed `mirror-hook`: `$MIRROR_BIN/mirror-hook` (the directory holding
  Mirror's bins, `$(npm prefix -g)/bin`, the same trust class as
  `MIRROR_NODE`), then `command -v mirror-hook`, then `~/.nvm/current/bin`,
  `/opt/homebrew/bin`, `/usr/local/bin`. None found: one `hooks.log` line
  naming `npm install -g mirror-mind` and `MIRROR_BIN`, exit 0. The plugin's
  MCP entry (`/bin/sh -c <locator>` in the manifest, generated by
  `buildManifest`; CV21.DS2.US6) finds `mirror` the same way and runs
  `mirror mcp`; a server that cannot start has no turn to protect, so it says
  why in one line on stderr and exits 1. The entry names no
  `${CLAUDE_PLUGIN_ROOT}`, so Codex, which does not expand it in an MCP
  command, starts it too.

Both forms run the bin rather than `ts/src/hooks/main.ts` directly: under
`npm root -g` every wrapper sits below `node_modules`, where Node will not
strip types (US3, D15).

### Installed package wiring

An `npm install -g mirror-mind` puts `mirror` and `mirror-hook` on the `PATH`
and the whole runtime subset under `$(npm root -g)/mirror-mind`, with the same
paths as a checkout (US3, D2). `mirror init` prints the steps below for each
runtime it finds on the `PATH`, with that path filled in; each was verified at
US3 plateau 3 against the runtime's own documentation or, where the docs were
silent, against the runtime itself from a scratch configuration directory.

| Runtime | Steps | Wiring | Operating Instructions (D13) |
|---------|-------|--------|------------------------------|
| Pi | 1 | `pi install "<pkg>"` — a local-path package, loaded in place (D6) | the extension appends `<pkg>/AGENTS.md` to the system prompt's context files when Pi did not load it from the cwd |
| Claude Code | 1 | `mkdir -p ~/.claude/skills && ln -s "<pkg>/plugins/mirror-mind" ~/.claude/skills/mirror-mind` — a skills-directory plugin, loaded every session with its skills, hooks, and MCP server (`claude plugin list`, 2.1.283) | the plugin's `SessionStart` hook, as `additionalContext` |
| Codex | 2 | `codex plugin marketplace add "<pkg>"` (the package root carries `.agents/plugins/marketplace.json`, one local plugin), then `codex plugin add mirror-mind@mirror-mind`, which copies the plugin into Codex's cache at the plugin's version; Codex asks once to trust its hooks (0.162.1, CV21.DS12.TS2 static 5-7 and L1; CV21.DS4.US1). The pre-plugin wiring (a skills link, an `AGENTS.md` link, and a wrapper script around each session) was removed by DS4.TS5 | the plugin's `SessionStart` hook, delivered as a developer message (TS2 L4) |
| Antigravity | 1 | `agy plugin install "<pkg>/plugins/mirror-mind"` — agy treats the directory as a native plugin (the root `plugin.json` marker; probed on agy 1.4.2, CV21.DS7.US1) and stages the 25 skills, the agy-schema `hooks.json`, `mcp_config.json`, and `rules/AGENTS.md` under `~/.gemini/config/plugins/`. Per-turn injection and logging from the transcript landed with DS7.TS2/TS3; measured at L4 in DS7.US4. The staged copy is agy's own: an update leaves it at the version it was installed at, and the same command again replaces it, so a copy behind the install is `agy_plugin_copy_behind` in `runtime diagnose`, and `runtime update` names the command after an update lands (agy 1.4.7, 2026-10-24, CV21.DS11.TS4) | `rules/AGENTS.md`, merged into the active rule set |
| Grok Build | 2 | `grok plugin install "<pkg>/plugins/mirror-mind" --trust`, then `ln -s "<pkg>/AGENTS.md" ~/.grok/rules/mirror-mind.md` (grok 1.0.62, CV21.DS10.US1). The install copies the plugin to `~/.grok/installed-plugins/<name>-<hash of the path string>/` and writes `[plugins] enabled` to `~/.grok/config.toml`; `--trust` activates its hooks and MCP server with no prompt left. Grok reads the root `plugin.json` marker first and alone, so the marker carries the manifest's `version` and `mcpServers` (without them Grok listed neither). `grok plugin update` is a no-op for a local-path copy, an install over the same path is refused, and a differently spelt path installs a second copy: the level-up is uninstall, then install with the printed path, which `runtime diagnose` and `runtime update` name. Not chosen: the Claude link alone (skills, no hooks, no MCP) and a link in `~/.grok/plugins/` (loads nothing until `[plugins] enabled` is hand-written). The server attaches to the session (CV21.DS10.TS2, headless on 1.0.62): `grok mcp doctor` handshakes with 7 tools, and the model reaches them as `mirror-mind__<tool>` through Grok's `search_tool`/`use_tool` meta-tools — `use_tool mirror-mind__list_journeys` answered. The `init` snapshot and the session-start `mcp_server_count` are taken before the handshake completes (`pending`), which is what DS12.TS4 L6 read as non-attachment | the home-level rule, loaded in every project as `global`, ~2,233 tokens by Grok's count. The plugin's SessionStart hook delivers them as `additionalContext` on Claude Code and Codex; Grok shows a SessionStart `systemMessage` on screen only (DS12.TS4 L2) |

Inside the checkout none of this applies: Pi discovers `.pi/` as project
resources, `.claude/settings.json` registers the tree wrappers, `.agents/skills/` carries the skills, and `CLAUDE.md` imports
`AGENTS.md`. A developer puts `mirror` on the `PATH` with `npm link` once at
the repository root; the Pi extension says so at session start when it does
not resolve.

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

`mirror extensions install` writes one such root for every key of the manifest's
`runtimes:` map. Two are read: `pi`, by Pi's extension at session start, and `claude`,
by the per-home plugin generator, which carries it to Claude Code, Codex, Antigravity,
and Grok Build ([below](#the-per-home-extensions-plugin-claude-code-codex-antigravity-grok-build)).
A root for any other key is validated and written, and no runtime reads it.

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

### The per-home extensions plugin (Claude Code, Codex, Antigravity, Grok Build)

Since CV21.DS5.US2 the four plugin runtimes take a home's extensions as **one
generated plugin per Mirror home**, in the canonical plugin's format
([DS5.TS1's decision](../../../project/decisions.md#user-extensions-reach-every-runtime-as-a-per-home-plugin)):

```text
~/.mirror-minds/<user>/runtime/plugin/
  .agents/plugins/marketplace.json        the Codex marketplace, named mirror-ext-<user>
  mirror-ext-<user>/
    .claude-plugin/plugin.json             name, version, description — no hooks, no MCP server
    plugin.json                            the root marker Grok and agy read
    skills/<dir>/SKILL.md                  each installed extension's `claude` skill, verbatim
```

- `mirror extensions install`, `uninstall`, and `sync` regenerate it from the home's
  `claude` catalog (`runtime/skills/claude/extensions.json`), so it carries exactly
  what `expose-claude` would expose; an extension declaring no `claude` block is not
  in it. The directory is replaced atomically, and holds only regular files.
- **Version:** `0.1.<generation>`, advanced by one when the tree changes (an
  extension added, changed, or removed) and held when it does not. Codex keys its
  cache by it; `runtime diagnose` compares it, and for this plugin a copy at any
  other version is stale.
- **Wiring, once per runtime**: one step for each runtime on the `PATH` that has not
  taken the plugin, printed by the `extensions` verbs (`mirror init` prints none: there
  is no plugin at init). Claude Code reads the plugin in place through a link; Grok
  Build's `--trust` has nothing to activate, since the plugin carries skills only. The
  steps are in [the table below](#how-an-installed-extension-reaches-each-runtime).
- **After a change**, the three runtimes that copy a plugin, Codex, Antigravity, and
  Grok Build, hold a stale copy until their reinstall, one command each
  ([the table below](#how-an-installed-extension-reaches-each-runtime)). The
  `extensions` verbs print the one a runtime needs; `runtime diagnose` raises
  `ext_plugin_codex_cache_stale`, `ext_plugin_agy_copy_stale`,
  `ext_plugin_grok_copy_stale`, `ext_plugin_claude_link_dangling`, and
  `ext_plugin_grok_copies_duplicated`, each with the command as its repair route.
  A runtime not wired, and a runtime off the `PATH`, are not drift.
- `runtime status` prints `Extensions plugin: mirror-ext-<user> <version> (<n> skills)`
  when the home has one.

Pi keeps its catalog path below; the plugin does not change it.

### How an installed extension reaches each runtime

How each of the five runtimes takes a home's installed extension (CV21.DS5). The
wiring step is the one `mirror extensions install` prints for a runtime on the `PATH`
that has not taken the plugin; `<home>` is the Mirror home and `<user>` its user.
The invocations were measured live by
[CV21.DS5.US3](../../../project/roadmap/cv21-runtime-expansion-ii/cv21-ds5-user-extensions-on-every-runtime/cv21-ds5-us3-review-copy-runs-on-every-runtime-measured-live/test-guide.md)
with `review-copy` and a `command-skill`, from the registry's `mirror-mind@0.36.0`.

| Runtime | What reads the extension | Wire once | After a change | You type |
|---|---|---|---|---|
| Pi | `runtime/skills/pi/extensions.json`, at session start ([below](#pi-runtime-consumption-prep)) | nothing beyond the package's own `pi install` | nothing: the next session reads the catalog | `/ext-review-copy`, which Pi's menu lists as `skill:ext-review-copy`, as it lists every skill ([on Pi](#invoking-a-skill-on-pi)) |
| Claude Code | the plugin, through a link read in place | `mkdir -p ~/.claude/skills && ln -s "<home>/runtime/plugin/mirror-ext-<user>" ~/.claude/skills/mirror-ext-<user>` | nothing: read in place | `/ext-review-copy` |
| Codex | a copy of the plugin, cached by its version | `codex plugin marketplace add "<home>/runtime/plugin"`, then `codex plugin add mirror-ext-<user>@mirror-ext-<user>` | `codex plugin add mirror-ext-<user>@mirror-ext-<user>` again | `$mirror-ext-<user>:ext-review-copy` |
| Antigravity | a copy, staged under `~/.gemini/config/plugins/mirror-ext-<user>/` | `agy plugin install "<home>/runtime/plugin/mirror-ext-<user>"` | the same command again | `/mirror-ext-<user>:ext-review-copy` |
| Grok Build | a copy of the plugin | `grok plugin install "<home>/runtime/plugin/mirror-ext-<user>" --trust` | `grok plugin uninstall mirror-ext-<user> --confirm && grok plugin install "<home>/runtime/plugin/mirror-ext-<user>" --trust` | `/ext-review-copy` |

Measured on claude 2.1.304 (`~/.local/share/claude/versions/2.1.304`), codex 0.163.0
(`/opt/homebrew/Caskroom/codex/0.163.0/bin/codex`), agy 1.4.3 (`~/.local/bin/agy`), and
grok 1.0.62 (`~/.grok/downloads/grok-1.0.62-macos-aarch64`), on 2026-10-20. A
`command-skill`'s subcommands are the same `mirror ext <id> <subcommand>` on every
runtime: the authoring guide's `hello` pinged from each, as `/ext-hello`,
`$mirror-ext-<user>:ext-hello`, and `/mirror-ext-<user>:ext-hello`. On the four plugin
runtimes a skill invocation is a command turn, which the logger does not record as a
conversation (by design, CV21.DS4.TS3). Under `codex exec`, the plugin's hooks log the
prompt only
([CR152](../../../project/refinement/rs010-cv22-oracle-and-port-hygiene/cr152-under-codex-exec-the-plugin-s-stop-and-session-end-hooks-never-reach-mirror.md),
open).

**When a skill is not listed.** A runtime that was never wired is not drift, and
`runtime diagnose` does not report it: run the step the install printed for that
runtime, and run the install again to see it again. After a change, `runtime diagnose`
names the reinstall a copying runtime still needs, and a link whose target is gone.

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

## Security Posture And Abuse Cases

Recorded by the RS005 security audit (CR032). The protected asset is a person:
identity, memories, journal, and conversations in one SQLite file, mutated by
commands that AI agents can invoke.

### Identity poisoning (the signature attack)

`identity set` overwrites identity content for any `(layer, key)` — and
identity content feeds **future system prompts**. A manipulated agent (prompt
injection arriving through conversation content, a poisoned document, or a
malicious skill) that reaches `identity set` achieves persistent injection:
instructions written into the soul/ego layers survive across sessions and
runtimes, shaping every later response.

**Current mitigations, honestly stated:** runtime tool-permission gates (the
agent asks before running commands), `mm-identity` being user-invocable rather
than ambient, and the pre-write snapshot (`backups/frontdoor-pre-write-
backup.db`) which can rewind the most recent routed write.

**Known limits:** identity mutations leave no forensic trail — identity
storage has no audit, provenance, or history mechanism; an overwrite is silent
except `updated_at`. The snapshot is overwritten by the *next* routed write,
so detection must be prompt for the undo to help.

**Direction:** the front-door log records `command + layer/key + route` —
never content (see the CV22 index, Security Riders) — as the interim trail;
mutation provenance (session id, source runtime, timestamp) is a post-CV22
schema consideration, gated on the DS6 schema-custody transfer.

### Journey-path redirection

`journey set-path` writes `project_path` into journey metadata; Builder later
treats that directory as the working project. An attacker-influenced set-path
can point a journey at a sensitive directory, which the agent then reads and
summarizes in-session. Mitigations: the same tool-permission gates, and the
path being normalized and echoed on write (stderr) so redirection is visible.

### Content-mediated injection routes

Everything the extraction pipeline stores (memories, titles, tags) re-enters
future context windows. Poisoned conversation content can therefore attempt
delayed injection through stored memories. This is inherent to the product
category; the mitigations are the identity/memory layer separation (memories
inform, identity *instructs*) and human review surfaces (`mm-memories`,
consolidation, shadow cultivation). Treat any design that auto-promotes
memory content into identity as crossing a security boundary requiring
explicit review.

## CLI Reference

Every command runs through the front door. From the repository root, with the
[`mirror` alias](../../../../REFERENCE.md#running-a-command) defined:

```
mirror conversation-logger session-start
mirror conversation-logger user-prompt --interface <name>   # payload on stdin, or --payload <json>
mirror conversation-logger stop --interface <name>          # likewise
mirror conversation-logger log-user <session_id> <prompt> --interface <name>        # one more release (CR160)
mirror conversation-logger log-assistant <session_id> <content> --interface <name>  # one more release (CR160)
mirror conversation-logger session-end          # reads JSON from stdin
mirror conversation-logger session-end-pi <id>  # explicit session id, deferred extraction
mirror mirror load --context-only --query <q> [--persona <p>] [--journey <j>] [--org] [--session-id <id>]
mirror mirror doorman --prompt <p> [--session-id <id>]   # the one doorman: the block, or nothing
mirror mirror doorman --forget [--session-id <id>]       # the runtime compacted the transcript
mirror backup --silent
```

In a hook or a skill, spell out the invocation the alias stands for (see the
top of this document).

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

**In practice:** redirect all front-door output to `/dev/null` or `2>/dev/null`,
never to stdout.

```bash
# Correct
mirror conversation-logger session-start >/dev/null 2>&1 || true
echo '{}'

# Wrong — status line leaks to stdout before the JSON
mirror conversation-logger session-start 2>/dev/null
echo '{}'
```

Found live in the Gemini CLI integration (retired by CV21.DS8). Its hook
entries kept the rule by construction: they printed exactly one JSON object,
and everything else went to stderr or the hook log. Claude Code's `Stop` hook does not use a
JSON envelope, so this class of bug was invisible there until Gemini CLI exposed
the constraint.

---

### Session ID delivery

| Runtime | Session ID source |
|---|---|
| Claude Code | `session_id` field in JSON stdin |
| Antigravity | `conversationId` in JSON stdin (camelCase protojson) |
| Grok Build | `sessionId` in JSON stdin (camelCase), or `GROK_SESSION_ID` in the hook's environment |
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
| Deferred | `session-end-pi <session_id>` | Pi, Codex, Antigravity | Resilient to best-effort session end or a runtime with no session-end signal; extraction at next session start |
| Deferred, from the shared hook | `session-end --interface grok_build` (the Claude-family hook closing without its LLM tail, CV21.DS4.TS2) | Grok Build (Codex likewise) | The close fits the runtime's 1.5 s bound; the tail at the next session start |

Use **immediate** when the runtime can supply a `transcript_path` at session end.
Use **deferred** when session end is best-effort or the runtime lacks transcript access.

For new runtimes: inspect whether the runtime provides a stable transcript path
at session end. If yes, `session-end` gives better extraction timing. If no,
`session-end-pi` is the safe default.

---

### Mirror Mode injection models

| Model | Mechanism | Runtimes | UX |
|---|---|---|---|
| The one doorman | An event that runs before the model answers hands the turn's prompt and session to the doorman and carries its block: the inject hook on `UserPromptSubmit`, as the hook's context (Claude Code and Codex, CV9.DS8.US4); the extension's `before_agent_start`, as a `mirror-context` message (Pi, US5); `PreInvocation` at `invocationNum == 0`, as a persistent `systemMessage` step (Antigravity, TS6) | Pi, Claude Code, Codex, Antigravity | The full folder on the turn Mirror Mode starts, then the persona and memories each question calls for, with no further action; no model call outside Mirror Mode |
| Explicit invocation, the hook inert | The `UserPromptSubmit` inject hook is registered but returns at once: Grok discards prompt context (`runtimeReadsPromptContext`, CR143) | Grok Build | No runtime cost; the model loads Mirror's context itself through `/mm-mirror`, and the Operating Instructions arrive as a home-level rule, not per turn |

For a new runtime with an event that runs before the model answers and can carry
context: hand the doorman the turn's prompt and the runtime's session id
(`mirror mirror doorman --prompt <p> --session-id <id>`, or in process from a hook
that runs the core) and give the model whatever it prints. Do not check Mirror Mode
in the adapter: the doorman reads the session and prints nothing when Mirror Mode is
off. If the runtime compacts its transcript, run `--forget` when it does.

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
The path resolver refuses when the `MIRROR_HOME` basename does not match
`MIRROR_USER`.

Standard smoke test structure:

1. Record production DB checksum before the test
2. Set `DB_PATH` to an isolated temporary path
3. Simulate each lifecycle hook with a representative payload
4. Inspect the isolated DB: verify `interface='<runtime>'` rows and message content
5. Confirm production DB checksum unchanged after the test

Claude Code's login does not follow a scratch `HOME`; see
[Claude Code's login in isolated routes](#claude-codes-login-in-isolated-routes).

References: `scripts/smoke_claude_plugin.sh`, `scripts/smoke_mirror_mcp.sh`

---

### Skill sharing (SKILL.md-native runtimes)

Runtimes that discover SKILL.md natively can share Mirror Mind's skill surface
via symlinks. Pi owns the source skill files in `.pi/skills/`; a Codex
checkout reads one project-local surface at `.agents/skills/`:

```bash
# From .agents/skills/
ln -sf ../../.pi/skills/mm-mirror mm-mirror
```

This creates one source of truth: updating a Pi skill automatically updates the
Codex checkout surface. Do not create a second project-local surface for a
runtime that can read `.agents/skills/`: it creates duplicate/conflicting
skills. The discovery format can be shared even when invocation syntax differs:
Pi uses `/mm-*`, while Codex uses `$mm-*`.

Claude Code does not read the links. It reads `.claude/skills/mm-*/` in a
checkout, and the same files inside the packaged plugin:
`node ts/scripts/buildClaudePlugin.ts` copies `.claude/skills/` into
`plugins/mirror-mind/skills/`, and `npm test` fails when that copy is out of
date. Most Claude copies are written separately from Pi's, because they carry
Claude Code's own Usage and session lines. A Pi-sourced skill has one body
instead. The same command generates its Claude copy from `.pi/skills/`, and
only the frontmatter `name` changes, to the Claude Code form (`mm:build`). The
list lives in `ts/src/guards/piSourcedSkills.ts`, and today it holds `mm-build`
([decision](../../../project/decisions.md#builder-modes-skill-has-one-body-in-every-runtime)).

---

### Interface label

`interface` is a free-text field. Passing `--interface <runtime_name>` is all
that is needed. No migration is required to add a new runtime label.

Established labels: `claude_code`, `pi`, `codex`, `antigravity`, `grok_build`;
`gemini_cli` persists on conversations logged before CV21.DS8 retired the
runtime, and stays readable.

---

**See also:** [CV2 Runtime Portability](../../../project/roadmap/cv2-runtime-portability/index.md) · [Briefing](../../../project/briefing.md) · [CV8.E4 Runtime Adapter Hardening](../../../project/roadmap/cv8-runtime-expansion/cv8-e4-runtime-adapter-hardening/index.md)
