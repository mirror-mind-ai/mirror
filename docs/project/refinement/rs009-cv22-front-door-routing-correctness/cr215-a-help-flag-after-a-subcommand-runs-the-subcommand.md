[< RS009](index.md) · [Canonical status](../index.md#change-requests)

# CR215 · A help flag after a subcommand runs the subcommand: `tasks delete <id> --help` deletes the task

## Problem

Routing answers `-h`/`--help` only where it stands in the subcommand's place
(`answerUsage` in `ts/src/frontDoor/usage.ts`): `mirror tasks --help` prints the family's
usage line. A help flag anywhere after a subcommand reaches the subcommand, and most
subcommands read only the options they know and drop the rest, or take `--help` as a
positional. The subcommand runs.

PR #60 (issue #58) closed this for the `runtime` family, where `runtime update --help`
performed an update. Every other family still has it, and a family-less command such as
`seed` or `journal` has it too: there is no subcommand, so the help flag is the first
argument the command reads.

[CR109](cr109-mirror-log-help-records-help-and-renames-the-conversation.md) is one
instance, `mirror log --help`. This CR is the class.

The `build` family does not have it: its parser refuses an argument it does not know
(`build load: unrecognized argument --help`, exit 2). Neither do `backup`,
`repair-encoding`, and `inspect llm-calls` / `embedding-provenance`. They refuse instead
of answering, but they run nothing.

## Expected Behavior

- `-h` or `--help` anywhere among a command's arguments answers that command's usage on
  stdout with exit 0, and runs nothing: no write, no model call, no spawn, no network.
- This holds for every family and every family-less command, through one rule in the
  front door, so a subcommand added later is covered without anyone remembering to.
- A command that refuses `--help` today answers it instead. Refusing is safe; answering is
  what the flag asks for.

## Impact

Agents probe commands with `--help`; that is how CR109 happened twice in one day. A user
does it before running something unfamiliar, which is the moment the command must not
run. Most of the commands below run silently: exit 0, a plausible line, and a record
changed, deleted, or created.

- **Destroys:** `tasks delete <id> --help` deletes the task; `conversation-logger
  discard-current --help` discards the current conversation.
- **Changes state:** `identity set …  --help` writes identity; `journey update <slug>
  <text> --help` and `journey set-path <slug> <path> --help` rewrite the journey;
  `conversation-logger repair-journeys --apply --help` applies repairs; `seed --help`
  seeds; `mode activate --help` activates a mode named `--help`;
  `conversation-logger mute --help` stops logging; `conversation-logger switch --help`
  starts a new conversation; `mirror load --help` and `explore deactivate --help` move
  the operating mode.
- **Records `--help` as content:** `tasks add --help` creates a task titled `--help`;
  `mirror log --help` (CR109); `journal --help` would record a journal entry.
- **Spends money:** `journal`, `week plan`, `descriptor generate`, `consolidate scan`,
  `consolidate apply <id>`, and `shadow scan` call OpenRouter. `consolidate apply
  <id> --help` wrote to the database before its call failed.

The rest answer something other than help: a listing, a status, or `'--help' not found`.
They are harmless but wrong.

## Plan Or Decision

Captured, unassigned, 2026-11-13, at the Navigator's direction, from the four-lens review
of PR #60, where the QA and DevOps lenses each named the other families as the open risk.

Planned and approved on 2026-11-13, after a four-lens review of the plan (engineering, QA,
AI engineering, DevOps) amended it. Driver: @viniciusteles. Delivery: `main`.
[CR109](cr109-mirror-log-help-records-help-and-renames-the-conversation.md) closes with
this CR.

### Scope

- **One rule, in routing.** `routeMemoryCommand` answers a help flag after the retired
  match and before any family, through the `usage` engine, which already answers before
  anything is opened, read from stdin, or spawned. A command added later is covered
  without anyone remembering to.
- **What the answer says.** The subcommand's own usage line where one exists, else the
  family's line, which lists its subcommands. Every subcommand that changes data, spends
  money, or moves the operating mode gets its own line, so an agent learns the arguments
  from help rather than by trying the command. `build`'s lines are generated from the
  argument specs its parser already enforces. Families with no usage line of their own
  (`journey`, `conversations`, `memories`, `journeys`, `recall`, `detect-persona`,
  `welcome`) and commands with no subcommand (`seed`, `init`, `journal`, `consult`,
  `backup`, `repair-encoding`, `mcp`) get one.
- **Help wins for commands people type, and the user's text wins on the hook path.**
  The hooks of four runtimes put the user's prompt in argv (`mirror doorman --prompt`,
  `conversation-logger log-user`/`log-assistant`), so a prompt that is exactly `-h` or
  `--help` must reach the doorman as a prompt. Exempt by name: `mirror doorman`; the
  hook-facing `conversation-logger` subcommands (`log-user`, `log-assistant`,
  `user-prompt`, `stop`, `session-start`, `session-end`, `session-end-pi`,
  `session-maintenance`); `welcome --status-line`; `conversations append`.
