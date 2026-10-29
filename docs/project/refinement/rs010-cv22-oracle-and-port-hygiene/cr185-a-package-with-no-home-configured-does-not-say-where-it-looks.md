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
  `MIRROR_HOME=<path>`). Its remedy is `mirror init <name>`, which works for a new home
  and for one that already exists (decision 1 of the plan).
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

### Plan (2026-10-29; amended after a five-lens review, approved by the Navigator)

**Objective.** When an install finds no Mirror home, the error itself says what to run
and which file that command writes. The command it names, `mirror init <name>`, works
whether the home is new or already exists.

**What planning found.**

- `init` is the only command that writes `~/.config/mirror/env`, and it creates the file
  readable only by its owner (`0600` in a `0700` directory, `writeConfigValue` in
  `ts/src/runtime/config.ts`). The file will hold `OPENROUTER_API_KEY`. A file made by
  hand is `0644` under the usual umask, and `runtime diagnose` reports it as
  `loose_permissions`. A message that only names the file leads people to that finding.
- Getting Started promises `init` on an existing home in two places: "Upgrading from a
  clone", and section 6's "re-run `mirror init your-name` any time to see it again" (the
  wiring steps). Both are false today, because the refusal comes before anything is
  printed.
- On the unconfigured path, the status and diagnose tests read the real home directory
  (`buildRuntimeStatus` has no home seam). Before any message can depend on the machine,
  those tests need a pinned home.

**Decisions.**

1. `init <name>` uses an existing home as it is, and writes the configuration safely.
2. The error names the homes it finds, so that a person with one home gets a command they
   can paste.

**Approved by the Navigator, 2026-10-29:** both recommendations, with the direction to
make it "as easy as possible for the user". Decision 1 replaced the last sentence of the
first Expected Behavior bullet.

Not adopted: selecting the only home automatically. The July 2026 decision "Runtime state
is contained in the mirror home for every environment" made a missing home fail loudly
with an actionable one-line hint, after a silent fallback caused the wrong-session export
incident. CR175 shows what a silent choice of home costs. One explicit command, whose
effect is kept in a file, is the honest minimum.

**Behavior.**

*Homes.* A new module, `ts/src/frontDoor/mirrorHomes.ts`, owns the homes root
(`<home>/.mirror-minds`) and decides what counts as a home there. A home is a directory,
reached through symlinks if necessary, that holds a non-empty `identity/` or a
`memory*.db` file. Hidden entries are skipped. If the root is missing, unreadable, or not
a directory, no homes are found. `dbPath.ts`, `init.ts`, and `runtimeRoute.ts` all take
the root from this module.

*The not-configured error.* It is one line, the same everywhere it appears:
`runtime update`, `runtime migrate`, `runtime backup`, every command that prints after
`Mirror TS front door:`, and `runtime status`'s `Mirror home note:`. Status stops
restating the oracle's shorter sentence. The line starts with
`Mirror home is not configured.` and continues with one of these:

```text
# one home init can name
To use the home at <root>/leandro, run: mirror init leandro (it writes MIRROR_USER=leandro to <config>).
# several
To use one of the homes in <root> (a, b), run: mirror init <name> (it writes MIRROR_USER=<name> to <config>).
# a home whose name init would refuse (CR141): its path is printed as a repr
To use the home at '<root>/Old Home', add MIRROR_HOME='<root>/Old Home' to <config>.
# none
To create one, run: mirror init <your-name> (it writes MIRROR_USER=<your-name> to <config>). If yours lives elsewhere, add MIRROR_HOME=<path> to <config>.
```

- `<config>` is `configFilePath()`, so `XDG_CONFIG_HOME` is honored.
- A name is printed bare only when it passes the user-name grammar. Any other path is
  printed through `pyRepr`, so a directory name cannot break the line or inject escape
  sequences.
- When both kinds of home exist, both sentences appear.
- The clause `(or pass an explicit MEMORY_DIR/DB_PATH override)` is dropped. The
  `MIRROR_HOME`/`MIRROR_USER` conflict error is unchanged.

