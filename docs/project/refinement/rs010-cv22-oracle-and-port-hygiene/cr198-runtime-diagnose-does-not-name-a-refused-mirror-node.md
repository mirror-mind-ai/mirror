[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR198 — `runtime diagnose` does not name a `MIRROR_NODE` that every reader refuses

## Problem

Since CR192 (v0.39.5), every reader of `MIRROR_NODE` uses it only as an absolute path to
an executable file. Anything else is refused, and the search goes on through the PATH and
the usual places. The hook wrappers note the refusal in `hooks.log`, once a UTC day. The
MCP entry writes it to stderr, and the Pi extension to `mirror-logger.log`. Each one gives
the value and the reason.

`runtime diagnose` is the one place a user is told to ask, and it does not name the
value. `hookNodeFindings` (`ts/src/runtime/diagnose.ts`) skips a refused `MIRROR_NODE`
and goes on searching. When it finds Node on the PATH or in a usual place, it returns no
finding, and nothing says that the value was set and refused. The refusal reaches diagnose
in only one way: the wrappers' `hooks.log` line, counted by `hookFailureFindings` as
`hook_failures_recorded`. That finding:

- names only a count, the latest stamp, and the hook (`N hook failure(s) in the last 7
  days, latest …, claude:user-prompt`), never the value or the reason;
- calls the refusal a hook failure, though the hook ran through the PATH;
- says nothing until a hook has run in that environment.

So someone who set `MIRROR_NODE` by hand, for example `C:node.exe` or a path that moved
after a Node upgrade, and runs `runtime diagnose` to check it, sees no finding about it.
They can conclude that their value is in use, when every reader is ignoring it.

CR192 decided this at planning ("No new finding: the wrappers' refusal line reaches
diagnose as `hook_failures_recorded`") and listed "a new diagnose finding for a refused
value" under its exclusions. Rodrigo Immaginario's installer run on PR #47 met it from the
user's side.

## Expected Behavior

- When `MIRROR_NODE` is set and diagnose's own reading refuses it under CR192's rule,
  `runtime diagnose` reports one finding. The finding names the value and the reason
  (`relative`, `a directory`, `missing`, `not executable`) in the refusal's own words, and
  says whether the search found another Node. The repair route is an absolute path to the
  `node` binary.
- The finding exists whether or not any hook has run. It comes from diagnose's own
  environment, as `hookNodeFindings` already does.
- An unset, empty, or usable `MIRROR_NODE` adds nothing. `hook_node_unresolvable` and
  `hook_failures_recorded` keep their meanings.
- The finding's severity and wording are decided at planning. Diagnose runs from a
  terminal, so its environment can differ from a GUI-launched runtime's, and the finding
  should not claim more than that environment shows.
- `MIRROR_BIN`, once CR197 gives it the same rule, can take the same finding's shape.

## Impact

Low frequency, real confusion. It needs a hand-set `MIRROR_NODE` that is refused, which is
rare, because installers write absolute paths. When it happens, the tool built to answer
"is my configuration being used?" gives the wrong answer by saying nothing. The cost of
fixing it is small: diagnose already classifies the value and only discards the reason.

## Plan Or Decision

Captured, unassigned, 2026-11-05, at the Navigator's direction, from Rodrigo Immaginario's
note on PR #47 after v0.39.5's release gate run.

Not planned.

## Evidence

- Rodrigo Immaginario's installer run on
  [PR #47](https://github.com/mirror-mind-ai/mirror/pull/47#issuecomment-6644116024),
  2026-11-04: "with `MIRROR_NODE=C:node.exe`, `runtime diagnose` finds Node on the PATH and
  reports nothing about the refused value. Someone who set it by hand might want to hear
  it there too."
- `ts/src/runtime/diagnose.ts`, `hookNodeFindings`: a `MIRROR_NODE` that fails the rule
  falls through to the PATH and the candidates, and the function returns `[]` when either
  resolves. `hookFailureFindings` counts `hooks.log` lines by stamp and hook and leaves the
  reasons in the file.
- [CR192](cr192-the-hook-wrappers-and-the-mcp-locator-accept-a-relative-mirror-node.md),
  Scope 5 and Exclusions. Its Navigator validation, where diagnose reported
  `hook_failures_recorded` (1, latest `claude:user-prompt`) and not the value.
- [v0.39.5](../../../releases/v0.39.5.md), Conscious Exclusions.

## Outcome

Pending: captured, not planned.