- **Help a command already answers stays its own:** `conversations imported`,
  `conversations skill-turns`, and `ext`, whose extensions own their CLIs.
- **#60's notes.** The `runtime` help check moves into the rule, so the usage table is
  what decides; the `--version` flags and the version lookup each live in one place.
- **CR109.** `mirror log` also refuses a summary that looks like an option, as
  `journey update` has since CR073.

### Non-goals

- Usage lines for subcommands that only read: they answer with their family's line.
- `--` as an end-of-options marker: no parser honors it, and adding it to the help scan
  alone would make it half a convention.
- Refusing unknown flags across families.

### Acceptance

- `-h` or `--help` anywhere after a known command answers usage on stdout, exit 0,
  without opening the database, reading stdin, spawning, or calling a model.
- Every family's every subcommand answers help; the test reads the same subcommand
  constants routing does.
- A prompt of exactly `--help` or `-h` still reaches the doorman, on every runtime's
  hook path.
- `conversations imported --help`, `conversations skill-turns --help`, and `ext --help`
  answer as before. `runtime update --help` prints #60's line. `build show --help` now
  exits 0 instead of 2, intended.
- `--help` works on a machine with no user configured.
- `mirror log --help` writes nothing; `mirror log --anything` is refused.

### Validation route

In a temporary home: `mirror tasks add probe`, then `mirror tasks delete <id> --help`
prints usage and `mirror tasks list` still shows the task; `mirror build show --help`
prints usage with exit 0; `mirror runtime update --help` prints its line.

### Release note

Warn that on earlier versions `--help` after a subcommand can run it; until updated,
use `mirror <family> --help`. Name the visible change: `build … --help` exits 0.

## Evidence

Probed on 2026-11-13 with `mirror` 0.44.0 from this checkout (`c7761510`, through
`~/.local/mirror-dev/bin/mirror` → `bin/mirror.js`), against a copy of the
`vinicius-dev` home under `/tmp`. Every call ran under `env -i` with a sandboxed `HOME`,
`XDG_CONFIG_HOME`, and `EXPORT_DIR`, `MIRROR_HOME` and `MIRROR_USER` naming the copy, an
invalid `OPENROUTER_API_KEY`, and stdin closed. A file under the copy newer than a marker
touched before each call counted as a write (logs and `-shm` excluded). The real home was
checked afterwards and was unchanged.

| Command | Exit | First line | Wrote |
|---------|-----:|------------|-------|
| `tasks delete 522e6eab --help` | 0 | `🗑 Task removed: 522e6eab - Pay Naturgy gas bill …` | `memory.db` |
| `tasks add --help` | 0 | `✅ Task created: 5acad390 - --help` | `memory.db` |
| `identity set persona probe-x --content hi --help` | 0 | `✓ persona/probe-x created` | `memory.db` |
| `journey update campos-houses "new text" --help` | 0 | `Journey path 'campos-houses' updated.` | `memory.db` |
| `journey set-path campos-houses /tmp --help` | 0 | `project_path set for 'campos-houses': /private/tmp` | `memory.db` |
| `conversation-logger discard-current --help` | 0 | `Discarded current conversation: 2bf6011c` | `memory.db` |
| `conversation-logger switch --help` | 0 | `New conversation created: 8ebebf12` | `memory.db` |
| `conversation-logger mute --help` | 0 | `Conversation logging MUTED.` | mute flag |
| `conversation-logger repair-journeys --apply --help` | 0 | `Mirror home: …` | `memory.db` |
| `conversation-logger session-start --help` | 0 | `Conversation logging ACTIVE.` | `memory.db` |
| `mode activate --help` | 0 | `Activated --help` | `memory.db` |
| `mode deactivate --help` | 0 | `Deactivated active mode` | `memory.db` |
| `mirror load --help` | 0 | `Mirror` (the transition surface) | `memory.db` |
| `mirror log --help` | 0 | `Response recorded.` | `memory.db` |
| `explore deactivate --help` | 0 | `Mirror` | `memory.db` |
| `consolidate apply 807e9771 --help` | 2 | `Error: OpenRouter refused OPENROUTER_API_KEY (HTTP 401)` | `memory.db` |
| `seed --help` | 0 | `Seeding identity into [production]...` | none here, every file already seeded |
| `journal --help` | 2 | `Error: OpenRouter refused OPENROUTER_API_KEY (HTTP 401)` | none, stopped by the key |
| `week plan --help` | 2 | `Error: OpenRouter refused OPENROUTER_API_KEY (HTTP 401)` | none, stopped by the key |
| `descriptor generate --help` | 0 | `generating persona/ai-engineer... skipped (empty response)` | none, stopped by the key |
| `consolidate scan --help` | 0 | `Scanning 1263 memories (threshold=0.75)...` | none |
| `shadow scan --help` | 0 | `Found 50 shadow-candidate memories. Generating observations.` | none |
| `build <any> --help` | 2 | `Mirror TS build: <sub>: unrecognized argument --help` | none |
| `backup --help` | 2 | `backup: error: unrecognized arguments: --help` | none |

