[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR129 — `mirror mcp` with no Mirror home prints a Node stack trace where every other failure is one line

## Problem

When the MCP server starts with no `MIRROR_HOME` or `MIRROR_USER` in its environment
and no config file naming one, `mirror mcp` throws `MirrorHomeNotConfiguredError`
(`ts/src/frontDoor/dbPath.ts`) uncaught. A multi-line Node stack trace goes to stderr,
which is the MCP client's log for the server. The plugin's own MCP entry fails in one
line naming the fix when `mirror` or `node` is missing (CV21.DS2.US6), so the one
failure a person is most likely to meet next is the least readable one.

That case is not exotic. An MCP client may hand the server a filtered environment:
Codex 0.162.1 passes `HOME`, `PATH`, and a few locale variables, and no `MIRROR_*`
(CV21.DS2's live Codex session).

## Expected Behavior

- `mirror mcp` with no configured home prints one line on stderr: what is missing and
  how to set it (`MIRROR_HOME` or `MIRROR_USER`, or `~/.config/mirror/env`), and exits
  1.
- A test pins it, beside the entry's own one-line failures in
  `ts/test/mcp/mcpEntry.test.ts`.

## Impact

Low for behavior, since the server cannot start either way. Real for support: the
client's MCP log is where a person looks, and a stack trace there reads as a crash.

## Plan Or Decision

Captured, unassigned, at CV21.DS2's Debt Review (2026-10-13, deferred as a Change
Request). Current Focus unchanged. A likely route: catch the configuration error in
`ts/src/mcp/main.ts` before the server starts, and print its message alone.

## Evidence

```text
# CV21.DS2.US6 spike, 2026-10-13: grok mcp doctor in a scratch HOME, no MIRROR_HOME.
✗ handshake failed (connection closed: initialize response)
# logs/mcp/mirror-mind.stderr.log:
file:///private/tmp/cv21-ds2/prefix/lib/node_modules/mirror-mind/ts/src/frontDoor/dbPath.ts:97
  throw new MirrorHomeNotConfiguredError(
        ^
MirrorHomeNotConfiguredError: Mirror home is not configured. Set MIRROR_HOME or MIRROR_USER (or pass an explicit MEMORY_DIR/DB_PATH override).
```

Found by
[CV21.DS2.US6](../../roadmap/cv21-runtime-expansion-ii/cv21-ds2-mirror-plugin-mcp-foundation/cv21-ds2-us6-the-mcp-server-starts-wherever-the-plugin-is-installed/index.md),
spike finding 7.

## Outcome

Pending.
