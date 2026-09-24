[< Releases](index.md)

# Pending Cutoffs — the CV22 release

CV22 [releases once, when the migration is complete](../project/decisions.md#cv22-releases-once-when-the-migration-is-complete),
so the stories that remove a surface have no release note of their own to write in.
This document is where each one records its cutoff, and the eventual release note
carries them. It is not itself a release note.

A cutoff answers three things for a user: **what no longer exists**, **what to do
instead**, and **what still works if they do nothing**.

---

## Journey projections and `mirror.journey-projections@1.0`

**Story:** [CV22.DS10.TS1](../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts1-retire-the-projection-seam-and-subsystem/index.md) ·
**Decision:** [Journey projections retire with the Python core](../project/decisions.md#journey-projections-retire-with-the-python-core-mirror-desktop-is-outside-the-migration)

**Removed.** `python -m memory journey-projection` and all five of its operations
(`capabilities`, `rebuild-operational`, `inspect`, `probe-prepare`, `probe-publish`);
the `api.journey_projections` Extension API capability added in Extension API `1.1`;
and the publication of `.mirror/projections` itself. Mirror no longer writes a
Journey read model to the filesystem, and the `mirror.journey-projections@1.0`
contract is sunset.

**Why.** The contract was built in CV23 for one consumer, Mirror Desktop. That
application is outside the TypeScript migration — it is alpha, has one user, and
couples to the Python era well beyond projections. With its only reader deferred,
porting the subsystem would have served no user of this release.

**What to do instead.** An extension that needs durable Journey state owns it: a
table under its own prefix, or files under its own directory. `hasattr(api,
"journey_projections")` returns `False`, so feature detection degrades cleanly;
reaching for the attribute raises with this reason.

**What still works.** Everything a Mirror user does. Nothing in Pi, Gemini CLI,
Codex, or Claude Code read the projection tree, and no surface changed — the
refresh was a post-commit side effect that never reached stdout.

**Mirror Desktop.** Pin to the last Python-bearing release. Its integration with
the TypeScript core is a separate effort, and that effort defines whatever read
model it needs. Existing `.mirror/projections/` trees are left on disk, inert and
readable by that release; nothing deletes them.

---

## The web console, and the scene surface it rendered

**Story:** [CV22.DS10.US1](../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us1-web-console-retirement/index.md) ·
**Decision:** [The web console is retired, not ported](../project/decisions.md#the-web-console-is-retired-not-ported-and-ds7-closes-at-1414)

**Removed.** `python -m memory web` and the local console it served — the Identity
and Workspace perspectives, conversation intelligence, bulk conversation
maintenance, and allowlisted operation runs. With it go the read models that
existed only to feed it, and the **scene synthesis**: an LLM-composed reading of
a journey's current state that was reachable only through the console.

**Why.** The console was barely used, and porting it to TypeScript was declined on
2026-09-17 after a complete, reviewed plan made the true cost legible. `mirror-gui`
is the successor surface for anything graphical over Mirror.

**What to do instead.** Everything the console showed is available in the terminal:
`journeys`, `journey <slug>`, `memories`, `conversations`, `tasks`, and the Mirror,
Builder, Explorer, and Soul modes in any of the four runtimes. There is no
replacement for the scene synthesis; it was a console-only reading.

**What still works.** Every command, every runtime, every mode. If you have never
run `python -m memory web`, nothing about your Mirror changes.

**Your preferences file stays.** `<mirror-home>/web/preferences.json` is left exactly
where it is — 41 bytes, inert, read by nothing. Mirror does not delete state from
your home on your behalf. Remove it yourself whenever you like, or leave it.

---

## The extension compatibility host, and `register(api)` as a core-served contract

**Story:** [CV22.DS10.TS2](../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts2-extension-compatibility-host-deletion/index.md)

**Removed.** `memory.extensions.compat_host` and every launcher branch that reached it.
The host was the bridge that let an extension's Python `register(api)` handlers keep
answering after extension dispatch moved to TypeScript. It ran context providers, ran
`ext <id> <subcommand>`, and imported an extension at install time to validate its
`register`. All three are gone.

**This does not mean extensions must be written in JavaScript.** An extension may own
**any** executable runtime, Python very much included. What ended is the *Mirror core*
owning Python as every extension's permanent compatibility layer.

**What to do instead.** Declare a runtime per capability in `skill.yaml`. Migration is
per capability, not per extension — an extension can move one command at a time, and the
migrated ones keep working while the rest have not moved yet:

```yaml
mirror_context_providers:
  - id: campaign_status
    provider_runtime:
      protocol: mirror-context-v1
      command: [node, context-provider.mjs]   # or [python3, provider.py]

cli:
  subcommands:
    - name: campaigns
      runtime:
        protocol: mirror-cli-v1
        command: [python3, cli.py, campaigns]  # or any executable runtime
```

The command must resolve **inside** the installed extension directory. A manifest that
reaches outside its own tree is not a contract.

**What a capability that has not migrated does now.** It fails explicitly, and it fails
soft:

- a **context provider** with no `provider_runtime` is skipped, `mirror load` completes
  with every other section intact, and a `no_provider_runtime` warning names what went
  dark;
- a **subcommand** with no runtime refuses with one line naming the extension, the
  subcommand, and the fix — no traceback, no partial output, exit 1;
- `ext <id>` still **lists** it, flagged `(no runtime declared)`, so a command that needs
  migrating never looks like a command that disappeared;
- `extensions install` still **succeeds**, and warns which capabilities declare no
  runtime. A skill-only or half-migrated extension is legal.

**What still works.** Every extension that declares a runtime. Every non-extension
command, every runtime, every mode. If none of your extensions registered Python
handlers, nothing about your Mirror changes.

**Install no longer imports your extension.** `register(api)` used to be called at install
time so a broken extension failed the install rather than the first command a week later.
With no interpreter in the core, install validates what the manifest *declares* instead.
The practical difference: a runtime that is declared but cannot start is now reported when
you run the command, not when you install it.

**Your extension's own `SKILL.md` files are part of this** — added 2026-09-23 by
CV22.DS10.US2 (decision D5), which found the residue while auditing the gate. An installed
Mirror carries extension skills under
`~/.mirror-minds/<user>/runtime/skills/<runtime>/ext-*/`, materialized from the
extension's repository by `extensions sync`. On the machine this was audited,
`ext-session-export` and `ext-persona-export` still documented **17** invocations of
`uv run python -m memory ext ...` and `uv run python -m memory seed`.

Those lines work today and stop working when the interpreter is deleted. They live in the
extension's repository, not in Mirror's, so Mirror's own skill-parity guard cannot see or
fix them: it scans `.pi/skills/`, `.claude/skills/`, and the packaged plugin.

**What to do:** before the CV22 release, rewrite the invocations in your extension's
`SKILL.md` to enter the front door, exactly as Mirror's own skills do:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts ext <id> <subcommand>
```

then re-run `extensions sync` for each runtime so installed copies are refreshed.

---

## Legacy migration

**Story:** [CV22.DS10.TS4](../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts4-retire-the-unported-surfaces-with-cutoffs/index.md) ·
**Decision:** [CV22.DS7.TS1 ops tail](../project/decisions.md#cv22ds7ts1-ops-tail-runtime-splits-rehearsal-and-legacy-migration-retire-in-ds10)

**Removed.** `python -m memory migrate-legacy validate|run` — the Portuguese-era
database conversion (`~/.espelho/memoria.db` and its `travessia` vocabulary)
into a current user home, with its `--report` JSON.

**Why.** It converts a database shape that predates CV0. The conversion is a
one-time act, most early users completed it years ago, and porting a one-time
converter to TypeScript would have spent migration budget on a path with no
future callers.

**What to do instead.** If you still hold a Portuguese-era database, convert it
with the **last Python-bearing release**, once, then use the current release
normally. The command lives on in git history and in that release; it is not
gone from the world, only from this version.

**What still works.** Everything, if your home is already a current home —
which it is if Mirror has ever started normally for you. Homes converted by the
old command are ordinary homes and nothing about them changed. The legacy
`~/.mirror/<user>` location still resolves, so an old *path* keeps working;
only the *conversion* is gone.

---

## The migration rehearsal tool

**Story:** [CV22.DS10.TS4](../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts4-retire-the-unported-surfaces-with-cutoffs/index.md) ·
**Decision:** [CV22.DS7.TS1 ops tail](../project/decisions.md#cv22ds7ts1-ops-tail-runtime-splits-rehearsal-and-legacy-migration-retire-in-ds10)

**Removed.** The `memory-rehearse-migration` console script, which rehearsed
the **Python** migration engine against a copy of a database before letting it
near the real one.

**Why.** CV22.DS6 moved migration custody to TypeScript and proved the TS
engine over real legacy copies. The tool rehearsed an engine that no longer
runs your migrations, so a green rehearsal had stopped meaning anything about
what would actually happen.

**What to do instead.** Nothing, for the property it protected: the TypeScript
migration engine is the one that runs, it is covered by its own suites, and
`backup` still exists for a copy before any upgrade. A rehearsal tool *against
the TS engine* is separate scope, and would be its own story if the need
appears.

**What still works.** Every migration path. This was developer tooling — it had
no front-door route, no skill, and no place in any runtime; if you have never
typed `memory-rehearse-migration`, nothing about your Mirror changes.

---

## Journey admin verbs

**Story:** [CV22.DS10.TS4](../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts4-retire-the-unported-surfaces-with-cutoffs/index.md) ·
**Refinement:** [CR089](../project/refinement/rs009-cv22-front-door-routing-correctness/cr089-the-journey-route-swallows-export-registry-and-mutate.md)

**Removed.** `python -m memory journey export-registry` (the whole Journey
hierarchy as JSON on stdout) and `python -m memory journey mutate` (a JSON
mutation request on stdin, answering with a receipt), together with the
`mirror.journey-mutation@1.0` request shape they served.

**Why.** They arrived during a pause-window merge and never entered the CV22
port denominator — 345 lines with no owner, no TypeScript counterpart, and one
caller. They were also the clearest case of a routing defect this migration
has produced: the TypeScript front door claimed the `journey` family and read
any unknown verb as a journey *slug*, so `export-registry` rendered an empty
status for a journey that does not exist, with exit 0 — and `mutate`, a
**write**, did nothing at all, also with exit 0. Rather than port a surface
nobody had asked for, DS10 removed it and taught the front door to say
*removed*.

**What to do instead.** Read Journey structure with the ordinary commands —
`journeys` for the hierarchy, `journey <slug>` for one Journey's status. Create
and change Journeys through the Mirror, Builder, and Explorer surfaces that own
those acts. There is no replacement for a machine-readable registry dump or a
batch mutation endpoint; if a future consumer needs one, it is a new contract
with a named consumer, not a revival of this one.

**What still works.** Every Journey you have, exactly as it is. Nothing about
the data changed — only these two entry points to it. Both verbs now answer in
one line naming this cutoff, and exit 1 instead of pretending to succeed.

**Mirror Desktop.** It called both verbs through Python directly, bypassing the
front door. It is outside this migration and pins to the last Python-bearing
release, as its own [cutoff](#journey-projections-and-mirrorjourney-projections10)
already says. Its integration with the TypeScript core defines whatever Journey
read and write model it needs.

---

## Conversation metadata backfill

**Story:** [CV22.DS10.TS4](../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts4-retire-the-unported-surfaces-with-cutoffs/index.md)

**Removed.** `python -m memory conversations --metadata-backfill-preview`,
`--metadata-backfill-apply`, and the `--metadata-backfill-mode safe|force`
they took. This was a **one-shot** pass that generated titles, summaries, and
tags for conversations recorded before the metadata lifecycle existed
(pre-ES-001).

**Why.** It ran once, for the rows that needed it, and validated nothing
afterwards. The metadata *lifecycle* — the engine that decides what to write
and when — is TypeScript-owned and very much alive: it still titles, summarizes,
and tags conversations as they close.

**What to do instead.** Nothing. New conversations get metadata through the
ordinary close path. A pre-ES-001 conversation that was never backfilled keeps
the metadata it has — possibly none — and every listing, search, recall, and
lifecycle face works on it exactly as before.

**What still works.** Everything else on `conversations`, including the
lifecycle faces `--metadata-lifecycle-dry-run`,
`--metadata-lifecycle-preview-at-message`, `--metadata-lifecycle-apply`, and
`--metadata-lifecycle-demo`. Also untouched, despite the similar name: the
**transcript** backfills `conversation-logger backfill-pi-sessions`,
`backfill-codex-session`, and `backfill-assistant-messages`, which import
sessions the live hooks never saw. Those are a different feature, they are
ported, and they stay.

---

## The SQLite Refinement Workbench

**Story:** [CV22.DS10.TS4](../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts4-retire-the-unported-surfaces-with-cutoffs/index.md) ·
**Decision:** [Project files supersede the SQLite Workbench](../project/decisions.md#project-files-supersede-the-sqlite-workbench-as-shared-refinement-authority)

**Removed.** All twenty `build` commands that stored Refinement Work in SQLite
— `refinement-story create|overview|pull|review|coherence|close|park` and
`change-request capture|attach|discard|select|confirm|resume|plan|mark-implemented|validate|done|park|reject|promote`
— together with the read that rendered active RS/CR in the `🧰 Refinement
field` of `build load`.

**Why.** CV20.DS12 made `docs/project/refinement/index.md` the canonical
Refinement authority, and the 2026-07-30 decision reduced these commands to
compatibility-only local state. Two authorities for the same work is a
standing invitation to disagree about focus, status, and identity; this closes
that by having one.

**What to do instead.** Keep Refinement Work in project files, where it is
reviewable, diffable, and shared. `build load` names the index when a project
has one, and names the file to create when it does not.

**Your rows are still there, and here is how to read them.** Nothing was
exported, migrated, reconciled, or deleted. Migrations `015`/`016` remain
applied and both tables keep their contents — Mirror does not remove data from
your home on your behalf. What went away is the *narrative* reader, so if you
still have rows worth keeping, this is the query:

```bash
sqlite3 "file:$HOME/.mirror-minds/<user>/memory.db?mode=ro&immutable=1" \
  "select display_code, title, status from builder_refinement_stories order by position;"

sqlite3 "file:$HOME/.mirror-minds/<user>/memory.db?mode=ro&immutable=1" \
  "select display_code, title, status, refinement_story_id
     from builder_change_requests order by position;"
```

The last Python-bearing release still renders them the old way if you would
rather read them there before moving anything into the index by hand.

**What still works.** Every other `build` command — the whole Ariad delivery
lifecycle, Pull through Done — is untouched. A journey that already keeps
Refinement Work in project files, which is every journey that adopted the
canonical index, sees exactly one change: the field on an index-less project
now says `authority: project files (not started)` and names the file to
create, instead of reporting an empty SQLite store.

---

## Release tooling leaves the product command surface

`python -m memory runtime release-doctor` and `runtime release-promote` are
gone from the product command surface. The front door answers both names in one
line pointing here and exits 1.

**Why.** They were offered to every installed user, and no installed user can
run them: they need a git checkout, a clean working tree, local tags, a
`stable` branch, and push rights to the repository. A command surface that
offers an operation only its maintainer can perform is not a feature, it is a
trap with a good error message. CV22.DS10.US2 decided (D1) that the release
chain is maintainer tooling rather than product.

**What replaces them.** Both moved, unchanged in substance, to scripts run from
the repository:

```bash
cd ts
npm run release:doctor  -- --target vX.Y.Z [--stable origin/stable]
npm run release:promote -- --target vX.Y.Z [--stable stable] [--remote origin] [--dry-run] [--push]
```

The doctor performs the same eight checks in the same order — repository, clean
tree, package version, release note, note heading, release index link, tag
state, stable-ref relation — and is still strictly read-only: it does not tag,
merge, push, fetch, or edit files. Promotion still runs the doctor first and
refuses on any failure, still refuses to move a tag that points anywhere other
than `HEAD`, and still reaches a remote only under an explicit `--push`.

**What still works if you do nothing.** Everything, for everyone who is not
cutting a release. No product command changed behavior, and `runtime status`,
`version`, `diagnose`, `release-notes`, `update`, `backup`, and `migrate` are
unaffected. A maintainer on the last Python-bearing release can still run the
old commands there; on this release, run the `npm run release:*` scripts
instead.

**One thing to know.** The chain is unchanged in shape — release note →
doctor → promote → `stable` + GitHub Release — and push, tag, stable promotion
and publication all remain separate, explicitly authorized steps. US3 appends
npm publication and the dist-tag move to the same ordered step list.

---

## The Python core

**Story:** [CV22.DS10.TS5](../project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts5-python-core-deletion/index.md) ·
**Decisions:** [The Python core is gone](../project/decisions.md#the-python-core-is-gone-and-the-answers-nobody-can-grade-any-more-are-the-front-doors-own) ·
[deleted forward, with one recovery point](../project/decisions.md#the-python-core-is-deleted-forward-with-one-recovery-point-cv22-last-python-bearing)

**Removed.** The Python core and every way to reach it: the `memory` package
(`src/memory/`), `python -m memory …` and `uv run python -m memory …`, `uv sync`,
`pyproject.toml`, and `uv.lock`. With it went:

- **the Python API** — `from memory import MemoryClient` and everything under it;
- **the Python extension API** — `extension.py`, `register(api)`,
  `ExtensionAPI`, and the `api_for_test` helper (the host that called
  `register` was already gone since the [compatibility-host cutoff](#the-extension-compatibility-host-and-registerapi-as-a-core-served-contract));
- **the migration's revert variables** — the twenty-three `MIRROR_TS_<FAMILY>`
  gates that sent a command back to Python, `MIRROR_TS_MCP` among them;
- **three path variables** only the Python core read: `EXPORT_DIR`,
  `TRANSCRIPT_EXPORT_DIR`, and `DB_BACKUP_PATH`.

Mirror Mind is one TypeScript package run by Node.js 24 or newer.

**Why.** CV22 ported every command to TypeScript one at a time, each proven
against the Python engine before it answered users, and by the end nothing
reached Python any more. Keeping it would have meant shipping, installing, and
maintaining a second engine that answered nothing. The last tree that contains
it is the [`cv22-last-python-bearing`](https://github.com/mirror-mind-ai/mirror/tree/cv22-last-python-bearing)
tag.

**What to do instead.**

- **Run commands through the front door.** Every command, its arguments, and
  its output are what they were; only the program in front changed. The
  program names itself `mirror`; until the npm package installs it, `mirror`
  is this invocation, from the repository
  ([Running a command](../../REFERENCE.md#running-a-command)):

  ```bash
  NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts <command>
  ```

- **Clean your `.env`.** Remove any `MIRROR_TS_<FAMILY>=0` line and the three
  path variables above: they are inert, and `mirror runtime diagnose` names the
  revert variables if they are still set. The `MIRROR_TS_*_REPLAY` fixture
  paths and `MIRROR_TS_MCP_GUARDS` are unaffected.
- **Check your identity file.** A home created by `init` before this release
  may still say `uv run python -m memory identity edit user identity` in
  `identity/user/identity.yaml`, and in the `user` identity row it seeded. The
  command is now `mirror identity edit user identity`, or `/mm-identity` in a
  runtime. Mirror does not rewrite your identity on your behalf.
- **If you had code that imported the Python core**, there is no programmatic
  API to move it to: use the command line or the MCP server. Anything that
  depends on Python internals — Mirror Desktop among them — stays on the last
  Python-bearing release.
- **If you author extensions**, declare a runtime per capability, as the
  [compatibility-host cutoff](#the-extension-compatibility-host-and-registerapi-as-a-core-served-contract)
  already asked; a manifest's `requires: extension_api` is no longer read.

**What still works if you do nothing.** Every command, every runtime, every
mode, and every existing `memory.db`: the TypeScript engine applies any pending
migration the first time it opens a database, backup first. The runtime hooks
have run on Node since this story's first plateau. Three answers changed on
purpose:

- a mistyped command or subcommand gets the front door's own usage error —
  exit 1 for a command, exit 2 for a subcommand, the family's name where the
  Python parser printed `__main__.py`;
- `runtime migrate` answers `applied`, `nothing pending`, or `declined`, and
  `declined` now exits non-zero where it used to report success;
- usage lines and hints name `mirror` instead of the Python program.

**If a runtime stops logging after the update.** The hooks need `node`, and a
runtime launched from the desktop may not have it on its `PATH`. Nothing
breaks — the hook is skipped and one line is written to
`<mirror home>/hooks.log` — but conversations stop being recorded. Set
`MIRROR_NODE` to the path of `node`
([troubleshooting](../process/troubleshooting.md#hooks-skip-when-a-runtime-cannot-find-node)).

**Mirror Desktop, the Windows installer, and the Frame.** Desktop pins to the
last Python-bearing release, as the [journey projections cutoff](#journey-projections-and-mirrorjourney-projections10)
says. The Windows installer and the Frame still install and call the Python
engine in this tree; CV22.DS10.US3 re-homes them onto the npm package and adds
its own cutoff here.

---

<!-- CV22.DS10.US3 (npm distribution) adds its cutoff here, including what the
     Windows installer and the Frame become. -->
