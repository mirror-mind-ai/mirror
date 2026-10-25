[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR172 — `smoke_claude_plugin.sh` fails its missing-hook step on a machine with a global `mirror-hook`

## Problem

Step 6 of `scripts/smoke_claude_plugin.sh` removes the scratch `mirror-hook` and
expects the wrapper to write one `hooks.log` line saying it is gone. The wrapper's
search continues past `MIRROR_BIN` and the PATH to `~/.nvm/current/bin`,
`/opt/homebrew/bin`, and `/usr/local/bin`, so on a machine with `mirror-mind`
installed globally it finds that one, nothing is missing, and the smoke fails with "no
hooks.log line after mirror-hook went missing". `hookBin.test.ts` skips the same case
on such a machine, with that reason; the smoke does not.

## Expected Behavior

The smoke tells a real regression from this machine's condition: it skips step 6 with
the reason when a global `mirror-hook` resolves through the wrapper's fallbacks, as the
unit test does, or it isolates those fallbacks.

## Impact

Low for the product (CI has no global install). Real for the development guide's
pre-push checklist on a developer machine that has one: the smoke the guide asks for
before a push that touches hooks cannot pass there.

## Plan Or Decision

Captured, unassigned, 2026-10-25, from CV9.DS8.TS6's Debt Review, at the Navigator's
direction. For TS6's push the failure is known and recorded, and CI is the authority.
**Revisit:** the next change to the hook wrappers or this smoke, or the next push that
needs it green on such a machine.

## Evidence

2026-10-25, this checkout: the smoke failed at step 6 with TS6's code and identically
with it stashed; `/opt/homebrew/bin/mirror-hook` links to a `mirror-mind` installed
globally that day ([TS6's test guide](../../roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/test-guide.md#validation-evidence)).
