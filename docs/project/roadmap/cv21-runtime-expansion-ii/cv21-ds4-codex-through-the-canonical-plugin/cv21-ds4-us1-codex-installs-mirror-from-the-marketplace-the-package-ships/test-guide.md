[< Story](index.md)

# Test Guide — CV21.DS4.US1

## Automated Validation

From the repository root:

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkPackContents.ts
node ts/scripts/checkDocLinks.ts
node ts/scripts/buildClaudePlugin.ts --check
bash scripts/smoke_npm_package.sh
```

Expected: all green. The tests this story adds or changes —
`ts/test/runtime/wiring.test.ts` (Codex), `ts/test/frontDoor/initCli.test.ts` (the
`Codex:` wiring block), `ts/test/scripts/packContents.test.ts` (the manifest required),
and the marketplace cases in `ts/test/scripts/claudePlugin.test.ts` (the generated
manifest, and the tree's copy equal to it) — fail on the tree before the change and
pass after it. `smoke_npm_package.sh` gains a step that finds
`.agents/plugins/marketplace.json` in the installed package and resolves its plugin
path to the installed plugin manifest.

Must not change: the Pi, Claude Code, and Gemini CLI wiring lines (`wiring.test.ts`
holds them), and `smoke_npm_package.sh` step 10, the wrapper around a stand-in `codex`.
A difference in either is a failure of this story, not noise.

## E2E Decision

Required. The E2E is the Navigator's step 2 below: the real Codex binary installs the
plugin from the shipped file, with no model call. A model session is US4's.

## Navigator Validation

All steps run from this package directory and write only under a scratch directory
(`/tmp/cv21-ds4-us1` unless `DS4_US1_DIR` says otherwise). None touches `~/.codex`,
`~/.mirror-minds`, or the checkout. The scratch prefix path contains a space on
purpose.

**Step 1 — what `init` prints.**

```bash
bash route.sh static
```

Packs the tree, installs the tarball into a scratch prefix whose path holds a space,
puts a stand-in `codex` on the PATH, and runs `mirror init` with a scratch `HOME`.

- Expected observation: a `Codex:` block of exactly two numbered steps,
  `1. codex plugin marketplace add "<prefix>/lib/node_modules/mirror-mind"` and
  `2. codex plugin add mirror-mind@mirror-mind`, with the note about the one-time hook
  trust under the second; the Pi, Claude Code, and Gemini CLI blocks as before.
- Pass: both commands present with the package path filled in and quoted; nothing in
  the Codex block names `~/.codex/skills`, `~/.codex/AGENTS.md`, or
  `scripts/codex-mirror.sh`.
- Fail: either command missing, a third step, any of the three old names, or a change
  in another runtime's block.

**Step 2 — the install, and its removal, on the installed Codex.**

```bash
bash route.sh codex
```

Requires step 1's scratch prefix. With a scratch `HOME` and `CODEX_HOME`, runs the two
printed commands against the real `codex`, then `codex plugin list`,
`codex debug prompt-input hello` from an empty project directory, and `codex mcp list`;
then `codex plugin remove mirror-mind@mirror-mind` and
`codex plugin marketplace remove mirror-mind`. It prints `codex --version`,
`which -a codex`, and the date first, for the evidence below.

- Expected observation: the marketplace added from a path with a space; the plugin
  installed under `CODEX_HOME/plugins/cache/mirror-mind/mirror-mind/<package version>`;
  `config.toml` holding `[plugins."mirror-mind@mirror-mind"] enabled = true`; the
  count of distinct `mm-*/SKILL.md` in the rendered prompt equal to the number of
  skill directories in the installed plugin (25 today), with no `CODEX_HOME/skills`
  link in place; `mirror-mind` in `codex mcp list`; after removal, no cache directory
  and no `[plugins."mirror-mind@mirror-mind"]` entry.
- Pass: all six observations.
- Fail: `marketplace add` refused (a path outside `$HOME`, or with a space: DS12
  installed from `/tmp`, so the first would be new; both are stop conditions), a skill
  count below the plugin's, no plugin in the list, no server, or a removal that leaves
  the cache or the entry behind.

**Step 3 — the workspace marketplace, unprompted.**

```bash
bash route.sh workspace
```

Opens a scratch project holding a copy of the tree's `.agents/plugins/marketplace.json`
and `plugins/mirror-mind`, with a fresh scratch `CODEX_HOME`, and reads
`codex plugin list`, `codex plugin marketplace list`, and `config.toml` without
installing anything.

- Expected observation: Codex lists the project's marketplace, or ignores it; nothing
  is installed, and `config.toml` gains no `[plugins.…]` entry.
- Pass: no install, no enable.
- Fail (a stop condition, Navigator decision before Done): a plugin installed or
  enabled with no user action.

## Validation Evidence

**Driver, 2026-10-17.** Codex 0.162.1, `/opt/homebrew/bin/codex`, package 0.33.4 from
this tree.

- Automated: `npm test` 3223 pass, 0 fail (one skip: a global `mirror-hook` on the
  machine, environmental); typecheck, lint, `checkPackContents` (482 files),
  `checkDocLinks`, `checkSkillCommandParity`, `checkRetiredSurfaces`,
  `buildClaudePlugin --check` all clean; `smoke_npm_package` 80/0 with the new
  marketplace checks and step 10 (the wrapper) unchanged. The four new or changed
  tests were red before the change (`MARKETPLACE_PATH` not exported; the Codex
  wiring assertions against the old lines).
- `route.sh static` 12/0: the prefix `/private/tmp/cv21-ds4-us1/pre fix`, the two
  commands with the path quoted, the trust note, none of the three old names, and
  the Pi, Claude Code, and Gemini CLI blocks as before.
- `route.sh codex` 13/0, Driver dry run in isolation: marketplace added from a path
  outside `$HOME` with a space in it ("Installed marketplace root: …/pre fix/lib/node_modules/mirror-mind"); the plugin
  cached at `plugins/cache/mirror-mind/mirror-mind/0.33.4`; `config.toml` entry
  present; `codex plugin list`: `mirror-mind@mirror-mind  installed, enabled  0.33.4`;
  25 `mm-*/SKILL.md` in the rendered prompt, the plugin's 25, no skills link;
  `codex mcp list` names `mirror-mind` with the locator entry as written. Removal:
  the plugin's cache and files gone (Codex leaves the empty marketplace-level
  folder), the `config.toml` entry gone, the marketplace no longer listed. One route
  defect found and fixed: the cache check matched the empty marketplace folder by
  name.
- `route.sh workspace` 3/0: for a project carrying the tree's
  `.agents/plugins/marketplace.json` and plugin, `codex plugin marketplace list`
  answers "No plugin marketplaces in scope"; nothing listed, installed, or enabled,
  and no `mm-*` skill in the rendered prompt. Decision 4's stop condition does not
  arise on 0.162.1's CLI.

**Navigator, 2026-10-17 12:36 UTC.** `bash route.sh all` on Codex 0.162.1,
`/opt/homebrew/bin/codex`, package 0.33.4: **28 passed, 0 failed** (static 12, codex 13,
workspace 3). Marketplace root `…/pre fix/lib/node_modules/mirror-mind` accepted with its
space; plugin cached at `0.33.4`, `installed, enabled` in `codex plugin list`; 25 of 25
skills in the prompt with no skills link; `mirror-mind` in `codex mcp list`; removal
left no cache files and no `config.toml` entry; the project-level marketplace file
answered "No plugin marketplaces in scope", nothing installed or enabled.