Every subcommand each family's usage line lists was probed with `--help` as its only
argument, except `build`, where ten of its twenty-eight were. `journey`, `memories`,
`conversations`, and `journeys` print no usage line of their own, so their subcommands
were taken from `REFERENCE.md`. The table keeps the ones that wrote, called a model, or refused. Those with
`<id>` or `<text>` were probed again with real arguments to see what a user typing them
would get.

Code:

- `ts/src/frontDoor/usage.ts`, `answerUsage`: `HELP.has(request.given)` is checked only for
  the word in the subcommand's place.
- `ts/src/frontDoor/runtimeRoute.ts`, `runRuntimeReadRoute` (PR #60): the shape of the fix
  for one family, a help check before dispatch.

## Outcome

Implemented on `main`, 2026-11-13; awaiting the Navigator's validation.

- **The rule.** `helpDecisionFor` in `ts/src/frontDoor/routing.ts`, called by
  `routeMemoryCommand` after the retired match. It reads each family's subcommands from
  the allowlists routing already answers by, and exempts the hook path and the commands
  with their own help by name (`keepsItsOwnArgv`). The answer goes through the `usage`
  engine as a new `command` scope, and its log reason is the table key, never argv.
- **The lines.** `ts/src/frontDoor/commandHelp.ts` holds every hand-written line. `build`'s
  are generated by `buildUsageSynopsis` from the specs its parser enforces, which moved to
  `ts/src/frontDoor/buildArgSpecs.ts` so help can read them without loading the Builder
  route.
- **#60's notes.** The runtime route's own help check and table are gone; its lines live
  in the one table. `isVersionFlag` and `runningTreeVersion()` replace two copies of the
  flag check and four of the version lookup.
- **CR109.** `mirror log` refuses a summary shaped like an option before the database
  opens (`mirrorLogSummaryRefusal`), so not even the pre-write backup is taken. The check
  is `looksLikeAnOption` in `args.ts`, shared with `journey update` (CR073).
- **One visible change in an existing test.** `init --help` now answers its usage with
  exit 0 instead of being refused with exit 2; `init --force` is still refused.

Checks:

- `ts/test/frontDoor/commandHelp.test.ts`: every subcommand of every family answers
  `--help` and `-h` with usage, stdout, exit 0; every front-door command but `ext`
  answers help; every option a usage line names is read by its route's source; the hook
  shapes keep their argv. Against a scratch home through the CLI, eleven commands, one
  or more per kind of harm, leave every file byte-identical: `tasks delete <id>`,
  `discard-current`, `identity set`, `journey update`, `mode activate`, `seed`, `init`,
  `mirror log`, `mute`, and `journal` twice, with providers that would fail loudly if
  called. `--help` answers with no user configured.
- `ts/test/hooks/claudeInject.test.ts` and `ts/test/hooks/agy.test.ts`: a prompt of
  exactly `--help` or `-h` is delivered as a delta with no usage line. Mutation-checked:
  with the doorman's exemption removed, both fail.
- `ts/test/frontDoor/runtimeSubcommandHelp.test.ts` keeps #60's assertions, read
  through routing.
- `npm test`: 3,904 tests, 3,901 pass, 0 fail. `tsc --noEmit`, `biome check`, the docs
  link check, and the skill parity check are clean.
- The validation route, run through `mirror` in a scratch home: `tasks delete <id>
  --help` printed `usage: tasks delete <task_id> [--mirror-home PATH]` and the task was
  still listed; `build show --help`, `runtime update --help`, and `mirror log --help`
  printed their lines with exit 0.

`REFERENCE.md` gained "Help and version" under "Running a command".
