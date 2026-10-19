[< Story](index.md)

# Test Guide — CV21.DS5.US2

## Automated Validation

Tests first, each failing before its change:

- `ts/test/extensions/extensionPlugin.test.ts`: the generator as a pure function from
  a fixture `claude` catalog to a sorted file map; the generation advances by one on
  an added, a changed, and a removed skill, and holds on an identical tree in any
  order; the three manifests agree on name, version, and the description naming the
  home; skill directory names match `expose-claude`'s; frontmatter verbatim; no hooks,
  no `mcpServers`, no `commands`; the atomic replace leaves no `plugin.next/`.
- `ts/test/extensions/catalogWrites.test.ts`: install, uninstall, and sync regenerate
  the plugin; the report's block with stand-in `PATH` and homes and fixture copies:
  only actionable lines, the one-line summary when wired, "still has" after an
  uninstall; the golden re-pinned with additions only.
- `ts/test/runtime/wiring.test.ts`: the extension plugin's strings per runtime,
  functions of the plugin directory and the user; the canonical lines held.
- `ts/test/runtime/pluginWiring.test.ts`: the readers by marketplace and name, the
  canonical cases unchanged; `agyPluginCopyState` absent, current, stale; stale as
  not-equal for the ext plugin.
- `ts/test/runtime/diagnose.test.ts`, `status.test.ts`: the `ext_plugin_*` findings
  and the skills count; nothing on a home without a plugin or a machine without wiring.

Then, from the repository root: `npm run typecheck`, `npm run lint`, `npm test`,
`node ts/scripts/checkPackContents.ts`, `node ts/scripts/checkDocLinks.ts`,
`node ts/scripts/buildClaudePlugin.ts --check` (the canonical plugin is untouched),
`bash scripts/smoke_npm_package.sh`, `bash scripts/smoke_claude_plugin.sh` (step 3 is
CR142 on this machine).

The route is a committed script in this story package, re-runnable; raw outputs stay
under its scratch directory, and the baseline beside it.

## E2E Decision

Required. Steps 2–4 are the E2E: the installed `claude`, `codex`, `agy`, and `grok`
from the shipped package in scratch homes, read by their own listings, with no model
call and no login. A model session is US3's.

## Navigator Validation

Every step runs with a scratch `HOME` and each runtime's own home variable, from an
empty project, and records version, binary, and date; a step refuses when a runtime's
version differs from the probe's.

**Step 0 — the probe.** `bash route.sh setup`, then `probe`. Expected observation:
four versions; Grok's skill count for TS1's fixture plugin installed with and without
`--trust`; Codex's listed version after a plugin's version changes and it is re-added.
Pass: both readings made. Fail: a binary absent, or a reading the probe cannot make.

**Step 1 — the plugin.** `bash route.sh generate`. Expected observation: the tree
listed before any install and exactly plan.md's layout, no link in it, `0700`;
version `0.1.1`, byte-identical on a second install with the version held; the
report's plugin block with one actionable line per runtime on stand-in `PATH` and
homes, none for Pi, none for an absent runtime; the count the same in the report,
`status`, and the tree. Pass: all of it. Fail: an extra file, a version that advances
with no change, a line for Pi, an absent runtime, or a wired one.

**Step 2 — the wiring.** `bash route.sh wire`. Expected observation: a negative read
on each clean scratch `HOME`; then, after the printed step, Claude Code `plugin list`
names the plugin,
Codex's prompt lists `mirror-ext-<user>:ext-review-copy`, agy stages
`skills/ext-review-copy`, Grok lists `ext-review-copy` from the plugin. Pass: all
four. Fail: any reader not listing it.

**Step 3 — the three transitions.** `bash route.sh change`. Expected observation: a
second extension added, version `0.1.2`, three stale findings with their reinstalls
and no Claude finding, the install report printing the same commands, the readers
listing both skills after the reinstalls; `review-copy`'s skill changed, `0.1.3`, the
same findings, the change listed after the reinstalls; `review-copy` uninstalled,
`0.1.4`, the report's "still has" lines, and after the reinstalls no reader lists it;
`diagnose` clean after each round. Pass: as stated. Fail: a missing or extra finding,
a generation advancing by other than one, or a reader still listing a removed skill
after its reinstall.

**Step 4 — two homes, diagnose on a broken wiring, and the cost.** `bash route.sh
two-homes`, `diagnose`, then `cost`. Expected observation: both plugins listed on
every runtime, named for their homes in their descriptions; a dangling Claude link, a
duplicated Grok copy, and a copy at a version the home never produced each one
finding; a clean home none; Codex's prompt size with no plugin, one skill, and
thirteen stand-in skills, the per-extension bytes recorded. Pass: as stated. Fail: a
collision, a finding on a clean home, or a "never produced" copy left silent.

**Step 5 — static.** `bash route.sh static`. Expected observation: the contract's
external-skill section carries the layout and the version rule, REFERENCE's
`extensions` row the report's block; pack-contents and both smokes green.

**Step 6 — clean, then untouched.** `bash route.sh clean`, then `untouched`. Expected
observation: Grok's leader stopped under each scratch `GROK_HOME`, the scratch
directory gone, every entry of the real configuration hashing as the baseline
recorded it beside the scratch directory. Pass: zero changed. Fail: any change.

## Validation Evidence

