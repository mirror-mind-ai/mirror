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

Not planned.

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

Pending: captured, not planned.
