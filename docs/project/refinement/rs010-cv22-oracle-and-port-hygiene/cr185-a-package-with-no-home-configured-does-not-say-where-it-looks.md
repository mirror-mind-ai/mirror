[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR185 — A package with no Mirror home configured does not say where it looks, and the route Getting Started gives refuses an existing home

## Problem

A package install has no `.env` of its own (the tarball excludes `.env*`). It reads the
environment, then `${XDG_CONFIG_HOME:-~/.config}/mirror/env` (`ts/src/runtime/config.ts`).
When neither names a home, every command that needs one stops with:

```text
Mirror home is not configured. Set MIRROR_HOME or MIRROR_USER (or pass an explicit MEMORY_DIR/DB_PATH override).
```

The sentence comes from `ts/src/frontDoor/dbPath.ts`. `runtime update`, `runtime migrate`,
and `runtime backup` print it bare, exit 1; other commands print it after
`Mirror TS front door:`. `runtime status` restates it as `Mirror home note: Mirror home is
not configured. Set MIRROR_HOME or MIRROR_USER.` (`ts/src/runtime/status.ts`). None of
them names the file a package reads, so the person cannot tell where the setting goes.
Only the bare `mirror` does (`renderOrientation` in `ts/src/frontDoor/usage.ts`:
`Configuration will live at: <path>`), and that is not what a person runs after an
install.

The person most likely to meet this is moving from a clone to the package, and their
`MIRROR_USER` lived in the clone's `.env`. Getting Started's "Upgrading from a clone"
section tells them: `npm install -g mirror-mind`, "then `mirror init <your-name>` writes
your user to `~/.config/mirror/env` … Your existing home is found by the same name". It
does not. `init` refuses a home whose identity directory is not empty, which is every home
in use. It prints `Identity root already exists and is not empty: <path>`, exits 1, and
stops before writing the file (`initUserHome` in `ts/src/init/init.ts`, `runInit` in
`ts/src/frontDoor/cli.ts`). An error that pointed only at `init` would send that person to
a second refusal.

## Expected Behavior

- With no home configured, the error names the file this install reads, as
  `configFilePath()` resolves it, and the line to put there (`MIRROR_USER=<name>` or
  `MIRROR_HOME=<path>`). It offers `mirror init <your-name>` only to someone who has no
  home yet.
- `runtime status`'s `Mirror home note:` says the same. The goldens that hold the current
  sentence (`ts/test/goldens/runtime-status.golden.json`,
  `ts/test/goldens/runtime-diagnose.golden.json`) change with it.
- Someone moving from a clone with an existing home has a route that works. Either
  `init <name>` writes the configuration for an existing home and leaves the home alone,
  or Getting Started tells them to add `MIRROR_USER=<name>` to the file by hand.

## Impact

Low to medium. Nothing is lost and nothing is written. But the first update after moving
to the package stops on a sentence that does not say where to look, and the documented
route fails at its second step. It affects everyone who follows Getting Started's advice
to move from a clone to the package.

## Plan Or Decision

Captured, unassigned, 2026-10-29, from Leandro Garcia's report on PR #42, at the
Navigator's direction. The report suggests naming `~/.config/mirror/env` or pointing to
`mirror init`. The `init` refusal above is why the file comes first. Planning decides
whether to teach `init` to configure an existing home or to correct Getting Started, and
whether the message should also name the homes it finds under `~/.mirror-minds`.

Related but separate: CR129 (`mirror mcp` with no home prints a stack trace; the one line
it should print names the same file) and CR175 (which home `runtime update` acts on when
more than one is configured).

## Evidence

- [Leandro's comment on PR #42](https://github.com/mirror-mind-ai/mirror/pull/42#issuecomment-6234421624),
  2026-10-17. After `npm install -g mirror-mind@latest`, `runtime version` read `Install:
  package (mirror-mind@0.33.4)`, and `runtime update` stopped with `Mirror home is not
  configured`. His configuration lived only in the clone's `.env`. Moving it to
  `~/.config/mirror/env` fixed both installs.
- Reproduced on 2026-10-29 with `mirror-mind@0.38.0`, `HOME` and `XDG_CONFIG_HOME` pointing
  to an empty temporary directory. `runtime update --dry-run` printed the sentence above
  and exited 1. `runtime status` printed `Mirror home: not configured` and the restated
  note.
- Same sandbox, with a home at `~/.mirror-minds/leandro` holding one file under
  `identity/`: `mirror init leandro` printed `Identity root already exists and is not
  empty: …`, exited 1, and created no `~/.config/mirror/`.

## Outcome

Pending: captured, not planned.
