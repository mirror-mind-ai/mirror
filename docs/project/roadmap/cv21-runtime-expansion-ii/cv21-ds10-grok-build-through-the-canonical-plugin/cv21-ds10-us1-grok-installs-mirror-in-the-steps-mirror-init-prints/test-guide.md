[< Story](index.md)

# Test Guide — CV21.DS10.US1

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
bash scripts/smoke_claude_plugin.sh
```

Expected: all green. The tests this story adds or changes —
`ts/test/scripts/claudePlugin.test.ts` (the root marker carries the manifest's version
and `mcpServers`; the tree's copy equals the generated text),
`ts/test/runtime/wiring.test.ts` (the Grok Build case, the honest counts with Grok 2,
`ORDER` covering every `RUNTIME_WIRING` key), `ts/test/frontDoor/initCli.test.ts` (the
`Grok Build:` block with a stand-in `grok` on the `PATH`, none without),
`ts/test/runtime/pluginWiring.test.ts` (the registry reader on fixture registries:
absent, current, behind, ahead, two copies, unparseable; the link reader absent,
healthy, dangling), `ts/test/runtime/diagnose.test.ts` (the three Grok findings and
their absence on a clean home), and `ts/test/runtime/update.test.ts` (the post-update
hint) — fail on the tree before the change and pass after it.
`smoke_claude_plugin.sh` reports `grok plugin validate` passed, naming a version and
"MCP servers", on a machine with `grok`, and says it skipped on one without.

Must not change: the Pi, Claude Code, Codex, and Antigravity wiring lines
(`wiring.test.ts` holds them); `claude plugin details` still reporting "MCP servers
(1)". A difference there is a failure of this story.

## E2E Decision

Required. The E2E is the Navigator's step 3 below: the real Grok binary loads the
shipped plugin through the two printed steps, read back from `grok inspect --json` by
field, with no model call. A model session is US3's.

## Navigator Validation

All steps run from this package directory and write only under a scratch directory
(`/tmp/cv21-ds10-us1` unless `DS10_US1_DIR` says otherwise). None touches `~/.grok`,
`~/.claude`, `~/.gemini`, `~/.mirror-minds`, or the checkout; every Grok command runs
with a scratch `HOME` and `GROK_HOME`. The scratch prefix path contains a space on
purpose. Each step prints `grok --version`, every `grok` on the `PATH`, and the date
first. Raw outputs stay under the scratch directory and are not committed; the summary
each step prints is what this file records.

**Step 0 — the probe.** Done on 2026-10-18 (grok 1.0.62); the table is in
[plan.md](plan.md#step-0--the-probe-measured). `bash route.sh setup` then
`bash route.sh probe` re-runs it.

- Expected observation: the same table — (a) skills only; (b) discovered, nothing
  loaded; (b′) loaded after the config entry; (c) skills and hooks, MCP absent with the
  marker, present without; (c′) `update` a no-op, re-install refused, a respelt path a
  second copy; (d) 50 entries, 25 names, hooks once; (e) the rule loaded as `global`,
  ~2,233 tokens; (m) the marker carrying `version` and `mcpServers` restores both,
  agy staging unchanged but for the marker.
- Pass: the table holds. Fail: a different `grok --version` with a different row — a
  re-probe before implementation, as the evidence rule asks.

**Step 1 — what `init` prints.**

```bash
bash route.sh static
```

- Expected observation: a `Grok Build:` block of exactly two numbered steps —
  `1. grok plugin install "<prefix>/lib/node_modules/mirror-mind/plugins/mirror-mind" --trust`
  with the trust note, and
  `2. ln -s "<prefix>/lib/node_modules/mirror-mind/AGENTS.md" ~/.grok/rules/mirror-mind.md`
  with the token note; the Pi, Claude Code, Codex, and Antigravity blocks as before;
  both steps found verbatim in Getting Started §6 and the contract's wiring table; both
  package smokes green.
- Pass: both steps present with the package path filled in and quoted, no third step,
  no other block changed, both docs in step.
- Fail: either step missing or different, a third step, a change elsewhere, a doc
  table out of step.

**Step 2 — the manifest on every runtime.**

```bash
bash route.sh guards
```

Runs, each in a scratch configuration and each skipped with a note where its binary is
absent: `claude plugin validate` and `claude plugin details mirror-mind`;
`agy plugin validate`; `codex plugin marketplace add` and `codex plugin add` from the
shipped marketplace into a scratch `CODEX_HOME`, then `codex mcp list`;
`grok plugin validate`.

- Expected observation: Claude Code "MCP servers (1)"; agy "Validation passed" with
  one `unknown field "mcpServers" is ignored` warning; Codex one `mirror-mind` server;
  Grok "version <package version> … hooks, MCP servers".
- Pass: exactly one server everywhere; no validator refuses.
- Fail: two servers on any runtime, or a refusal.

**Step 3 — the wiring on the installed Grok.**

```bash
bash route.sh grok
```

With a scratch `HOME`, runs the two printed steps against the real `grok`, reads back
`grok plugin list --json`, `grok plugin details mirror-mind`, and `grok inspect --json`
from an empty project directory, then undoes the wiring
(`grok plugin uninstall mirror-mind --confirm`, the rule link removed).

- Expected observation: as many `mm-*` skills as the installed plugin has skill
  directories (25 today), every one from source `plugin:mirror-mind`; the hooks file
  registered once from the copy; the `mirror-mind` MCP server, transport `stdio`; the
  rule loaded with scope `global`; `plugin list --json` reporting the installed
  plugin's version; after the undo, no copy under `installed-plugins/`, no link under
  `rules/`, and the `enabled = ["mirror-mind"]` line `uninstall` leaves in
  `config.toml` noted.
- Pass: every count and listing as expected, and the copy and the link gone afterwards.
- Fail: a count below the plugin's, a skill from source `user`, no hooks, no server,
  no rule, a null version, or a copy or link left behind.

**Step 4 — diagnose on a broken wiring.**

```bash
bash route.sh diagnose
```

In the scratch `HOME`: the copy's manifest written one version behind the installed
package; then a second copy installed from a respelt path; then the rule link pointed
at a path that does not exist; `mirror runtime diagnose` after each; then the wiring
removed and `diagnose` once more.

- Expected observation: `grok_plugin_copy_behind` naming the copy and the reinstall
  command with the printed path; `grok_plugin_copies_duplicated` naming both copies;
  `grok_rules_link_dangling` naming the link; then no Grok finding at all.
- Pass: one finding per defect, zero on the clean home.
- Fail: a missing or extra finding, a repair command that differs from `init`'s path,
  or any Grok finding on the clean home.

**Step 5 — untouched.**

```bash
bash route.sh untouched
```

- Expected observation: every entry of the real `~/.grok` (`config.toml`,
  `settings.json`, `hooks/`, `skills/`, `plugins/`, `rules/`, `installed-plugins/`,
  `marketplace-cache/`, `trusted-hook-projects`), `~/.claude` (`settings.json`,
  `settings.local.json`, `skills/`, `plugins/`), `~/.gemini/config/plugins`, and
  `~/.config/mirror/env` hashes as it did before setup.
- Pass: every hash equal (111 entries on 2026-10-18).
- Fail: any difference — the route escaped its scratch directory.

Afterwards, `bash route.sh clean` removes the scratch directory and stops any Grok
leader spawned under a scratch `HOME`.

## Validation Evidence

**Driver, 2026-10-18.** `npm run typecheck`, `npm run lint`, `npm test` (3329 tests,
3326 pass, 0 fail, 3 skipped as before), `checkPackContents` (488 files, clean),
`checkDocLinks` (clean), `buildClaudePlugin.ts --check` (in sync). The new tests —
the marker (2), wiring (3), init (1), the Grok readers and findings (11), the update
hint (1) — were red before the change and are green after it.

**Step 0, 16:46 UTC.** grok 1.0.62 (1474f9cbdd91), `~/.grok/bin/grok` →
`~/.grok/downloads/grok-1.0.62-macos-aarch64`, package 0.35.0. The table in
[plan.md](plan.md#step-0--the-probe-measured) holds as written.

**Step 1, `static`: 16 passed, 0 failed.** The Grok Build block: the two steps with
the prefix-with-a-space path quoted, the trust note, the scope and token note, exactly
two numbered steps, no shape not chosen named; Pi, Claude Code, Codex, and Antigravity
blocks as before; five blocks, Grok Build last; no Grok block with no `grok` on the
`PATH`; both steps verbatim in Getting Started §6 and the contract's wiring table;
`smoke_npm_package.sh` green; `smoke_claude_plugin.sh` green through step 4 with
`grok plugin validate passed (grok 1.0.62): version and MCP servers read`. Its step 5
("no hooks.log line after mirror-hook went missing") fails on this machine on the
unchanged tree too: the hook wrappers probe `/opt/homebrew/bin` for `mirror-hook`,
and a global install sits there, so the "missing" condition never occurs here; CI has
no global install. Pre-existing, recorded for the Debt Review.

**Step 2, `guards`: 6 passed, 0 failed.** Claude Code 2.1.296: validate passes,
details "MCP servers (1)". agy 1.4.2: validate passes, `mcpServers 1`, the one warning
`unknown field "mcpServers" is ignored`. Codex 0.163.0: the plugin added from the
shipped marketplace into a scratch `CODEX_HOME`, `codex mcp list` names `mirror-mind`
once. grok 1.0.62: validate says version 0.35.0 and "hooks, MCP servers".

**Step 3, `grok`: 11 passed, 0 failed.** The two printed steps on the installed Grok
from a scratch `HOME`/`GROK_HOME`: 25 `mm-*` skills, all from source
`plugin:mirror-mind`, none from `user`; the hooks file registered once from
`~/.grok/installed-plugins/mirror-mind-6453a858/hooks/hooks.json`; the `mirror-mind`
MCP server listed, transport `stdio`; the rule loaded with scope `global`, ~2,233
tokens; the plugin enabled with hooks provided; `plugin list` installed at 0.35.0;
the copied `hooks.json` keeps its five quoted commands. Undo: no copy left, the rules
link removed; `config.toml` keeps `enabled = ["mirror-mind"]`, as `uninstall` leaves it.

**Step 4, `diagnose`: 7 passed, 0 failed.** The copy at 0.1.0: `grok_plugin_copy_behind`
alone, "copied 0.1.0 < installed 0.35.0", the repair the reinstall line with the printed
path. A second copy from the respelt path: `grok_plugin_copies_duplicated`, both keys
named. The rules link at a path that does not exist: `grok_rules_link_dangling` with the
relink route. The wiring removed: no Grok finding.

**Step 5, `untouched`: 111 entries unchanged** after every step above.
