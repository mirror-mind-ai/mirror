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

---

<!-- CV22.DS10.TS3 (eval harness), US2 (npm-era updater), TS4 (unported
     surfaces), TS5 (Python deletion), and US3 (npm distribution) add their
     cutoffs here. -->
