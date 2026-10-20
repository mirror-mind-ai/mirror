[< RS011](index.md) · [Canonical status](../index.md#change-requests)

# CR145 — An extension's installation settings have nowhere to live but the login shell

## Problem

A `mirror-cli-v1` subcommand receives the five `MIRROR_*` variables and, otherwise,
whatever environment the `mirror` process had (`ts/src/extensions/dispatch.ts`,
`declaredEnvironment`). A `mirror-context-v1` provider receives the process
environment untouched (`ts/src/extensions/contextRuntime.ts`, `invokeProvider`).
Neither contract gives an extension a place for its own installation settings —
the "which host, which TLS mode, which certificate on this machine" configuration
that is not a secret and not part of the extension's source — so each extension
invents one. Some read a JSON file of their own under `~/.config/`. One, built by
the maintainer for a private journey, reads environment variables, two of them
names owned by other software: `PGSSLMODE`, which libpq reads, and
`NODE_EXTRA_CA_CERTS`, which Node reads.

Set in `~/.zshrc`, those two broke every other Postgres client and Node process on
the machine: `verify-full` against local databases, a foreign trust store in every
Node start. The workaround was a `mirror()` shell function that sets them for the
Mirror process tree only — which still includes every command a Builder session
runs for any other journey. And the extension cannot set `NODE_EXTRA_CA_CERTS` for
itself: Node reads it at startup, before any extension code runs, so only the
spawner can set it. The spawner is Mirror.

The same gap reaches a non-technical user being onboarded to an extension: the
contract's only answer today is "edit your shell profile".

## Expected Behavior

An extension's installation settings live in one file Mirror owns the reading of:

```text
<mirror-home>/extensions/<id>.env
```

beside the installed directory `<mirror-home>/extensions/<id>/`, so
`mirror extensions install`, which rewrites that directory, never overwrites it.
The file is dotenv syntax, read by the same parser as the home's own configuration.
At both spawn points — a declared subcommand and a bound provider — Mirror merges
it **under** the process environment: a variable already set in the environment
wins, the five `MIRROR_*` variables are set last and cannot be overridden by the
file, and the result reaches that one spawned process and nothing else. Mirror's
own `process.env` is never changed. With no file, nothing changes.

`mirror ext <id>` says whether the file was found and which variable names it
carries, values never printed, so a user can see what the extension was given
without running it. When the file is readable by other users, the same line says
so.

## Impact

Without it, an extension whose backend needs a machine-level setting forces the
user to choose between breaking unrelated programs and writing shell wrappers, and
a Builder session for another journey runs with that extension's variables in
every command. With it, the effect of installing an extension stays inside the
process Mirror spawns for it, and an onboarding step becomes "write three lines
in this file" instead of "edit your shell profile". Additive: `mirror-cli-v1` and
`mirror-context-v1` keep their names, and every installed extension behaves
exactly as today until a settings file exists.

Honest limit: this removes "edit your shell profile" from an extension's setup.
It does not yet make that setup guided — a person still creates a text file at a
terminal path, with the keys the extension's own documentation names. The guided
form is [CR146](cr146-an-extension-cannot-declare-the-settings-it-expects.md).

## Plan Or Decision

Captured 2026-10-20 from the roadmap's ideas section at the Navigator's direction,
which created RS011 to hold it. Selected as Current Focus the same day.

Reviewed the same day through five lenses — security, operations, engineering,
quality assurance, product — and nine amendments folded in at the Navigator's
direction (the listing's three states, absolute path and empty-state hint; a
`settings_unreadable` diagnostic; a result-typed reader validating the id with the
manifest's own grammar and stripping a BOM; the exposure note on the listing;
`uninstall` naming the file it leaves; the edge-case tests; the path rules in the
docs; the release-note debt recorded in Outcome; and two follow-ups captured as
CR146 and CR147). Plan approved 2026-10-20 → `planned`. Started the same day:
Driver @viniciusteles, Delivery `main` → `in_progress`. Implemented and committed
the same day (`bb33ed54`). Navigator validation route run by @viniciusteles on
2026-10-20, all twelve steps observed as stated → `validated`.

### Plan (approved 2026-10-20)

**Objective.** One settings file per installed extension, read by Mirror at both
spawn points, merged under the process environment, reaching only the spawned
process.

**Behavior.**

1. *Path.* `<mirror-home>/extensions/<id>.env`, a sibling of the installed
   directory. `install`, `sync`, and `uninstall` do not touch it: a settings file
   outlives an install the way a configuration file does, and a reinstall finds it
   where it was left. The catalog scan already skips non-directories under
   `extensions/`, so the file is invisible to listing and to the generated plugin.
2. *Syntax.* dotenv as Node's `util.parseEnv` reads it — the parser behind the
   home's `.env` and user configuration (`ts/src/runtime/config.ts`), so one syntax
   serves both. Malformed lines are skipped, as they are there; a duplicate key's
   last value wins; `KEY=` sets an empty string; CRLF is accepted; a leading UTF-8
   BOM is stripped before parsing, since `parseEnv` would otherwise keep it in the
   first key's name.
3. *Precedence.* process environment > `<id>.env`; then `MIRROR_HOME`,
   `MIRROR_DATABASE_PATH`, `MIRROR_EXTENSION_ID`, `MIRROR_EXTENSION_ROOT`,
   `MIRROR_TABLE_PREFIX` are set last. "Already set" means the key exists in the
   environment, even empty — the rule `loadEnvFileWithoutOverride` applies to the
   home's own files. The five reserved names are dropped from the file at the
   merge, at both spawn points, so a provider — which receives no `MIRROR_*` in
   its environment by contract — cannot be given one by the file either. Fixtures
   and CI that export `PG*` keep their meaning.
4. *Reach.* The merged environment is built per spawn and passed to `spawnSync`.
   `process.env` is read, never written.
5. *Both spawn points.* `declaredEnvironment` in `dispatch.ts` and `invokeProvider`
   in `contextRuntime.ts` read the same file through one helper. The helper returns
   a result (`absent` | `read` | `unreadable`), never throws, and validates the
   extension id against the manifest's own grammar (`SKILL_ID_RE`, the one `install`
   enforces) before building the path, so a path cannot be steered by a binding
   row; an id outside the grammar is `unreadable` — fail closed. No third grammar is
   introduced; the mismatch between the two existing ones is
   [CR147](../rs010-cv22-oracle-and-port-hygiene/cr147-three-copies-of-the-extension-id-grammar-and-two-of-them-disagree.md).