*The bare `mirror`.* With no user configured, the orientation now names a home that
`init` can use: `To use the home at <path>, run: mirror init <name>` (or the several form)
replaces `Run: mirror init <your-name>`. When no such home exists, the orientation is
unchanged.

*`init <name>`.* The name check (CR141) still runs first. When the user's home already
exists, by the rule above, `init` copies nothing and changes nothing in it, and exits 0.
Its first line is `Found user home: <path> (nothing in it was changed)`.

`init` reads the current selection once, for a new home and an existing one alike: no
home is selected, this home is, or another is. It compares real paths. Then:

- no home selected: it writes `MIRROR_USER=<name>` (`0600` in `0700`) and says so;
- this home selected: it prints `Configuration: already selects this home` and writes
  nothing. For a new home this replaces today's false instruction, "to use this one, run
  with MIRROR_USER=<the same name>";
- another home selected: it prints today's "This machine already selects a user…" line and
  writes nothing.

For an existing home, `init` then prints only what is left to do:

- the key step, only when `OPENROUTER_API_KEY` is not set, naming the file and saying it
  is the key the previous install used;
- `Run: mirror seed`, only when the home has no database;
- the runtime wiring section.

A new home's output is otherwise unchanged. `initUserHome` keeps refusing a populated
identity, as the guard under all of this.

**Affected files.**

- `ts/src/frontDoor/mirrorHomes.ts` (new): the root, the rule for a home, discovery.
- `ts/src/frontDoor/dbPath.ts`: the message, built only when nothing resolves.
  `DbPathEnv` gains `XDG_CONFIG_HOME`.
- `ts/src/runtime/status.ts`: the restatement goes. `BuildStatusOptions` gains `osHome`,
  the name `composeWelcome` already uses.
