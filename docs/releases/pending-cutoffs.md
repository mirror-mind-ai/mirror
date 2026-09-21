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

<!-- CV22.DS10.TS2 (extension compat host), TS3 (eval harness), US2 (npm-era
     updater), TS4 (unported surfaces), TS5 (Python deletion), and US3 (npm
     distribution) add their cutoffs here. -->