6. *Absent file.* No change in behavior; the environments are what they are today.
7. *Present but unreadable.* A subcommand refuses with one stderr line naming the
   file, exit 1, nothing spawned: running without the settings the user wrote is
   the failure the file exists to prevent. A provider records a new
   `settings_unreadable` diagnostic, so the Mirror Mode warning names the cause
   instead of `provider_failed`.
8. *Visibility.* The `ext <id>` listing — on every path that renders it, the
   `--help` spellings and the unknown-subcommand refusal alike — ends with one
   unindented line carrying the absolute path, in the spelling
   `extension not installed:` already uses, and one of four states:
   `settings: <path> (PGHOST, PGSSLMODE)` naming the keys sorted by name, as `parseEnv` yields them;
   `settings: <path> (no variables)`; `settings: <path> (not present — create it to
   pass settings to this extension)`; `settings: <path> (unreadable: <reason>)`.
   When the file's mode lets group or others read it, the state gains
   `; mode 0644, readable by other users` — the ssh posture without ssh's refusal.
   Values are never printed, in this line, in the refusal, or in a diagnostic.
9. *Uninstall.* A full `uninstall` keeps the file and reports it:
   `settings left in place: <path>`, only when the file exists, so the uninstall
   golden is untouched. A credential that outlives the extension it served is
   named, never silent.

**Affected files.**

- `ts/src/extensions/settings.ts` — new: `extensionSettingsPath`,
  `readExtensionSettings` (result-typed: `absent` | `read` with the variables and
  the exposure note | `unreadable` with the reason), `settingsUnderEnvironment`
  (merge-under, reserved names dropped), `describeExtensionSettings` (the listing
  line).
- `ts/src/extensions/manifest.ts` — exports `SKILL_ID_RE`.
- `ts/src/extensions/dispatch.ts` — `declaredEnvironment` merges the settings
  under the base environment before the `MIRROR_*` layer, read after the id and
  installed checks; `runExtensionSubcommand` refuses on an unreadable file;
  `renderSubcommandListing` takes the settings result for its last line and stays
  pure.
