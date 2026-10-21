[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR158 — A Pi catalog whose skill files are gone loads no extension, while the status line still counts them and nothing reports it

## Problem

`mirror extensions install` and `sync` write a home's Pi catalog,
`runtime/skills/pi/extensions.json`, with absolute paths: its `target_root`, and for
each extension the `installed_skill_path` Pi is told to trust
([the contract](../../../product/specs/runtime-interface/index.md#pi-runtime-consumption-prep)).
The paths are spelled the way the home was reached when the command ran. When they
stop resolving — a home reached through a link that later goes, a home moved or
renamed, a runtime folder removed — the catalog still parses, and the Pi extension
treats it as healthy:

- `resources_discover` keeps only the paths that exist, and logs only when at least
  one loads. With none, it returns no skill and writes no line.
- The status line counts the catalog's entries (`ext 7`), not the skills that loaded.
- Session start logs `External skills: <command names>` from the same entries.

Nothing else looks. `runtime status` grades an installed extension by its manifest and
migrations, and `runtime diagnose`'s extension findings are about the per-home plugin.
Neither reads a runtime catalog's paths. The plugin generator drops a Claude catalog
entry whose file is missing just as silently, and reports the result as `0 skills`.

The same copy goes stale just as quietly: a materialized `SKILL.md` is a copy, so
when a linked extension's source changes, Pi serves the old text until someone runs
`sync`.

## Expected Behavior

- The Pi extension tells a listed skill from a loaded one. The status line counts the
  skills that loaded and shows the gap when there is one (`ext 0/7`). A catalog entry
  whose file is missing is logged once per session as a warning, with the count and
  the first missing path.
- `runtime diagnose` reports a runtime catalog (`pi`, `claude`) whose skill paths are
  missing or lie outside the home's own `runtime/skills/<runtime>/`, and a
  materialized `SKILL.md` that differs from the installed extension's. Each finding
  names `mirror extensions sync --runtime <runtime> --target-root
  <home>/runtime/skills/<runtime>` as its repair. A home with no catalog is not a
  finding.
- The plugin report says why an extension is not carried: no `claude` block, or a
  Claude catalog entry whose file is missing.

## Impact

Every extension a home has installed drops out of its Pi sessions at once, while the
status line says they are there. The person finds out when they reach for one. Nothing
is lost: the extensions, their tables, and their bindings are intact, and `sync`
restores the catalog. On the maintainer's development home it lasted nine days and 35
sessions. The same blindness would let a catalog copied along with a home keep loading
the original home's copies ([CR156](cr156-a-home-made-by-copying-another-s-database-is-the-same-home-twice.md)).

## Plan Or Decision

Captured, unassigned, 2026-10-21, at the Navigator's direction, while making
`session-export` work again on the maintainer's development home. Not planned. One
question for planning: whether `install` and `sync` should also write the home's
resolved path, so a link to a home can never be written into its catalogs, or whether
reporting is enough. Current Focus unchanged.

## Evidence

Measured 2026-10-21 on the development home, `~/.mirror-minds/vinicius-dev`:

- Its Pi catalog, written 2026-08-31, named `~/.mirror-minds/vinicius-ts/runtime/skills/pi`
  as its `target_root` and put all seven `installed_skill_path`s under it. Its Claude
  catalog, written 2026-07-23, did the same.
- `~/.mirror-minds/vinicius-ts` is a plain folder, created 2026-10-12, holding only a
  `mirror-logger.log`. The development home's `mirror-logger.log` records
  `resources_discover: loaded 7 installed Pi external skill(s)` for the last time at
  2026-10-12T16:42Z. Since then, 35 session starts have logged `External skills:` with
  the catalog's names, and none has loaded a skill. The paths most likely resolved
  through a link to the development home until that day.
- The materialized `ext-session-export/SKILL.md` was the 2026-07-14 copy, still
  telling the model to run `uv run python -m memory ext session-export …`. The
  extension's source, which the home links to, has said `mirror ext session-export …`
  since 2026-10-16. The production home's catalog, rewritten 2026-10-21, served the
  current text.
- Repaired with `mirror extensions sync --runtime pi --target-root
  ~/.mirror-minds/vinicius-dev/runtime/skills/pi`: seven entries, every path inside the
  home and present, and the `SKILL.md` equal to its source. The same `sync`
  regenerated the per-home plugin from the Claude catalog, which is still stale:
  `mirror-ext-vinicius-dev 0.1.1, 0 skills`, with `persona-export` "not carried (no
  claude block in skill.yaml)", though its manifest declares one. The catalog predates
  its install.

In code: in `.pi/extensions/mirror-logger.ts`, `getInstalledPiSkillPaths` filters by
`existsSync`, `setMirrorStatus` counts the catalog's entries, and the session-start
line lists them. In `ts/src/extensions/extensionPlugin.ts`, `claudeCatalogEntries`
filters by `existsSync`. Nothing under `ts/src/runtime/` reads a runtime catalog.

## Outcome

Open.
