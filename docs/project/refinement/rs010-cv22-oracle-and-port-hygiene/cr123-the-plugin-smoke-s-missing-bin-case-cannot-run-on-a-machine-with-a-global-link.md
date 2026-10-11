[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR123 — The plugin smoke's missing-bin case cannot run on a machine with a global link

## Problem

The Claude Code plugin's hook wrappers and its MCP launcher find the installed bin in a
fixed order: `$MIRROR_BIN`, then the `PATH`, then three global bin directories
(`~/.nvm/current/bin`, `/opt/homebrew/bin`, `/usr/local/bin`). The last step is what makes
a GUI-launched runtime work when its `PATH` lacks npm's prefix. It is also what makes the
"nothing anywhere" cases unprovable on any machine that has `npm link` in place:

- `scripts/smoke_claude_plugin.sh` section 6 removes `mirror-hook` from its scratch
  `PATH` and asserts the turn is not failed and one `hooks.log` line lands. On a machine
  with a global link the wrapper's fallback finds the real `mirror-hook`, the hook runs,
  no line lands, and the smoke fails its last case: "no hooks.log line after mirror-hook
  went missing". Known since CV22.DS10.US3 plateau 4 (2026-10-09, after the Navigator's
  `npm link`), and before that it passed only because nothing was linked.
- `ts/test/hooks/hookBin.test.ts` has two tests for the same cases that **skip** while a
  global `mirror` or `mirror-hook` exists in any of the three directories — correctly,
  since they cannot be proven there, but it means the developer whose machine is always
  linked never runs them. CI, which has no global link, runs both.

The handoff review of US3 carried these as N2 and N3.

## Expected Behavior

The smoke and the two tests prove the fail-safe on every machine: with the bin removed
from everywhere the wrapper looks, the turn is not failed, one line names the missing bin,
and `runtime diagnose` reports it. No test skips, and no smoke case depends on what the
developer has linked.

## Impact

Correctness is proven in CI, so the product is not at risk. What is at risk is the local
signal: a developer with `npm link` sees one red smoke case on every run (the story index
has had to say "do not read that local failure as this plateau's" since plateau 4), and
two skipped tests that look like coverage. A fail-safe whose proof runs only where it
cannot fail is a proof nobody local ever watches.

## Plan Or Decision

Captured, unassigned. Two routes, both small; the wrappers' search order is a product
contract and must not change for a test's sake:

1. **Let the search be pointed elsewhere for a test.** An environment variable the
   wrappers and the launcher already honor is `MIRROR_BIN`; add a test-only override of
   the fallback directory list (for example `MIRROR_GLOBAL_BIN_DIRS`, a colon-separated
   list, documented as test isolation and unset in production), and have the smoke and the
   tests set it to a scratch directory. The generator writes both wrapper forms, so one
   fragment change covers the four plugin wrappers and the launcher.
2. **Make `HOME` the only global root the wrappers consult**, dropping the two absolute
   directories — which changes the product's behavior for Homebrew and `/usr/local`
   installs, and is why route 1 is preferred.

Either way: `hookBin.test.ts` loses its two `skip` conditions, and
`smoke_claude_plugin.sh` section 6 runs under the override; the story index's standing
note about the local failure goes.

## Evidence

```text
# scripts/smoke_claude_plugin.sh on a machine where `npm link` ran (2026-10-09, plateau 4):
✗ no hooks.log line after mirror-hook went missing
# the same smoke in CI (no global link): passes
# ts/test/hooks/hookBin.test.ts, same machine:
ℹ skipped 2   -- "a global mirror-hook is installed on this machine"
```

## Outcome

Pending.