- `ts/src/extensions/catalogCommands.ts` — both listing renders pass the result.
- `ts/src/extensions/contextRuntime.ts` — `invokeProvider` spawns with the merged
  environment; `settings_unreadable` joins the diagnostic kinds.
- `ts/src/extensions/catalogWrites.ts` — `uninstallExtension` reports the file it
  leaves; `renderUninstallReport` prints the line when there is one.
- `ts/test/extensions/settings.test.ts` — new: absent, read, empty, comments-only,
  `KEY=`, CRLF, BOM, duplicate keys, a directory in the file's place, an unreadable
  file, an id outside the grammar, reserved names dropped, the exposure note, the
  four listing states. `dispatch.test.ts`: file under environment, environment
  over file, `MIRROR_*` immune, `process.env` untouched, no-file key set identical,
  unreadable refusal without a spawn, the listing line on both render paths.
  `contextRuntime.test.ts`: a provider receives the file's variables under the
  environment; an unreadable file is `settings_unreadable`. A direct
  `uninstallExtension` test for the kept file.
- `docs/product/extensions/api-reference.md` — §3 gains one row for the settings
  file and an *Installation settings* section: path, syntax, precedence, reach,
  absolute paths and no `~`, the file follows the home and sits outside backups,
  the reserved names, the failure modes; §2 notes that a provider receives the
  same.
- `docs/product/extensions/index.md` — *Where extensions live* gains the
  `<id>.env` line.
- `docs/product/extensions/authoring-guide.md` — one section: what belongs in
  the file (settings), what does not (secrets), the recommended `0600`, and that
  the extension's README names the keys.
- `REFERENCE.md` — untouched: it documents no `ext <id>` listing line.

**Acceptance.**

1. With `extensions/<id>.env` holding `PGSSLMODE=verify-full`, the spawned
   subcommand's environment has `PGSSLMODE=verify-full`; with `PGSSLMODE=disable`
   in the process environment, it has `disable`.
2. `MIRROR_HOME=/elsewhere` in the file does not change the `MIRROR_HOME` the
   command receives; the same for the other four.
3. A bound provider spawned for a Mirror Mode query receives the file's variables
   under the same rules.
4. Without the file, the spawned environments are identical to today's; existing
   dispatch and provider tests pass unchanged in meaning.
5. After a dispatch, Mirror's `process.env` holds none of the file's keys.
6. A present, unreadable file: one stderr line, exit 1, the injected `spawn` never
   called.
7. `ext <id>` renders the `settings:` line in all four states, keys only, on the
   help spellings and on the unknown-subcommand path; a `0644` file carries the
   exposure note.
8. A full `uninstall` leaves the file and prints `settings left in place`; without
   the file, the report is byte-identical to today's (the golden passes unchanged).
9. A Mirror Mode turn whose bound provider has an unreadable settings file prints
   `warning: extension context settings_unreadable; continuing.`
10. A file with a BOM, CRLF endings, a duplicate key, and `KEY=` yields the keys
    without the BOM, the last duplicate, and the empty string.

**Validation route (Navigator).** Against the checkout's binary called by path
(`~/.local/mirror-dev/bin/mirror`; confirm `runtime status` says `Install: clone`),
never the `mirror` on PATH, which may be the published package or a shell
function. In a scratch home (`MIRROR_HOME` and `MIRROR_USER` set to the same
basename, no personal data): write a `hello` extension with a subcommand that prints
`env | grep -E '^(PG|MIRROR_|NODE_EXTRA)' | sort`. Run `mirror ext hello` first:
the `settings:` line reads `(not present — …)` with the absolute path. Run the
subcommand: no `PG*` line. Write `extensions/hello.env` with
`PGSSLMODE=verify-full` and `MIRROR_HOME=/elsewhere`; run again:
`PGSSLMODE=verify-full` appears, `MIRROR_HOME` is the scratch home. Run with
`PGSSLMODE=disable mirror ext hello …`: `disable`. Run `mirror ext hello`: the line
names `PGSSLMODE, MIRROR_HOME`, no values, and — the file being `0644` — the
exposure note; run `mirror ext hello nope` once: the same line under the
unknown-subcommand listing. `chmod 000` the file; run the subcommand: one line,
exit 1; `chmod 600` it back (the note is gone from the listing). Uninstall: the
report names the file left in place. Pass: every observation as stated. Fail: any
variable reaching the shell that ran `mirror`, any `MIRROR_*` value taken from the
file, a spawn after the refusal, or a value printed anywhere.

