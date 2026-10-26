[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR177 — A Pi session in a clone also loads the installed Mirror package: 25 skill-collision warnings, and the extension twice

## Problem

A machine that develops Mirror in a clone and also runs an installed package wires Pi to
the package the way `mirror init` prints it: `pi install "<package root>"` writes a
personal package entry to `~/.pi/agent/settings.json`, and that package loads in every
directory. A Pi session opened in the clone also discovers the clone's own `.pi/skills/`
and `.pi/extensions/`. That session holds two copies of every Mirror skill and two of the
extension, at two real paths.

Pi keeps the clone's copies, because project resources outrank package resources, and
prints a `[Skill conflicts]` block at every session start: one collision per skill, 25
today, each naming the package copy it skipped. The extension loads twice with no
warning. The event guard in `mirror-logger.ts` lets one instance handle each event, and
the clone's loads first (Pi sorts project resources ahead of package ones and loads
extensions in that order), so behavior is right today. The guard is keyed by handler
slot, though, so a slot the clone adds or renames runs beside the package's older one on
the same event.

The repository describes only the linked topology. The development guide's `npm link`
makes the global package the clone itself, and the extension's header comment ("one
extension, reached twice") describes one file under two paths, which Pi 1.4.0 dedupes by
real path without a word. Where the global package is a real install, as a production
install kept current by `runtime update` is, the paths differ and the warnings appear.
Nothing in Mirror names the fix.

## Expected Behavior

On a machine whose Pi loads an installed Mirror package, a Pi session opened in a clone
loads only the clone's skills and extension: no collision warnings, one extension
instance. Sessions elsewhere keep the package's. Mirror names the setting that does this
where a developer meets the problem.

## Impact

Low. Nothing is lost or misrouted: the clone's skills win, and the guard keeps one logger
per event. The cost is noise, 25 warnings a session that teach a developer to skip the
startup diagnostics, and a latent double handling once the two extension copies diverge.

## Plan Or Decision

Captured, unassigned, 2026-10-26, at the Navigator's direction, from a Pi session in the
development clone after the v0.37.0 production update.

Pi already has the fix, and it is applied on the maintainer's machine as a workaround: a
project-scope entry for the same package, with empty filters, in the clone's
`.pi/settings.json`.

```json
{
  "enableSkillCommands": true,
  "packages": [
    { "source": "/opt/homebrew/lib/node_modules/mirror-mind", "skills": [], "extensions": [] }
  ]
}
```

Pi identifies a local package by its resolved absolute path, so in the clone this entry
replaces the personal one, and `[]` loads none of its skills or extensions. The path
belongs to one machine, so `.pi/settings.json` is no longer tracked and is ignored. Its
only setting, `enableSkillCommands: true`, is Pi's default.

Open for planning: where Mirror names the entry. Candidates are the development guide's
setup, beside `npm link`; `runtime diagnose` or the extension's session start, either of
which can see a personal Pi package at a root other than the clone's and print the entry
with the right path; and the extension's header comment, which should describe both
topologies. **Revisit:** the next change to the development guide's setup or to the Pi
extension.

## Evidence

Pi 1.4.0's own resolver and skill loader (`DefaultPackageManager.resolve` and
`loadSkills`), asked what a session in the clone loads:

- Before the entry: 25 `mm-*` skills from the clone, 25 collision diagnostics, and
  `mirror-logger.ts` from both `<clone>/.pi/extensions/` and
  `/opt/homebrew/lib/node_modules/mirror-mind/.pi/extensions/`.
- After it: 25 skills from the clone, no collisions, and one logger, the clone's.
- From `$HOME`, unchanged: 25 skills and the logger from the package, no collisions.

Pi's code agrees. In `dist/core/package-manager.js`, `dedupePackages` keeps a project
entry over a personal one with the same identity, `getPackageIdentity` is
`local:<resolved path>` for a local source, `applyPackageFilter` with `[]` disables every
resource of that type, and `toResolvedPaths` sorts project resources ahead of package
ones. In `dist/core/skills.js`, a skill at an already-loaded real path is skipped without
a warning, and a skill with a taken name at a different path is reported as a collision.

## Outcome

Pending: captured, not planned. The maintainer's machine carries the workaround.
