[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR128 — The smokes' production guard checks no database in CI, and the plugin smoke never reaches it on a linked machine

## Problem

Three runtime smokes end with a production-database guard:
`scripts/smoke_claude_plugin.sh`, `scripts/smoke_mirror_mcp.sh`, and
`scripts/smoke_gemini_cli.sh`.

- **The guard.** It enumerates `$HOME/.mirror-minds/*/memory.db`, then asserts the smoke's
  unique prompt and session id appear in none of them. That is a deliberate content check,
  not a checksum, so a concurrent Mirror session cannot read as a leak.
- **In CI it checks nothing.** A runner has no Mirror home, so the list is empty, the loop
  never runs, and the smoke prints "✓ no smoke data leaked into production (0 db
  checked)". The guard passes where it cannot fail.
- **On a developer machine with a global link, the plugin smoke never reaches it.** The
  missing-`mirror-hook` case fails first, as CR123 records, and the script stops. So the
  isolation claim of the most important of the three smokes is proven nowhere.

## Expected Behavior

- The guard checks at least one production database wherever the smoke runs. CI can seed
  a decoy home, `$HOME/.mirror-minds/<user>/memory.db`, before the smokes run, so the
  guard has something to protect.
- An empty list fails the guard unless the run says explicitly that no production home
  exists. "0 checked" should not be a pass.
- On a linked machine, the plugin smoke reaches its guard once CR123's override lands.
- Every smoke that runs Mirror commands runs them with a scratch `HOME`, no
  `XDG_CONFIG_HOME`, and none of the variables that choose a Mirror home, user, or
  database. `smoke_npm_package.sh` already does, and CR137 makes the updater smoke do
  the same. Otherwise the front door fills those variables from the OS user's
  `~/.config/mirror/env`, and a smoke can resolve the production home, or come one
  variable away from it.

## Impact

Low for users. The smokes run in scratch homes by design, and the guard is defense in
depth.

High for the evidence. A story that cites "production databases unchanged" from these
smokes cites a check that ran on zero databases. CV21.DS2.TS4 found exactly that. It had
to rest its claim on CV21.DS12's content-level check of the real databases instead.

## Plan Or Decision

Captured, unassigned, on the Navigator's Debt Review decision for CV21.DS2.TS4
(2026-10-13, defer). Current Focus unchanged. Routes, none chosen:

1. A CI step that seeds a decoy production home with a fresh database before the smoke
   steps, and keeps the guard as it is.
2. A guard that fails on an empty list unless `MIRROR_SMOKE_NO_PRODUCTION=1` declares
   it. CI would set it, so the vacuity is visible, while a developer machine checks for
   real.
3. Both.

CR123's fallback override is a precondition for the plugin smoke to reach the guard on a
linked machine.

Widened 2026-10-14 by the Navigator's decision, from
[CR137](cr137-the-updater-smoke-fails-on-a-machine-that-exports-mirror-user.md): the
other smokes' isolation from the machine's configuration belongs here.

## Evidence

```text
# CI, run 38304396661 (d74b573d, 2026-10-12), smoke job:
   no production DB found — nothing to guard
✓ no smoke data leaked into production (0 db checked)      # smoke_claude_plugin.sh
✓ no smoke data leaked into production (0 db checked)      # smoke_mirror_mcp.sh
# Local, 2026-10-13 16:13 UTC, a machine with /opt/homebrew/bin/mirror-hook:
❌ Smoke test FAILED: no hooks.log line after mirror-hook went missing   # stops before the guard
```

Found while closing
[CV21.DS2.TS4](../../roadmap/cv21-runtime-expansion-ii/cv21-ds2-mirror-plugin-mcp-foundation/cv21-ds2-ts4-reference-runtime-smoke-test/index.md),
evidence rows 5 and 6.

Added 2026-10-14 from
[CR137](cr137-the-updater-smoke-fails-on-a-machine-that-exports-mirror-user.md):

- **The mechanism, observed there.** With the real `HOME`, the front door loads
  `~/.config/mirror/env` and fills `MIRROR_USER` from it, even with the variable unset
  in the shell. On the Navigator's machine, that is the production user.
- **The three smokes CR137 left here.**
  - `smoke_codex.sh` exports a scratch `MIRROR_HOME` and passes `--mirror-home`.
  - `smoke_external_review_copy.sh` passes `--mirror-home`.
  - `smoke_gemini_cli.sh` asks the core to resolve the home, by its own comment (line
    32).

  None of the three sets a scratch `HOME`, unsets `XDG_CONFIG_HOME`, or unsets the
  variables that choose a home, user, or database. Whether their results change on a
  machine whose `~/.config/mirror/env` names a user was not checked.

## Outcome

Pending.