**Exclusions.** Secrets management (the file may hold one; the contract neither
encourages nor prevents it, and the authoring guide says so). An extension-side
convention for its own settings file. `uninstall` removing the file. Settings
reporting in `runtime status` or `diagnose`. Enforcing file permissions (the
exposure note reports; it does not refuse). An editor command
(`mirror ext <id> settings …`). Printing the path at `install` time — Mirror cannot
know which extensions need settings until they can declare them (CR146).
Reconciling the extension-id grammars (CR147). A release note — the Navigator's
call at the next release boundary; see Outcome.

**Authority boundaries.** Plan approval moves this CR to `planned` and authorizes
nothing else. Driver and Delivery are set when the Navigator starts it. No commit,
push, merge, publication, or release follows from this document.

## Evidence

On the maintainer's machine, 2026-10-19: `PGSSLMODE=verify-full` and
`NODE_EXTRA_CA_CERTS` exported in `~/.zshrc` for one extension's sake made `psql`
against local databases demand a certificate they do not have and gave every Node
process a foreign trust store. A `mirror()` shell function narrowed the two
exports to Mirror's process tree, which still includes every command a Builder
session runs for any other journey. Node reads `NODE_EXTRA_CA_CERTS` at process
start, so the extension cannot set it for itself.

Code, 2026-10-20, before the change: `declaredEnvironment` (`dispatch.ts`) spreads
`options.environment ?? process.env` and sets the five `MIRROR_*` keys;
`invokeProvider` (`contextRuntime.ts`) passes `options.environment ?? process.env`
unchanged. `loadConfiguration` (`runtime/config.ts`) already applies a
no-override merge with `util.parseEnv`, and the catalog scan
(`catalog.ts`, `readInstalledManifests`) skips any entry under `extensions/` that
is not a directory.

### Implementation evidence (2026-10-20, Driver)

**Checks.** `npm run typecheck` clean; `biome check .` clean (670 files);
`npm test` 3382 tests, 3379 pass, 0 fail, 3 skipped (the same three skip on
`main` without this change); `checkDocLinks` clean. New: `settings.test.ts`
(9 cases), 4 cases in `dispatch.test.ts`, 2 in `contextRuntime.test.ts`; the
listing expectations in `dispatch.test.ts` updated for the new last line. The
`ext-catalog-writes` golden passes unchanged: the uninstall line prints only when a
file exists.

**Isolated smoke through the real front door** (`mirror` on PATH is this checkout;
scratch home `/tmp/cr145-smoke.*/cr145` with `MIRROR_HOME` and `MIRROR_USER` set,
the `ext-dispatch/tools` fixture copied in with an added `env` subcommand printing
`PG*`, `MIRROR_*`, `NODE_EXTRA*`; removed afterwards):

1. `mirror ext tools` without the file: last line
   `settings: <abs>/extensions/tools.env (not present — create it to pass settings to this extension)`.
2. `mirror ext tools env` without the file: the five `MIRROR_*` and nothing else.
3. File written with the default umask: `-rw-r--r--`.
4. With `PGSSLMODE=verify-full`, `PGHOST=db.internal`, `MIRROR_HOME=/elsewhere` in
   the file: the command saw `PGSSLMODE=verify-full`, `PGHOST=db.internal`, and
   `MIRROR_HOME=<the scratch home>`.
5. `PGSSLMODE=disable mirror ext tools env`: `PGSSLMODE=disable`.
6. Listing: `(MIRROR_HOME, PGHOST, PGSSLMODE; mode 0644, readable by other users)`
   — keys sorted by name, which is how `parseEnv` yields them; the plan's "file
   order" was corrected to say so.
7. `mirror ext tools nope`: the same line under the unknown-subcommand listing.
8. `chmod 000`: `Mirror: extension/tools has a settings file that cannot be read:
   <abs>/extensions/tools.env (EACCES).`, exit 1; the listing reads
   `(unreadable: EACCES)`.