**Driver, 2026-10-19.** Tests first: `extensionPlugin.test.ts` (12, failing on the
missing module, then green), the extension-plugin cases in `wiring.test.ts` (4),
`pluginWiring.test.ts` (3), `extensionPluginWiring.test.ts` (10), `catalogWrites.test.ts`
(2), `status.test.ts` (1); `npm test` 3,365 tests, 3,362 pass, 3 skipped, 0 fail;
`npm run typecheck` and `npm run lint` clean; `checkPackContents`, `checkDocLinks`,
`buildClaudePlugin.ts --check` (the canonical plugin untouched) clean;
`smoke_npm_package` 70/0; `smoke_claude_plugin` steps 1
2 pass, step 3 CR142 on this
machine. The golden `ext-catalog-writes.golden.json` edited by hand: seven `stdout`
fields gain the plugin line, a script having confirmed each change is an append and
nothing else; the tree comparison drops `runtime/plugin/` as a documented divergence;
the row is in `ts/test/goldens/README.md`.

Measured 2026-10-19 (19:56
20:40 UTC) with `bash route.sh` on the scratch install of
package 0.35.0: claude 2.1.296, codex 0.163.0, agy 1.4.2, grok 1.0.62, the binaries
as TS1 recorded them. The cells are in [`evidence/table.tsv`](evidence/table.tsv); raw
outputs stayed under the scratch directory.

**Step 0, `setup` 3 passed, `probe` 4 passed.** Grok refuses a non-interactive
install of any plugin without `--trust` ("Plugins can run hooks, MCP servers, and
skills on your machine, so installation needs explicit trust"), a skills-only one
included: not listed without, listed with. So the step keeps `--trust` and its
consent line says what there is to trust (decision 2). Codex keeps one cache
directory per version (`0.1.1`, then `0.1.2` after the re-add) and its prompt lists
the re-added one; the reader's newest-by-semver matches the generated version.

**Step 1, `generate` 15 passed.** The tree is exactly the plan's four files, no
link, `0700`; version `0.1.1`; the skill byte-identical to the catalog's; no `hooks`,
`mcpServers`, or `commands`; the description `Extensions of the Mirror home us2user:
1 skill`. The report's block on the real `PATH`: four not-wired lines with their
steps, Codex's two on two lines, Grok's consent line, no line for Pi. A second install
with nothing changed: byte-identical tree, version held. A stand-in `PATH` holding
only a fake `codex`: Codex's line and no other (the route's first version put
`/opt/homebrew/bin` ahead of the scratch prefix and ran the machine's global
`mirror`; corrected). The count 1 three ways: report, `status`, tree.

**Step 2, `wire` 8 passed.** Per runtime in its scratch `HOME`: a negative read, the
printed step run as printed, the reader: Claude Code `plugin list` names
`mirror-ext-us2user`; Codex's prompt lists `mirror-ext-us2user:ext-review-copy`; agy
stages `skills/ext-review-copy`; Grok lists `ext-review-copy` from
`plugin:mirror-ext-us2user`; the next report has no line for the wired runtime. One
finding on the way: Claude Code's `ln -s` failed on a home with no `~/.claude/skills/`
yet, so the printed step gained `mkdir -p ~/.claude/skills &&`; the canonical
plugin's step has the same latent gap (Debt Review).

**Step 3, `change` 42 passed.** Added (`us2-second`, a stand-in): `0.1.2`;
`diagnose` `ext_plugin_codex_cache_stale`, `ext_plugin_agy_copy_stale`,
`ext_plugin_grok_copy_stale`, no Claude finding; the report's reinstall run per
runtime; every reader lists the new skill; `diagnose` clean. Changed
(`review-copy`'s skill edited in place): `0.1.3`, the plugin carries the change, the
same findings, reinstalls, readers, clean. Removed (`uninstall review-copy`):
`0.1.4`, the report's `Grok Build: still has ext-review-copy` line, the same
findings; after the reinstalls no reader lists it and Claude Code's link no longer
shows it. The route's first version refreshed the report with `sync --extensions-root
examples/`, which rewrote the catalog from that root and made the version advance
twice per transition; corrected to a no-op install from the home's own `extensions/`.

**Step 4, `two-homes` 4 passed, `diagnose` 4 passed.** A second home `us2other`,
its plugin wired by its own printed steps beside the first: Claude Code lists both
plugins, Codex's prompt both, agy stages both, Grok lists both. On a clean home no
finding; a dangling link `ext_plugin_claude_link_dangling`; two Grok copies (the same
directory installed from `/tmp` and `/private/tmp`) `ext_plugin_grok_copies_duplicated`;
a copy whose manifest reads `0.1.9`, a version the home never produced,
`ext_plugin_grok_copy_stale`, not silence.

**`cost`.** Codex's `debug prompt-input`: 12,395 bytes with no plugin, 12,604 with
one skill, 14,237 with thirteen stand-in skills: about 136 bytes per extension per
turn, name and description.

**Step 5, `static` 5 passed.** The contract section, REFERENCE's findings, links,
pack contents, the npm smoke; the plugin smoke's step 3 is CR142.

**Step 6, `clean`, then `untouched`.** The scratch directory removed; the baseline
kept beside it; **1,965 entries of the real configuration hash as before setup**,
the hash diff this time.

**Debt Review payments, 2026-10-19, after Validation.** (1) The canonical plugin's
Claude Code step gained `mkdir -p ~/.claude/skills &&` in `wiring.ts`, `diagnose`'s
relink route, Getting Started §6, and the contract's wiring table; `initCli.test.ts`
and `wiring.test.ts` pin it. (2) Measured on codex 0.163.0: `codex plugin add`
replaces the cache directory — after a re-add at 0.1.2 only `0.1.2` remains, after a
re-add at a lower 0.1.0 only `0.1.0`, which the prompt lists — so the reader's newest
entry is Codex's only entry; recorded in the reader's comment, no code change. (6)
The report block names installed extensions the plugin does not carry, `not carried
(no claude block in skill.yaml): …`; the golden gained that line on five cases, by
hand, additions only. `npm test` 3,367 tests, 3,364 pass; `generate` 15/0 and `wire`
8/0 re-run on the paid code; `untouched` 1,965 entries unchanged.
