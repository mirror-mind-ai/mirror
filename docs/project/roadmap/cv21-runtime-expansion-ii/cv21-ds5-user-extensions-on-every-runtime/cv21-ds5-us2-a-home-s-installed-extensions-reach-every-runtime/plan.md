# Plan — CV21.DS5.US2

## Objective

Build the shape TS1 chose: a Mirror home's installed extensions reach Claude Code,
Codex, Antigravity, and Grok Build as one generated plugin per home, in the canonical
plugin's format, installed the way each runtime takes the canonical plugin. The
generator runs inside `mirror extensions install` and `uninstall`, so the plugin is
never stale with respect to the home; the wiring step and the reinstall are printed,
never run, as `mirror init`'s policy stands; and `runtime diagnose` names a copy
behind the generated version the way it names the canonical plugin's. What TS1
measured and this plan takes as given: the skill reaches each runtime from a plugin
(TS1 shape (b), all four); Claude Code links and reads in place; Codex, agy, and Grok
copy, and one command each brings the copy level; a plugin named per home installs
beside another's; the installed manifests need no change, the plugin carries their
`claude` skill.

Three decisions are the Navigator's at approval, below.

## Step 0 — The Probe

`bash route.sh setup` packs the checkout, installs it into a scratch prefix whose path
holds a space, installs `review-copy` into a scratch Mirror home, and records the
real-configuration baseline beside the scratch directory (TS1's lesson). `bash
route.sh probe` records version, binary, and date per runtime and settles two things
the build depends on, with no model call:

1. **Grok without `--trust`.** The generated plugin carries skills only. The probe
   installs TS1's fixture plugin with and without `--trust` and reads `grok inspect
   --json`: if the skills load without it, the printed step omits it, and the consent
   line it carries (DS10.US1) is not needed for a plugin with nothing to consent to
   (decision 2).
2. **Codex's cache key.** Codex caches a plugin under `<marketplace>/<name>/<version>/`
   (TS1). The probe installs the fixture at version `0.1.1`, changes it to `0.1.2`,
   re-adds, and reads which version Codex's prompt now lists, so `diagnose`'s "behind"
   can be read from the cache the way `codexPluginCacheState` reads the canonical
   plugin's.

## Scope

**The generator** (`ts/src/extensions/extensionPlugin.ts`, new). From the home's
`claude` catalog, `runtime/skills/claude/extensions.json` (`command_name`,
`installed_skill_path`), the same reader `expose-claude` projects from, so the plugin
carries what `expose-claude` exposes by construction and the manifest's `claude` block
has one reader (amendment 1). It writes `runtime/plugin/` under the Mirror home:

```text
runtime/plugin/
  .agents/plugins/marketplace.json        name mirror-ext-<user>; one plugin, ./mirror-ext-<user>
  mirror-ext-<user>/
    .claude-plugin/plugin.json             name, version, description; no hooks, no mcpServers
    plugin.json                            the root marker Grok and agy read (DS10.US1): the same three fields
    skills/<dir>/SKILL.md                  one per installed extension that declares a claude block
```

- `<user>` is the home's directory name, as `mirror load` names it. The manifests'
  `description` reads `Extensions of the Mirror home <user>: N skills`, so two homes
  tell apart in a runtime's plugin list (amendment 20).
- `<dir>` is `filesystemSkillDirName(command_name)` of the catalog entry, the
  directory `expose-claude` writes (`ext:review-copy` → `ext-review-copy`), and the
  file is the catalog's `installed_skill_path`, copied as content, frontmatter
  verbatim (amendment 17). An extension declaring no `claude` block (two of the
  twenty installed) has no catalog entry and is not in the plugin; the report says so.
- The plugin holds only regular files the generator wrote: never a link, never a
  `hooks`, `mcpServers`, or `commands` field; directory names come through
  `filesystemSkillDirName`, which strips path characters (amendment 13).
  `runtime/plugin/` is created `0700` like the rest of the home (amendment 15).
- **Version.** `0.1.<generation>`, where the generation is read from the existing
  manifest and advanced by one when the generated tree differs from the one on disk,
  byte for byte, and held when it does not. Codex keys its cache by version and
  `diagnose` compares versions, so the version is what tells a runtime "behind";
  a regeneration that changes nothing must not advance it, or every install would
  print a reinstall.
- The generator is a pure function of the catalog plus the previous generation to a
  file map, sorted by path, so discovery order never changes the tree (amendment 4);
  the tests compare maps. One writer replaces the tree atomically: it writes
  `runtime/plugin.next/` and renames it over `runtime/plugin/`, so Claude Code,
  which reads through a link to that path, never sees a half tree (amendment 3).

**Install, uninstall, and sync regenerate** (`ts/src/extensions/catalogWrites.ts`,
`catalogCommands.ts`). `installExtension` and `uninstallExtension` call the generator
after the catalogs, for the whole home (fact 4: rebuild from everything installed);
`extensions sync` regenerates too, so a person who edited a skill in place or took a
package update has a verb that is not a no-op reinstall (amendment 6). Their reports
gain a block that prints what needs action and nothing else (amendment 18):

```text
  plugin: mirror-ext-<user> 0.1.3, 4 skills
    Claude Code: not wired — ln -s "<home>/runtime/plugin/mirror-ext-<user>" ~/.claude/skills/mirror-ext-<user>
    Codex: copy at 0.1.2 — codex plugin add mirror-ext-<user>@mirror-ext-<user>
    Grok Build: copy at 0.1.2 — grok plugin uninstall mirror-ext-<user> --confirm && grok plugin install "<home>/runtime/plugin/mirror-ext-<user>"
```

and when nothing needs action, one line: `plugin: mirror-ext-<user> 0.1.3, 4 skills,
wired on Claude Code, Codex, Antigravity, Grok Build`. After an uninstall the line is
tied to what the person did: `Codex: still has ext-review-copy — codex plugin add …`
(amendment 19). One line per runtime on the `PATH` (`detectRuntimes`), from the same
readers `diagnose` uses, so the two cannot disagree; a runtime not on the `PATH` is
not mentioned, and Pi is never mentioned. The block goes to stdout after the existing
report lines, so a caller that parses the report sees new lines at the end, not
changed ones; `ext-catalog-writes.golden.json` is re-pinned once, with the block, and
the diff shows additions only (amendment 11). The readers take every home from the
env the caller hands in (`HOME`, `CODEX_HOME`, `GROK_HOME`), so the route and the
goldens pass stand-ins and a maintainer's real wiring never reaches a fixture
(amendment 8).

**The wiring per runtime** (`ts/src/runtime/wiring.ts`). Beside `RUNTIME_WIRING`, an
`EXTENSION_PLUGIN_WIRING` with, per runtime, the one-time step and the reinstall, both
functions of the plugin directory and the user, so `extensions install`, `diagnose`,
and `update` print one string (the CR071 lesson):

| runtime | wiring (once) | reinstall (per change) |
|---|---|---|
| Claude Code | `ln -s "<dir>" ~/.claude/skills/mirror-ext-<user>` | none: a link reads in place |
| Codex | `codex plugin marketplace add "<home>/runtime/plugin"`, then `codex plugin add mirror-ext-<user>@mirror-ext-<user>` | `codex plugin add mirror-ext-<user>@mirror-ext-<user>` |
| Antigravity | `agy plugin install "<dir>"` | the same command |
| Grok Build | `grok plugin install "<dir>"` (`--trust` per decision 2) | `grok plugin uninstall mirror-ext-<user> --confirm && grok plugin install "<dir>"` |

Grok's step carries its own consent line: the plugin holds skills only, no hooks and
no server to activate, whichever way decision 2 goes (amendment 14). `mirror init`
does not print these: at `init` there is no extension and no plugin. `extensions
install` prints them when needed, as above.

**What `diagnose` and `status` know** (`ts/src/runtime/pluginWiring.ts`,
`diagnose.ts`, `status.ts`).

- The readers take the plugin's identity: `codexPluginCacheState(codexHome,
  marketplace, name, version)` reads `plugins/cache/<marketplace>/<name>/` (the
  canonical plugin is `mirror-mind/mirror-mind`, the ext plugin
  `mirror-ext-<user>/mirror-ext-<user>`; `CODEX_PLUGIN_CACHE_SEGMENTS` becomes a
  function of both, amendment 2), `grokPluginCopyState(grokHome, name, version)`
  reads the registry for repos carrying `name`, a new `agyPluginCopyState(geminiHome,
  name, version)` reads `.gemini/config/plugins/<name>/plugin.json`, and
  `pluginLinkState` reads the Claude link. The canonical plugin's call sites pass
  their names and keep their behavior.
- For the ext plugin, stale is **not equal**, not "less than" (amendment 5): the home
  generates every version, so a copy at a version the home does not hold is stale
  whichever way it differs. A `runtime/plugin/` removed by hand restarts the
  generation, and a copy that then reads "ahead" must still fire.
- `extensionPluginFindings(mirrorHome, env)` emits, with every home defaulted at the
  entry and never inside a reader (CR123/128/137/142): `ext_plugin_codex_cache_stale`,
  `ext_plugin_agy_copy_stale`, `ext_plugin_grok_copy_stale`, each with the reinstall
  as `repair_route`; `ext_plugin_claude_link_dangling`; `ext_plugin_grok_copies_duplicated`.
  Absence is not drift: no plugin, no cache, no copy, no link fire nothing, and a
  runtime not on the `PATH` fires nothing.
- `runtime status` lists the plugin with its version and skills count under the
  extension health block, read from the generated manifest. The report's count,
  `status`'s count, and the number of `skills/*/SKILL.md` in the tree are the same
  number, asserted equal in the route (amendment 12).
- `runtime update` prints nothing new: the plugin belongs to the home, not the package.

**Docs the build makes stale.** The contract's "External Skill Runtime Surface
Contract" section gains the generated plugin beside the catalogs: the layout above,
the version rule, and the rule that a runtime reads the plugin and not the source
tree. REFERENCE's `extensions` row gains the report's plugin block. Getting Started,
README, and the invocation names are TS4's.

**Tests first.**

- `ts/test/extensions/extensionPlugin.test.ts`: the file map from a fixture `claude`
  catalog (one entry, two entries, none); the generation advances by one on an added,
  a changed, and a removed skill, and holds on an identical regeneration and on the
  same entries in another order; the three manifests carry the same name, version,
  and description; the skill directory names match `expose-claude`'s; the frontmatter
  is the source's bytes; no hooks, no `mcpServers`, no `commands`; the atomic replace
  leaves no `plugin.next/` behind.
- `ts/test/extensions/catalogWrites.test.ts`: install and uninstall regenerate; the
  report's plugin block with a stand-in `PATH` (each runtime present or absent) and
  fixture copies (absent, current, behind).
- `ts/test/runtime/wiring.test.ts`: the five strings per runtime; the one-time and the
  reinstall are functions of dir and user.
- `ts/test/runtime/pluginWiring.test.ts`: the readers by marketplace and name (the
  canonical cases held unchanged; the ext cases absent, current, stale either way,
  two copies); `agyPluginCopyState`.
- `ts/test/runtime/diagnose.test.ts`, `status.test.ts`: the findings and the count;
  nothing on a home without a plugin.

**The story package.** `route.sh`, with TS1's helpers: `setup`, `probe` (above),
`generate` (install `review-copy`, the tree byte-checked against the plan's layout,
the report's block with stand-in `PATH` and homes; the tree listed and asserted to
hold exactly the planned files before any install, amendment 13), `wire` (a negative
read per runtime on its clean scratch `HOME`, then the printed step, then TS1's
readers, amendment 10), `change` (the three transitions, each one generation and
each confirmed on every runtime after its reinstall, amendment 9: a second extension
added from a stand-in, `review-copy`'s skill changed, then `uninstall` removing it;
`diagnose` names three stale copies and no Claude finding each time; the counts
agree three ways), `two-homes` (a second scratch home's plugin wired beside the
first on each runtime), `diagnose` (a dangling Claude link, a duplicated Grok copy, a
copy at a version the home never produced, nothing on a clean home), `cost` (Codex's
`debug prompt-input` size with no plugin, one skill, and thirteen stand-in skills, the
per-extension bytes recorded, amendment 16), `static` (docs grep, pack-contents, both
smokes), `clean` (Grok's leader under each scratch `GROK_HOME` stopped, amendment 7),
`untouched`.

## Non-Goals

- Running the wiring or the reinstall for the person. The policy is `mirror init`'s:
  printed, read first, run by the person. The alternative is decision 1.
- A live session on any runtime: US3 runs `review-copy` through this on each, with the
  real body and a provider key, and a `command-skill` through `mirror ext`.
- The canonical plugin's agy copy finding (`diagnose` has none today): noted, not
  added here; the ext reader is written so it could serve both.
- `expose-claude --target-root` and `clean-claude`: the project-level projection
  stays as it is. Pi's catalog and `mirror-logger`: untouched.
- Changing a manifest, a `runtimes:` block, or the validator's `claude`/`pi`
  conventions; a `codex`, `antigravity`, or `grok` block in `review-copy/skill.yaml`.
- Extensions declaring no `claude` block: they stay off the four runtimes, and the
  report says which.
- Getting Started, README, the invocation names per runtime, the parity matrix.

## Acceptance Behavior

```text
Given a scratch Mirror home ts2user with review-copy installed from examples/extensions
When mirror extensions install review-copy runs
Then runtime/plugin/.agents/plugins/marketplace.json names mirror-ext-ts2user,
     runtime/plugin/mirror-ext-ts2user/.claude-plugin/plugin.json and plugin.json
     carry name mirror-ext-ts2user, version 0.1.1, no hooks, no mcpServers,
     skills/ext-review-copy/SKILL.md is review-copy's claude skill byte for byte,
     and the report's plugin block prints one "not wired" line with its step for each
     runtime on the PATH, none for Pi, none for a runtime absent from the PATH

Given the same home
When mirror extensions install review-copy runs again with nothing changed
Then the tree is byte-identical and the version is still 0.1.1

Given the printed step run for each runtime in its scratch HOME
When each runtime's reader runs
Then Claude Code lists plugin mirror-ext-ts2user, Codex lists
     mirror-ext-ts2user:ext-review-copy, agy stages skills/ext-review-copy,
     Grok lists ext-review-copy from plugin:mirror-ext-ts2user

Given review-copy's SKILL.md changed in the home and install run again
When mirror runtime diagnose runs
Then version 0.1.2; ext_plugin_codex_cache_behind, ext_plugin_agy_copy_behind, and
     ext_plugin_grok_copy_behind each name the copy and the reinstall; no Claude finding;
     and the install report printed the same three commands
And after the three reinstalls the readers list the change and diagnose is clean

Given mirror extensions uninstall review-copy
When the plugin and diagnose are read
Then skills/ has no ext-review-copy, version 0.1.3, three "behind" findings,
     and after the reinstalls no reader lists ext-review-copy

Given a second scratch home ts2other with its own plugin
When its printed steps run in the same scratch HOMEs
Then every runtime lists both plugins, named for their homes

Given a dangling Claude link, or two Grok copies
When mirror runtime diagnose runs
Then one finding each names the path and the repair

Given a home with no extensions, or a machine with no runtime wired
When mirror runtime diagnose runs
Then nothing about the extensions plugin is reported
```

## Validation Route

**Automated (Driver).** From the repository root: `npm run typecheck`, `npm run lint`,
`npm test`, `node ts/scripts/checkPackContents.ts`, `node ts/scripts/checkDocLinks.ts`,
`node ts/scripts/buildClaudePlugin.ts --check`, `bash scripts/smoke_npm_package.sh`,
`bash scripts/smoke_claude_plugin.sh` (its step 3 is CR142 on this machine). The new
tests fail before the change and pass after it; the canonical plugin's reader tests
are held unchanged.

**Navigator, step 0 — the probe.** `bash route.sh setup`, then `probe`. Expected: four
versions; Grok's skills with and without `--trust`; Codex's cache after a version
change. Fail: a binary absent, or a reading the probe cannot make.

**Navigator, step 1 — the plugin.** `bash route.sh generate`. Expected: the tree as
Acceptance states, byte-identical on a second install, the report's block per
runtime on a stand-in `PATH`. Fail: an extra file, a version that advances with no
change, a line for Pi or for an absent runtime.

**Navigator, step 2 — the wiring on the installed runtimes.** `bash route.sh wire`:
the E2E, the real binaries, no model. Expected: the four readers list the skill as
Acceptance states. Fail: a reader that does not.

**Navigator, step 3 — a change and an uninstall.** `bash route.sh change`, then
`uninstall`. Expected: the findings, the printed commands, the readers after the
reinstalls, as Acceptance states. Fail: a missing or extra finding, a reader still
listing a removed skill after its reinstall.

**Navigator, step 4 — two homes, and diagnose on a broken wiring.** `bash route.sh
two-homes`, then `diagnose`. Expected: both plugins listed everywhere; one finding
each for the dangling link and the duplicate; nothing on a clean home. Fail: a
collision, or a finding on a clean home.

**Step 5 — static.** `bash route.sh static`: the contract and REFERENCE carry the
layout and the block; pack-contents and the smokes green.

**Step 6 — clean, then untouched.** `bash route.sh clean`, then `untouched`, the
baseline beside the scratch directory.

**E2E decision:** required, and steps 2–4 are it: the installed binaries from the
shipped package. A model session is US3's.

## Implementation Contract

- Decisions 1–3 are taken at approval; the generator, the readers, and the printed
  strings follow them.
- Tests first: `extensionPlugin.test.ts`, `catalogWrites.test.ts`, `wiring.test.ts`,
  `pluginWiring.test.ts`, `diagnose.test.ts`, `status.test.ts` fail, then the change
  makes them pass.
- Keep changes scoped to `CV21.DS5.US2`: the files named in Scope, the contract
  section, REFERENCE's row, and this story package. No manifest, no canonical plugin
  file, no Pi file.
- The route reads and writes only under its scratch directory, except `untouched`;
  no model call; no login.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- Decision 1 reversed to "run the reinstalls" (navigator_decision_needed: the
  printing policy changes, and `init`'s with it).
- A runtime refuses the generated plugin in step 2 for a reason the manifest cannot
  meet (navigator_decision_needed: the format).
- The installed `claude`, `codex`, `agy`, or `grok` changes version between `probe`
  and a later step (re-probe).
- `untouched` fails (navigator_decision_needed: the route cannot be isolated).
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix.

## Decisions For Approval

1. **Print, never run.** `extensions install` prints the wiring and the reinstall;
   `diagnose` names them; the person runs them. Recommended: it is `init`'s policy,
   the commands carry consent (`--trust`, a marketplace add), and a tool that runs
   `grok plugin uninstall` on the person's behalf is a different product. The
   alternative, `mirror extensions install --wire`, is one flag away later.
2. **Grok's `--trust`, by the probe.** If a skills-only plugin loads without it, the
   printed step omits it and the consent line; if not, the step keeps both and the
   line says the plugin has no hooks and no server to activate. Recommended: follow
   the probe.
3. **The version rule.** `0.1.<generation>`, advanced on a changed tree, held on an
   identical one. The alternative, a content hash as the version, is not semver and
   Codex's cache names directories by it. Recommended: the generation.

## Decisions Taken At Approval

Approved by the Navigator on 2026-10-19, with all twenty amendments from the plan
review folded (engineer 1–4, devops-engineer 5–8, quality-assurance 9–12,
security-engineer 13–15, ai-engineer 16–17, product-designer 18–20):

1. **Print, never run** (decision 1, as recommended): `extensions install`, `uninstall`,
   and `sync` print the wiring and the reinstall; `diagnose` names them; the person
   runs them.
2. **Grok's `--trust` by the probe** (decision 2, as recommended), with the consent
   line saying the plugin carries skills only (14).
3. **The version is `0.1.<generation>`** (decision 3, as recommended), advanced by one
   on an added, changed, or removed skill, held on an identical tree in any order
   (4, 9); stale is not-equal for the ext plugin (5).
4. **The generator reads the `claude` catalog** (1), writes sorted, replaces the tree
   atomically (3), copies frontmatter verbatim (17), and holds only files it wrote (13).
5. **The report prints what needs action** (18), names a removal as such (19), and the
   manifest's description names the home (20); `sync` regenerates (6); readers take
   marketplace and name (2) and their homes from the env (8); the golden is re-pinned
   with additions only (11); counts agree three ways (12); the route carries the
   negative reads (10), the cost reading (16), and stops Grok's leader (7); the home's
   mode is `0700` (15).

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
