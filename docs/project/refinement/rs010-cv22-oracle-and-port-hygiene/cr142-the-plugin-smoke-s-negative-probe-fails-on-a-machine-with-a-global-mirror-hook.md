[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR142 — The plugin smoke's negative probe fails on a machine with a global `mirror-hook`

## Problem

`scripts/smoke_claude_plugin.sh` step 6 is a negative probe: it deletes the
sandbox's `$BIN/mirror-hook`, feeds a prompt to the plugin's
`log-user-prompt.sh` wrapper, and requires a `hooks.log` line
(`mirror-hook not found on PATH`) — the "never silent" half of the hook
posture.

The probe's premise is that removing the sandbox copy makes `mirror-hook`
unresolvable. It is false on a machine with a globally installed Mirror: the
bin wrapper's resolution order is `$MIRROR_BIN/mirror-hook`, then
`command -v mirror-hook`, then the **fixed** candidates
`~/.nvm/current/bin`, `/opt/homebrew/bin`, `/usr/local/bin` — and the fixed
candidates are searched regardless of the smoke's stripped
`PATH="$BIN:/usr/bin:/bin"`. On the Navigator's machine
`/opt/homebrew/bin/mirror-hook` exists, the wrapper finds it (working exactly
as designed for a GUI launch), the hook succeeds, no `hooks.log` line is
written, and the smoke fails:
`❌ Smoke test FAILED: no hooks.log line after mirror-hook went missing`.

CI's Ubuntu runner has no `/opt/homebrew` and no global install, so CI
passes and the failure shows only on a maintainer's machine.

Found during CV21.DS4.TS5's validation: the failure reproduced identically on
the unmodified baseline, so it was recorded as pre-existing and split here at
the Navigator's direction.

## Expected Behavior

- The smoke gives the same result on any machine. The negative probe must
  make the wrapper's *whole* search come up empty — for example by pointing
  the fixed candidates away (a `HOME` whose `.nvm` is empty is already the
  sandbox's; `/opt/homebrew/bin` and `/usr/local/bin` cannot be moved, so the
  probe needs a seam: run the wrapper with the candidates masked, or assert
  the found bin is the sandbox's before deletion and skip-with-reason when a
  machine copy would answer instead).
- Run on a machine with a Homebrew or npm-global Mirror installed, the smoke
  passes as it does in CI — or states why it cannot probe, rather than
  failing on wrapper behavior that is correct.

## Impact

Low for the product — the wrapper behaved correctly both times; what failed
is the probe's isolation. Real for the route: a maintainer with a global
install cannot run the plugin smoke green, so a real regression would hide
behind the known red, and CV21.DS4.TS5's validation had to prove the failure
baseline-identical by stash. Siblings: CR123, CR128, CR137 — smokes whose
result depends on the machine they run on.

## Plan Or Decision

Captured, unassigned, 2026-10-17, from CV21.DS4.TS5's validation, at the
Navigator's request. Current Focus unchanged.