- `ts/src/frontDoor/cli.ts` (`runInit`, and the orientation's context),
  `ts/src/frontDoor/usage.ts` (`renderOrientation`), `ts/src/init/init.ts`
  (`defaultUserHome` takes the shared root), and `ts/src/frontDoor/runtimeRoute.ts`
  (`homesRoot` takes the shared root).
- Tests:
  - `ts/test/frontDoor/mirrorHomes.test.ts` (new): the rule and discovery. Cases: a
    symlinked home, hidden entries, a directory holding only a log, an empty `identity/`,
    a root that is missing, unreadable, or a file, and code-point order.
  - `ts/test/frontDoor/dbPath.test.ts`: each variant, both kinds of home together,
    `XDG_CONFIG_HOME`, the one-line rule, and a directory name carrying an escape
    sequence.
  - `ts/test/frontDoor/initCli.test.ts`: the populated-home refusal becomes adoption. Cases:
    - no home selected, this home, another home;
    - the identity tree byte-identical before and after;
    - the key step with and without a key;
    - the seed step with and without a database;
    - a database-only home;
    - a config file whose other keys are kept;
    - two runs in a row;
    - a symlinked home;
    - `init ../x` with a home present, still refused;
    - a new home whose user is already selected.
  - A front-door test of Leandro's path: `runtime update --dry-run`, `runtime status`, and
    the bare `mirror`, under a scratch `HOME` holding a home and no config file.
  - `ts/test/runtime/status.test.ts` and `diagnose.test.ts`: `osHome` pinned under the
    fixture root.

  Every spawned test blanks `MIRROR_USER`, `MIRROR_HOME`, and `XDG_CONFIG_HOME` (GitHub's
  runners set the last one). Tests that assert the key step also blank
  `OPENROUTER_API_KEY`.
- Goldens, edited by hand through a script that asserts the counts, with a row in
  `ts/test/goldens/README.md`:
  - `runtime-status`, scenario `home_not_configured`: one render line, and
    `mirror_home_error`.
  - `runtime-diagnose`, scenario `mirror_home_missing`: `detail`, and one render line. Its
    recommendation stays.
- `scripts/smoke_npm_package.sh`: after `init smokeuser`, remove the config file. Check
  that the error names `mirror init smokeuser`, and that running that command exits 0,
  writes the configuration back, and leaves the identity untouched.
- Docs: `docs/getting-started.md` (section 3, and the move from a clone), `REFERENCE.md`'s
  Configuration section, and `docs/reference/configuration.md`.

**Checks.**

- Test-driven: each behavior above starts as a failing test.
- The development guide's verification checklist, and the repository checks.
- `bash scripts/smoke_npm_package.sh`, because the change touches configuration and what a
  fresh install runs first.
- `bash scripts/smoke_runtime_update.sh`, because its failure output changes.

**Navigator validation.** In a terminal, with a scratch home and this checkout's `mirror`:

```bash
S=$(mktemp -d); m() { HOME="$S" MIRROR_USER= MIRROR_HOME= XDG_CONFIG_HOME= OPENROUTER_API_KEY= mirror "$@"; }
m runtime update --dry-run   # 1. "To create one, run: mirror init <your-name> (it writes … $S/.config/mirror/env)…"
m init probe                 # 2. creates the home and the config file, as today
rm "$S/.config/mirror/env"   #    the move from a clone: the home exists, nothing selects it
m                            # 3. the orientation names `mirror init probe`
m runtime update --dry-run   # 4. "To use the home at $S/.mirror-minds/probe, run: mirror init probe …"
find "$S/.mirror-minds/probe/identity" -type f -exec shasum {} + > "$S/before"
m init probe                 # 5. "Found user home: … (nothing in it was changed)", the configuration, the key step
find "$S/.mirror-minds/probe/identity" -type f -exec shasum {} + | diff "$S/before" -
stat -f %Lp "$S/.config/mirror/env"   # 600
m init probe                 # 6. "Configuration: already selects this home"
cat "$S/.config/mirror/env"  #    still the one line step 5 wrote
m runtime status             # 7. Mirror home: $S/.mirror-minds/probe
```

Pass: each step shows what its comment says, `diff` prints nothing, and the mode is `600`.
Fail: step 5 refuses, anything under `identity/` changes, or a message names no file or a
command that does not work.

**Exclusions.**

- `mirror mcp`'s stack trace is CR129's. It will carry the new sentence, still as a trace.
- `OPENROUTER_API_KEY is not configured.` has the same gap: it names no file. That is
  outside this CR; capture it separately if wanted.
- Legacy `~/.mirror/<user>` homes are not listed. Resolution still falls back to them.
- No new `config` command: `init` stays the only writer of `MIRROR_USER`.
- `init` does not repair the mode of a config file it did not write; `runtime diagnose`
  reports it.
- The `Mirror TS front door:` prefix is unchanged.
- Release notes are written at release time. Commit, push, and release remain separate
  gates.

**Follow-up.** Once this lands, leave a note on PR #45: its installer can stop skipping
`init` for an existing identity, though the skip still works.

**Driver and Delivery.** `@viniciusteles` on `main`, confirmed by the Navigator
2026-10-29.

### Review (2026-10-29)

The plan was reviewed through five lenses before approval: product designer, engineer,
quality assurance, security engineer, and DevOps engineer. What each contributed is folded
into the plan above:

- **Product designer:** no automatic selection (the July decision); the bare `mirror`
  names the home too; no false instruction when the selected user is the same one; an
  adopted home prints only what is left to do.
- **Engineer:** one rule and one root shared by the error and `init`; names `init` would
  refuse get the `MIRROR_HOME` remedy; symlinks are followed; adoption is decided before
  `initUserHome` is called, and its refusal stays as the guard; one selection reading for
  both branches; the `osHome` seam.
- **Quality assurance:** the test matrix; every spawned test blanks `XDG_CONFIG_HOME`; the
  validation route blanks `OPENROUTER_API_KEY` (this checkout's `.env` sets it), re-runs
  `init`, and checks the file mode.
- **Security engineer:** no raw filesystem name in the message unless it passes the
  grammar, and the name check before any filesystem access. No other objection. Accepted:
  listing homes shows which ones exist to anyone who can read this user's stderr.
- **DevOps engineer:** PR #45's installer depends on today's refusal through its skip, and
  stays compatible. Adoption keeps the first stdout line a one-line summary, which is the
  installer's contract.

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

Pending: in progress since 2026-10-29.