9. `chmod 600`: the exposure note is gone.
10. The shell that ran `mirror`: zero `PGHOST` lines in its environment.
11. Provider seam: a `mirror-context-v1` provider bound to `persona/engineer`,
    through `mirror mirror load --persona engineer`, rendered
    `PGSSLMODE=verify-full PGHOST=db.internal MIRROR_HOME=<the scratch home>`; with
    the file at `000`, `warning: extension context settings_unreadable; continuing.`
12. `mirror extensions uninstall tools`: `settings left in place: <abs>/extensions/tools.env`,
    and the file remained after the directory was gone.

**Limitation.** The exposure note and the `EACCES` cases are POSIX facts; on Windows
the note is suppressed by design and untested here.

### Navigator validation (2026-10-20, @viniciusteles)

The route above, run by the Navigator in a scratch home against the checkout's
binary called by path. Three runs, and what each taught:

1. *First run* — no step matched. The `mirror` on the Navigator's PATH was the
   published `mirror-mind@0.35.0` (`/opt/homebrew/lib/node_modules/mirror-mind`),
   which has no `settings.ts`; and the Navigator's shell wraps `mirror` in a
   function that exports `PGSSLMODE` and `NODE_EXTRA_CA_CERTS` for Mirror's process
   tree — the exact workaround this CR retires, measured where it lives. Step 2
   showed both variables with no file; step 5's inline `PGSSLMODE=disable` was
   overridden by the function. Not a defect in the change; a route that named the
   wrong binary. A typo (`tail -`) also made 0.35.0's front door die with an
   unhandled `EPIPE` stack trace — pre-existing, noted below.
2. *Second run* — the checkout's binary by path (`~/.local/mirror-dev/bin/mirror`,
   `Install: clone`). Steps 1–10 and 12 observed as stated. Step 11 bound
   `persona/engine` (a typo for `engineer`) and so measured nothing; `bind`
   accepted the nonexistent target without a word, noted below.
3. *Third run* — step 11 alone: the provider rendered
   `PGSSLMODE=verify-full PGHOST=db.internal MIRROR_HOME=<scratch home>`; with the
   file at `000`, `warning: extension context settings_unreadable; continuing.`

Accepted: twelve of twelve. The validation route in the plan now names the binary
by path; the first run is why.

### Debt review (2026-10-20)

**Proportionality.** 13 files, +442/−24. One new module of ~150 lines, one
exported constant, three call sites, one report field. The only observable change
for an extension with no settings file is the listing's last line. The uninstall
golden is byte-identical. Proportionate to the problem.

**Debt left on purpose, captured:**

- [CR146](cr146-an-extension-cannot-declare-the-settings-it-expects.md) — the
  manifest cannot declare the settings it expects, so onboarding is not yet guided.
- [CR147](../rs010-cv22-oracle-and-port-hygiene/cr147-three-copies-of-the-extension-id-grammar-and-two-of-them-disagree.md)
  — three copies of the id grammar; this CR used the manifest's and left the other
  two.
- The release note: a contract addition on `main`, unreleased — see Outcome.

**Debt found during validation, not captured (Navigator's call):**

- The front door dies with an unhandled `EPIPE` stack trace when its stdout closes
  early (`mirror ext <id> | head -1`); seen on 0.35.0, and the code path is the same
  on `main`. RS010 shape.
- `ext <id> bind <capability> --persona <id>` accepts a persona that does not exist
  and reports `bound`. Inherited from the Python oracle; a binding to a typo is
  silent until a load finds nothing. RS010 or RS004 shape.

**Small debt in the change itself, recorded:**

- The five reserved names are listed in `settings.ts` and set, by name, in
  `dispatch.ts`; the tests pin that the two agree, but the dispatcher does not
  derive its layer from the list. One list would be better; left as is to keep the
  dispatcher's environment readable as the three-layer spread it is.
- Windows: the exposure note is suppressed by design and has no test.

**After release:** the Navigator's `.zshrc` `mirror()` function can go once a
release carrying CR145 is installed; `PGSSLMODE` and `NODE_EXTRA_CA_CERTS` move into
the extension's `.env`, and the two credential-shaped values stay with the
extension's own secrets route.

## Outcome

In progress. Debt recorded up front: this is a contract addition that ships on
`main` unreleased beside DS10 and DS5; the next release note must carry it (the
file, the precedence rule, the listing line, the uninstall line, the diagnostic).
