[< Refinement Workbench](../index.md) · [RS009](index.md)

# CR109 — `mirror log --help` records `--help` as the response and renames the conversation to it

## Problem

`mirror log` takes its first remaining positional as the response summary. Its
route (`ts/src/frontDoor/mirrorModeRoute.ts`, the `log` branch) strips
`--session-id`, `--mirror-home`, and `--db-path` and nothing else, so
`mirror log --help` takes `--help` as the summary. `logMirrorResponse`
(`ts/src/mirror/orchestration.ts`) then writes twice: it inserts the summary as
an assistant message, and it sets the conversation's title from it. The command
prints `Response recorded.` and exits 0.

When no session is named, the target is whatever `resolveRuntimeSessionId`
guesses ([CR100](../rs010-cv22-oracle-and-port-hygiene/cr100-the-session-resolver-guesses-from-a-table-of-three-row-kinds.md)).
In an agent shell that is the most recently updated row, and it can belong to
another window.

This journey's path recorded the defect twice on 2026-09-26, and it was not
captured until the Workbench inspection that followed the Ariad trust floor.
`journey update` had the same shape, and
[CR073](../rs010-cv22-oracle-and-port-hygiene/cr073-refuse-a-mistyped-stdin-sentinel-in-journey-update.md)
fixed it: content that looks like an option is refused with a hint
(`FLAG_SHAPED_CONTENT`, `ts/src/frontDoor/cli.ts`).

## Expected Behavior

`mirror log` refuses a summary that looks like an option, as `journey update`
has done since CR073. `mirror log --help` prints usage and writes nothing. No
conversation is renamed from text that was never a summary.

## Impact

Low frequency, silent damage to a record. `conversations` and recall list a
conversation by its title. One exploratory `--help` renames the conversation to
`--help`, adds a fake assistant turn, and exits 0. It can land in another
window's conversation. Agents probe commands with `--help`, which is how it
happened twice in one day.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Captured on
2026-09-27 by the Navigator's decision after the Workbench inspection that
followed the Ariad trust floor, outside the floor.

## Evidence

Reproduced on 2026-09-27 in an isolated home, with no `.env` loaded:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" NODE_OPTIONS=--no-warnings
node ts/src/frontDoor/cli.ts conversation-logger session-start --fast
echo '{"session_id":"s1","prompt":"a real question about backups"}' \
  | node ts/src/frontDoor/cli.ts conversation-logger user-prompt
node ts/src/frontDoor/cli.ts mirror log --help      # Response recorded. exit 0
sqlite3 "$V/home/memory.db" "SELECT title FROM conversations"
sqlite3 "$V/home/memory.db" "SELECT role, content FROM messages ORDER BY created_at"
```

Before `mirror log --help` ran, the only conversation was titled
`a real question about backups`. Afterwards it was titled `--help`, and its
messages were the user turn and an assistant message reading `--help`. No
session was named, so the resolver picked the one row there was.

## Outcome

Open.
