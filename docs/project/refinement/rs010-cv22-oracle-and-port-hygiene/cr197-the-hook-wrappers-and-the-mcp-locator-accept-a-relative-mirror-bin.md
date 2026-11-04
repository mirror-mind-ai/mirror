[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR197 — The hook wrappers and the MCP locator accept a relative `MIRROR_BIN`, so Node can run a JavaScript file from the project the session is in

## Problem

`MIRROR_BIN` names the directory holding `mirror` and `mirror-hook`
(`$(npm prefix -g)/bin`). It exists for the readers that run from a runtime's plugin
cache, where no relative path reaches the Mirror tree. Two readers take it:

- The plugin's hook wrappers, bin and agy forms (`scripts/generate_hook_wrappers.sh`,
  `ENTRY_BIN`): `[ -x "$MIRROR_BIN/mirror-hook" ] && ENTRY="$MIRROR_BIN/mirror-hook"`,
  then `"$NODE" "$ENTRY" "$HOOK"`.
- The plugin's MCP locator (`ts/src/guards/claudePlugin.ts`, `MCP_LOCATOR`):
  `[ -x "$MIRROR_BIN/mirror" ] && mmbin="$MIRROR_BIN/mirror"`, then
  `exec "$mmnode" "$mmbin" mcp`.

Neither checks that the value is absolute. A runtime spawns its hooks and its MCP server
from the user's project, so a relative value resolves there. With `MIRROR_BIN=bin`, Node
runs the project's `bin/mirror-hook` as JavaScript on every hook, and its `bin/mirror` at
every MCP server start. Probed on 2026-11-04 with the plugin's prompt hook: the project's
file ran.

A value that names nothing usable, such as a prefix that moved after an nvm switch, is
dropped silently, and the search goes on to the PATH and the global bin directories, as
`MIRROR_NODE` was before CR192.

`REFERENCE.md` puts `MIRROR_BIN` in `MIRROR_NODE`'s trust class ("whoever sets it chooses
what runs"), and `docs/process/troubleshooting.md` calls it "honored as given".

## Expected Behavior

- `MIRROR_BIN` follows CR192's rule: it is used when it is an absolute path, by CR192's
  shell pattern, to a directory holding the bin the reader needs as an executable file.
  Otherwise it is refused with the reason, and the search goes on without it.
- A refusal is recorded where the reader records failures, in CR192's form: the wrappers'
  once-a-day `hooks.log` line, the locator's stderr line.
- `hooks.test.ts` and `mcpEntry.test.ts` pin the rule, and `REFERENCE.md` and
  `docs/reference/configuration.md` state it beside `MIRROR_NODE`'s.

## Impact

Rare, and serious when met. It needs a user who set `MIRROR_BIN` to a relative path, a
plausible slip because the docs describe it as a directory, and a project that holds a
file at that path, which anyone can put in a repository. The consequence is the
project's JavaScript run under the user's account on every hook. The silent drop costs
less: the search usually finds the bin elsewhere, and when it does not, the existing
`mirror-hook not found` line names the fix.

## Plan Or Decision

Captured, unassigned, 2026-11-04, at the Navigator's direction, from the security
engineer's lens in the review of CR192's plan.

Not planned. CR192 builds the shell pattern, the shared generator fragments, and the
once-a-day refusal note that this CR can reuse, so it follows CR192.

## Evidence

- `scripts/generate_hook_wrappers.sh`, `ENTRY_BIN`: the `MIRROR_BIN` line, before the
  PATH and the global bin directories. The agy form takes the same fragment.
- `ts/src/guards/claudePlugin.ts`, `MCP_LOCATOR`: the `mmbin` line.
- Probe, 2026-11-04, in a scratch directory: a project holding an executable
  `bin/mirror-hook` whose JavaScript writes a marker file; `MIRROR_BIN=bin`, an absolute
  `MIRROR_NODE`, and `PATH=/usr/bin:/bin`. `plugins/mirror-mind/hooks/log-user-prompt.sh`,
  run from the project, exited 0 and the marker was written.
- `REFERENCE.md`, the `MIRROR_BIN` row; `docs/process/troubleshooting.md`: "`MIRROR_BIN`
  is the same trust class as `MIRROR_NODE`: an executable path the environment names,
  honored as given."
- [CR192](cr192-the-hook-wrappers-and-the-mcp-locator-accept-a-relative-mirror-node.md),
  Decisions Taken At Approval, decision 3.

## Outcome

Pending: captured, not planned.
