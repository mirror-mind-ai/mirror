[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR192 — The hook wrappers and the MCP locator accept a relative `MIRROR_NODE`, and say nothing about one they will not use

## Problem

`MIRROR_NODE` names the Node binary a runtime integration runs when the runtime's PATH
holds none. Three readers resolve it, and they disagree about what a usable value is:

- The hook wrappers (`scripts/generate_hook_wrappers.sh`, both forms) take
  `"${MIRROR_NODE:-}"` and keep it when `[ -x "$NODE" ]`. A relative path passes that
  test against the cwd the runtime spawned the hook in, which is the user's project.
  A value that fails it is dropped silently; the wrapper goes on to `command -v node`
  and the candidates, and the user who set `MIRROR_NODE` to pin a Node learns nothing.
- The plugin's MCP locator (`ts/src/guards/claudePlugin.ts`, `mmnode`) does the same:
  `[ -n "$mmnode" ] && [ -x "$mmnode" ] || mmnode="$(command -v node)"`.
- The Pi extension, since CR191, requires an absolute path to an executable file, and
  warns once in `mirror-logger.log`, with the reason (missing, a directory, not
  executable, relative), before searching on without it.

`REFERENCE.md` documents the variable as one trust class for all three, "whoever sets
it chooses what runs", and `runtime diagnose`'s repair route is `export
MIRROR_NODE=/path/to/node`: an absolute path is what every instruction shows, and only
one reader insists on it.

## Expected Behavior

- One rule for every reader of `MIRROR_NODE`: an absolute path to an executable file,
  else refused.
- A refused value is recorded where that reader records failures, with the reason: the
  wrappers' and the locator's line in `<mirror home>/hooks.log` (the wrappers' `note`),
  the extension's WARN in `mirror-logger.log`, as CR191 left it.
- `hooks.test.ts` and `mcpEntry.test.ts` pin the rule as `mirrorLoggerExtension.test.ts`
  pins the extension's.
- `REFERENCE.md`'s `MIRROR_NODE` row and `docs/reference/configuration.md` state the rule
  once, for all readers.

## Impact

Low. The relative case needs a user who set `MIRROR_NODE` to a bare name or a `./`
path and a project directory that holds a file by that name; the silent drop needs a
`MIRROR_NODE` that moved. Both are misconfigurations that today produce either the wrong
Node or no explanation. What it costs is consistency: three readers, two rules, and docs
that describe one.

## Plan Or Decision

Captured, unassigned, 2026-11-02, at the Navigator's direction, from CR191's debt review,
which left the family's rule as a separate decision.

Not planned. For Plan: whether the wrappers' `note` line for a refused value is written
on every hook invocation (several per turn) or once, and how a POSIX `sh` locator tests
"absolute" (`case "$mmnode" in /*) ;; esac`).

## Evidence

- `scripts/generate_hook_wrappers.sh`, the two `NODE="${MIRROR_NODE:-}"` blocks, and
  `ts/src/guards/claudePlugin.ts` line 114–115, the locator's `mmnode`.
- `.pi/extensions/mirror-logger.ts`, `resolveNode()`, and the CR191 block of
  `ts/test/pi/mirrorLoggerExtension.test.ts`, which pin the extension's rule.
- `REFERENCE.md`, the `MIRROR_NODE` row, as CR191 left it: the extension's stricter rule
  is stated as the extension's alone.
- CR191's debt review, 2026-11-02.

## Outcome

Pending: captured, not planned.
