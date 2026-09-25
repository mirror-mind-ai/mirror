[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR100 — The session resolver guesses "the session" from a table that holds three kinds of row

## Problem

`resolveRuntimeSessionId` (`ts/src/mirror/runtimeSession.ts`) answers "which
session is this?" in three steps: the explicit `--session-id`, else
`MIRROR_SESSION_ID`, else **the most recently updated active row of
`runtime_sessions`** whose `interface` is set and is not `global_defaults`.

That table holds three kinds of row, told apart only by id prefix and
`interface`:

- real runtime sessions (`interface` = `pi`, `claude_code`, …);
- delivery-cursor pseudo-sessions (`__builder_delivery_cursor__:<journey>`,
  `interface = builder_delivery_cursor`, `active = 1`);
- two global pseudo-sessions (`__global_operating_mode__`,
  `__global_sticky_defaults__`).

The query excludes the globals by id and `global_defaults` by `interface`, but
not the cursor rows. Any Builder lifecycle write therefore makes a cursor row
"the session" until something else touches the table.

The guess is usually right, and that is why it has survived. The Pi extension
logs each prompt under its own session id at `before_agent_start`, so the
window's own row is normally the most recent when a tool runs. It is wrong
under interleaving: a cursor row written earlier in the same turn, or another
window's prompt in between.

CR008 removed the guess from Builder journey binding. Other callers still use
it:

- `switchConversation` (`ts/src/conversation/logger.ts`) ends the resolved
  session's current conversation and starts a new one on it. `build load`
  reaches it with no known session in an agent shell, so a wrong guess ends
  **another window's** conversation.
- Explorer and Soul activation, `explore deactivate`, and orchestration
  (see [CR101](../rs001-ariad-runtime-trust/cr101-explorer-and-soul-activation-stamp-a-guessed-session.md)
  for the mode side).

## Expected Behavior

Pseudo-rows never qualify as "the session". The fix belongs in the shape: a
row-kind distinction the query can rely on, or separate tables, rather than one
more `interface !=` exclusion. Where a caller must choose a session nobody
named, the code names that choice as a guess, and its consumers treat it as
display-only. Nothing destructive, such as ending a conversation, runs on a
guessed session.

## Impact

Medium-low after CR008, because no journey binding depends on the guess any
more. What remains is conversation integrity across windows: a guessed
`switchConversation` closes and replaces a conversation that belongs to a
different window. Mode display can also land on the wrong window (CR101).

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Captured by
the Navigator's decision approving
[CR008's plan](../rs001-ariad-runtime-trust/cr008-bind-lifecycle-commands-to-active-journey.md),
whose persona-panel review found that the heuristic is a symptom of the
table's overloading and asked for it to be fixed at the model level.

## Evidence

- [CR008's characterization](../rs001-ariad-runtime-trust/cr008-bind-lifecycle-commands-to-active-journey.md#characterization-read-only-2026-09-25-typescript-engine):
  the two hops, and a cursor row becoming "the session" mid-chain.
- `ts/src/mirror/runtimeSession.ts`: the query, and the two excluded ids.
- `ts/src/builder/deliveryCursor.ts`: cursor rows written with
  `interface: "builder_delivery_cursor"`.
- `ts/src/conversation/logger.ts`: `switchConversation` resolves, ends, and
  restarts on the resolved session.
- `.pi/extensions/mirror-logger.ts`: `log-user` at `before_agent_start`, which
  is why the guess is usually the active window.
- The heuristic was introduced on purpose on 2026-05-25:
  [Pi Builder conversations appear without journeys](../../../process/troubleshooting.md#pi-builder-conversations-appear-without-journeys).
  `build load` ran without a session id, so its conversation stayed
  journeyless. The guess fixed that, and `log-user` began refreshing
  `updated_at` to make it land on the active window. A fix here has to keep
  that attach working without the guess, not just delete the guess.
- `REFERENCE.md#operating-mode-lifecycle`: per-session operating mode exists so
  "simultaneous Pi sessions do not overwrite each other's footer state". The
  guess is how an agent shell's `build load` reaches that per-session row today.

## Outcome

Open.
