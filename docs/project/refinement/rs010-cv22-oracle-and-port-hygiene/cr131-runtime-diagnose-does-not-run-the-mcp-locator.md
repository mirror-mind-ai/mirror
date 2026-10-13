[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR131 — `runtime diagnose` does not say what the plugin's MCP entry would find

## Problem

Since CV21.DS2.US6 the plugin's MCP entry is an inline locator: `MIRROR_BIN`, the
`PATH`, then `~/.nvm/current/bin`, `/opt/homebrew/bin`, and `/usr/local/bin` for
`mirror`; `MIRROR_NODE`, the `PATH`, the directory `mirror` was found in, then the same
directories for `node` (`MCP_LOCATOR`, `ts/src/guards/claudePlugin.ts`).
`mirror runtime diagnose` reports a missing `mirror` on the caller's `PATH` and nothing
more. A person whose runtime cannot start the server has no command that answers "what
would the MCP entry find from here, and would it start".

## Expected Behavior

- `runtime diagnose` runs the locator's search without starting the server, and
  reports the `mirror` and `node` the entry would run, or the one line it would print
  instead.
- The search stays one body: the diagnosis reads `MCP_LOCATOR`, or a TypeScript twin
  held equal to it by a test, as `mcpEntry.test.ts` holds the entry's directories
  equal to the hook wrappers'.

## Impact

Low to medium. It matters on the machines where the locator matters most: a runtime
launched from the GUI, or a client that filters the environment, as Codex does.

## Plan Or Decision

Captured, unassigned, at CV21.DS2's Debt Review (2026-10-13, deferred as a Change
Request). It was named as a follow-up in the Delivery Story plan's review (the
devops-engineer lens). Current Focus unchanged.

## Evidence

[CV21.DS2 plan](../../roadmap/cv21-runtime-expansion-ii/cv21-ds2-mirror-plugin-mcp-foundation/plan.md),
Scope item 2 and Non-Goals; the Debt Review record (`review.md`) in the same package.

## Outcome

Pending.
