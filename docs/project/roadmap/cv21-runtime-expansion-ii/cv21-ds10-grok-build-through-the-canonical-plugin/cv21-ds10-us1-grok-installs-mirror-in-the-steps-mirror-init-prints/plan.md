# Plan — CV21.DS10.US1

## Objective

Give a Grok Build user the install path the other plugin runtimes already have:
`mirror init` prints Grok's wiring when it finds `grok` on the `PATH`, in two steps —
Codex's count — and `runtime diagnose` and `runtime update` know that wiring the way
DS4.TS6 taught them Codex's. The path is proven on the installed Grok from a scratch
prefix and a scratch `HOME`, with no model call: the plugin loads with its 25 skills, its
hooks, and its MCP entry, and the Operating Instructions are loaded as a rule Grok reads
in every project, without depending on the project carrying an `AGENTS.md`.

The steps were chosen by measurement, not at the desk. The probe below ran on
**grok 1.0.62** (DS12 measured 1.0.52) on 2026-10-18 and settled the shape; this plan
has one branch. It also found that the plugin as shipped today loses its MCP entry and
its version on Grok — a plugin change the Navigator decides at approval (decision 1).

What is already true, and not redone here: the plugin's hooks fire under Grok (DS12.TS4
L1) and label the session `grok_build` with replies logged from Stop (DS2.US8), the MCP
entry starts without `${CLAUDE_PLUGIN_ROOT}` (DS2.US6) — whether Grok attaches it to the
model's session is TS2's — and the SessionEnd close is deferred on Grok's 1.5 s bound
(DS4.TS2). US1 ships the printed steps, their diagnosis, and the manifest fix that lets
Grok see the MCP entry; it does not change a hook or the server.

## Step 0 — The Probe, Measured

`bash route.sh probe`, grok 1.0.62 (1474f9cbdd91), binary
`~/.grok/downloads/grok-1.0.62-macos-aarch64`, package 0.35.0, 2026-10-18 16:46 UTC,
in a scratch `HOME`/`GROK_HOME` from an empty project; read through
`grok inspect --json` (`plugins`, `skills`, `hooks`, `mcpServers`,
`projectInstructions`), `grok plugin list --json`, and `grok plugin details`. The real
`~/.grok` and `~/.claude` hashed unchanged before and after (`route.sh untouched`,
111 entries). Raw outputs stayed under the scratch directory.

| Shape | Skills | Hooks | MCP | Notes |
|---|---|---|---|---|
| (a) the Claude link alone, `~/.claude/skills/mirror-mind` | 25, source `user` | none | none | Grok's Claude compatibility scans the skills; a Claude Code user on Grok has skills without logging |
| (b) a link in `~/.grok/plugins/mirror-mind` | discovered (`provides.skills: 25`) but **0 loaded** | registered | none | user-directory plugins load nothing until named in `[plugins] enabled` in `~/.grok/config.toml`; `grok plugin enable` refuses them ("not found": it serves the install registry only) |
| (b′) the same plus the config entry by hand | 25 | registered | none | in place, never stale — at the price of a config edit |
| (c) `grok plugin install "<plugin>" --trust` | 25, source `plugin` | registered | **none** | one step, from a path with a space outside `$HOME`; a real copy (39 files, 0 symlinks) at `~/.grok/installed-plugins/mirror-mind-<hash of the source path string>/`; `[plugins] enabled = ["mirror-mind"]` written to `config.toml` |
| (c′) refresh of a stale copy | | | | `grok plugin update mirror-mind` prints "local symlink, already live" and copies nothing (the copy is not a symlink); `install` again over the same path string is refused ("already installed"); the same path spelt differently (`/tmp` vs `/private/tmp`) installs a **second copy** keyed by the new string, and Grok loads one of them; `uninstall mirror-mind --confirm` removes one copy per call and leaves `enabled = ["mirror-mind"]` in `config.toml`; `uninstall` then `install` lands the new version. **The level-up is uninstall + install, with the same path string `init` printed** |
| (d) (a) plus (c) | **50 entries, 25 names**, both sources, none qualified | registered once | none | a Claude Code user who wires Grok sees each skill twice in the menu; the hooks run once |
| (e) `~/.grok/rules/mirror-mind.md → <pkg>/AGENTS.md` | — | — | — | **loaded**: `projectInstructions` lists it, scope `global`, fileType `rules`, **~2,233 tokens** by Grok's own count, as a link or a file, in a trusted and in an untrusted project; `[paths] extra_rule_dirs` loads it too. A project `AGENTS.md` in an untrusted directory is not loaded |
| (m) which manifest Grok reads | | | | the root `plugin.json` marker DS7.US1 added on 2026-10-17 (four days after DS12 measured Grok) **shadows `.claude-plugin/plugin.json`**: `plugin details` says "hooks" where 1.0.52 said "hooks, MCP servers", `plugin list` reports `version: null`, and `inspect` lists no MCP server in every shape above. Without the marker: version 0.35.0 and the server listed. A `.grok-plugin/plugin.json` beside it is ignored. A `.mcp.json` beside it restores the server but not the version. **The marker carrying `version` and `mcpServers` restores both**; agy 1.4.2 stages that variant byte-identical to today's except the marker itself, with one warning: `plugin.json: unknown field "mcpServers" is ignored` |

The decision rule read against the table: (b) alone does not load the skills, and (b′)
needs a config edit the plan ranked below a link or an install, so the install step is
**(c)**; the rules link **(e)** loads, so it is step 2. Nothing in the (c) shape has a
path with a space in it (the copy lives under `~/.grok`), so the hook commands' quoting
(DS2.TS5) is exercised only through the copied `hooks.json` bytes; its live reading moves
to US3.

## Scope

**The manifest fix (decision 1).** `ts/src/guards/claudePlugin.ts` writes the root
`plugin.json` marker from the same source as `.claude-plugin/plugin.json`: `name`,
`description`, and now `version` and `mcpServers`. `buildClaudePlugin.ts --check` holds
the committed marker equal to the generated one, as it does the manifest. Its test in
`ts/test/scripts/claudePlugin.test.ts`: the marker parses, carries the manifest's
version and `mcpServers` byte for byte, and the tree's copy equals the generated text.
Static re-checks, in the route's `guards` step, on every runtime that reads the plugin
directory: `claude plugin validate` and `claude plugin details` still say "MCP servers
(1)"; `agy plugin validate` passes with the one "unknown field" warning accepted;
`codex plugin add` from the shipped marketplace into a scratch `CODEX_HOME` followed by
`codex mcp list` still names one server; `grok plugin validate` says "version 0.35.0 …
hooks, MCP servers". A second server on any runtime is a stop condition.

**What `mirror init` prints** (`ts/src/runtime/wiring.ts`).

- `RuntimeName` gains `"grok"`; `RUNTIME_WIRING.grok` is `title: "Grok Build"`,
  `command: "grok"`, two steps:
  1. `grok plugin install "<pkg>/plugins/mirror-mind" --trust`, then the note, in
     the guide's own words: `--trust` activates the plugin's hooks and MCP server, and
     Grok does not ask again (security amendment 4); the plugin is copied, so after an
     update `mirror runtime diagnose` names the command that brings it level.
  2. `ln -s "<pkg>/AGENTS.md" ~/.grok/rules/mirror-mind.md`, then the note: the
     Operating Instructions, loaded as a rule in every Grok session (~2.2k tokens), in
     every project (ai-engineer amendment 10).
- `ORDER` ends with `grok`, and `wiring.test.ts` asserts `ORDER` covers every key of
  `RUNTIME_WIRING` (engineer amendment 7). The header comment gains Grok's paragraph in
  the style of the others, naming 1.0.62.
- `grokPluginReinstallCommand(root)` beside `CODEX_PLUGIN_ADD_COMMAND`: the one string
  `diagnose` and `update` print —
  `grok plugin uninstall mirror-mind --confirm && grok plugin install "<root>/plugins/mirror-mind" --trust`
  — a function of the root, since Grok keys the copy by the path string and a
  differently spelt path installs a second copy (the CR071 lesson).
- Tests first: `ts/test/runtime/wiring.test.ts` (the Grok case; the "honest counts"
  test gains Grok 2; the Pi, Claude Code, Codex, and Antigravity lines held unchanged)
  and `ts/test/frontDoor/initCli.test.ts` (the `Grok Build:` block with a stand-in
  `grok` on the `PATH`, and no block without).

**What `runtime diagnose` and `runtime update` know** (`ts/src/runtime/pluginWiring.ts`,
`diagnose.ts`, `update.ts`).

- `grokPluginCopyState(grokHome, installedVersion)` reads
  `installed-plugins/registry.json` for every repo whose `plugins` carry `mirror-mind`,
  and each copy's version through `installedPluginVersion(copyRoot)` — the reader that
  already exists, on the copy's `.claude-plugin/plugin.json` (engineer amendment 7).
  States: `absent`, `current`, `behind`, `ahead` (silent, as Codex's), and the copy
  count. A registry that does not parse reads as absent.
- `claudePluginLinkState` becomes `pluginLinkState(linkPath)`; the Claude call site
  passes its path; no wrapper remains. The same reader reads
  `~/.grok/rules/mirror-mind.md` (security amendment 5).
- `pluginWiringFindings` emits, with `$GROK_HOME` else `~/.grok` defaulted at the
  entry and never inside a reader (the CR123/128/137/142 lesson):
  `grok_plugin_copy_behind` (newest copy < installed; `repair_route` the reinstall
  command), `grok_plugin_copies_duplicated` (more than one copy; Grok loads one of them,
  and which is not stated; `repair_route` uninstall until one remains, then the
  reinstall command), and `grok_rules_link_dangling` (relink or remove). Absence is not
  drift: no registry, no copy, no link fire nothing.
- `update.ts` adds the post-update hint beside Codex's, against the landed version.
- Tests first: `ts/test/runtime/pluginWiring.test.ts` (fixture registries: absent,
  current, behind, ahead, two copies, unparseable; the link reader absent/healthy/
  dangling), `diagnose.test.ts`, `update.test.ts`.

**The plugin guard where the binary is present.** `scripts/smoke_claude_plugin.sh`
step 0 runs `grok plugin validate "$PLUGIN_DIR"` beside `claude plugin validate` when
`grok` is on the `PATH`, asserts its output names "MCP servers" and a version, and says
it skipped when `grok` is absent, as the Claude check does.

**Docs the printed steps make stale** — the two tables that must agree with `init`'s
output, and nothing more; README, REFERENCE, the Getting Started run section, and the
contract's Grok reference implementation are TS4's.

- `docs/getting-started.md` §6 "Wire Your Runtime": a **Grok Build** row with the two
  steps, the trust note, the token note, and the findings a Claude Code user needs:
  the Claude link alone gives Grok the skills and nothing else, and with both wired each
  skill appears twice in Grok's menu while the hooks run once. The sentence above the
  table counts "two for Codex and Grok Build".
- `docs/product/specs/runtime-interface/index.md` "Installed package wiring": a Grok
  Build row with the two steps, 1.0.62, and a D13 column that says the home-level rule,
  ~2.2k tokens, every project.
- `docs/project/decisions.md`: one entry, "Grok Build installs Mirror as a trusted
  plugin copy, with the Operating Instructions as a home rule", recording the probe
  table above with version, binary, and date; the shapes not chosen and why ((b′)'s
  config edit; `.mcp.json`'s missing version; `.grok-plugin/` ignored); the marker
  carrying what Grok reads; the global scope and token cost of the rule; that `grok
  plugin update` is a no-op for a local source and the level-up is uninstall + install;
  and that printing is not automating (the `runtime install` non-goal stands).
- `route.sh static` greps the two printed steps verbatim in both tables (QA
  amendment 8).

**The story package.** `route.sh` gains, beside `setup`, `probe`, `untouched`, and
`clean`: `static` (pack, install into the prefix with a space, a stand-in `grok` on the
`PATH`, `mirror init` with a scratch `HOME`, the Grok block checked against the probe's
selection, the other four blocks held; the docs grep; `smoke_npm_package.sh` and
`smoke_claude_plugin.sh`), `guards` (the cross-runtime manifest checks above, each
skipped with a note where its binary is absent), `grok` (the two printed steps on the
real binary from a scratch `HOME`, read back structurally: 25 skills from source
`plugin`, the hooks file registered, the `mirror-mind` server listed, the rule loaded
as `global`; then uninstall, the rule link removed, the copy and the link gone; the
`enabled` entry `uninstall` leaves behind noted, not failed), and `diagnose` (in the
scratch `HOME`: a copy written one version behind, a second copy from a respelt path,
the rules link pointed at a path that does not exist — each one finding naming the path
and the one repair; then nothing with the wiring removed). `HOME` and `GROK_HOME` are
both set; raw outputs stay under the scratch directory; evidence in `test-guide.md` by
summary, with version, binary, and date (devops/security amendment 6).

## Non-Goals

- Whether Grok attaches the listed MCP server to the model's session (DS12.TS4 L6): TS2.
  US1 ends at "listed" — which, after decision 1, it is.
- A live Grok session: US3 measures L3, the rule followed by the model (a deterministic
  question only `AGENTS.md` answers), the `grok_build` logging through the shipped
  install, the quoted hook commands as Grok runs them, the 1.5 s close, and whether
  Grok's session-start plugin auto-update touches a local-path copy (hand-off,
  amendment 10).
- README, REFERENCE, the Getting Started "### Grok Build" run section, the contract's
  Grok reference implementation, and the developer's double-hook case when this
  checkout is opened in Grok (the tree's `.claude/settings.json` beside the plugin's):
  TS4.
- Any change to the plugin's hooks, `hooks.json`, the MCP entry's command, or
  `AGENTS.md`. The marker change (decision 1) is the one plugin edit.
- The in-place shape (b′). It is recorded as the alternative; a user who prefers a link
  that never goes stale can read it in decisions.md.
- A Grok marketplace file; running the steps for the user; `[plugins].paths` and
  `[paths] extra_rule_dirs` as the printed wiring.
- `review-copy` and user extensions on Grok: DS5.

## Acceptance Behavior

```text
Given the package installed in a scratch prefix, and grok on the PATH
When the user runs mirror init <name>
Then the Grok Build block reads
     1. grok plugin install "<prefix>/lib/node_modules/mirror-mind/plugins/mirror-mind" --trust
     2. ln -s "<prefix>/lib/node_modules/mirror-mind/AGENTS.md" ~/.grok/rules/mirror-mind.md
     with the trust note under the first and the token note under the second
And the Pi, Claude Code, Codex, and Antigravity blocks read as before
And both steps appear verbatim in Getting Started §6 and the contract's wiring table

Given the package installed in a scratch prefix, and no grok on the PATH
When the user runs mirror init <name>
Then no Grok Build block prints

Given a scratch HOME on the installed Grok, with no Claude link and no project AGENTS.md
When the user runs the two printed steps
Then grok inspect --json lists as many mm-* skills as the installed plugin has skill
     directories, every one from source plugin:mirror-mind; the plugin's hooks file
     registered; the mirror-mind MCP server with transport stdio; and the rule
     ~/.grok/rules/mirror-mind.md loaded with scope global
And grok plugin list --json reports version equal to the installed plugin's
And no trust prompt stands between the steps and a session

Given the same scratch HOME with the Claude link added
When grok inspect --json is read
Then each mm-* name appears twice, once from source user and once from the plugin,
     and the hooks file is registered once

Given a Grok copy one version behind the installed package, or two copies, or a
      rules link that no longer reads
When the user runs mirror runtime diagnose
Then one finding per defect names the path and the one command that repairs it
And a machine with no Grok wiring at all reports nothing about Grok

Given the committed plugin tree
When buildClaudePlugin.ts --check runs
Then the root plugin.json carries the manifest's version and mcpServers
And claude, agy, codex, and grok each still see exactly one MCP server
```

## Validation Route

**Automated (Driver).** From the repository root: `npm run typecheck`, `npm run lint`,
`npm test`, `node ts/scripts/checkPackContents.ts`, `node ts/scripts/checkDocLinks.ts`,
`node ts/scripts/buildClaudePlugin.ts --check`, `bash scripts/smoke_npm_package.sh`,
`bash scripts/smoke_claude_plugin.sh`. The new tests fail before the change and pass
after it; the wiring lines of the other four runtimes are held by `wiring.test.ts`.

**Navigator, step 0 — the probe.** Done, above. `bash route.sh probe` re-runs it; the
table is the pass condition, and a different `grok --version` is a re-probe.

**Navigator, step 1 — what `init` prints.** `bash route.sh static`. Expected: the
Grok Build block as in Acceptance, the other four blocks unchanged, both steps found
verbatim in the two docs tables, both package smokes green with `grok plugin validate`
naming the version and "MCP servers". Fail: a step that differs from the probe's
selection, a third step, a block changed, a doc table out of step.

**Navigator, step 2 — the manifest on every runtime.** `bash route.sh guards`.
Expected: one MCP server from `claude plugin details`, `codex mcp list` (scratch
`CODEX_HOME`, from the shipped marketplace), `agy plugin validate` (with its one
"unknown field" warning), and `grok plugin validate`. Fail: two servers anywhere, or a
validator refusing the marker.

**Navigator, step 3 — the wiring on the installed Grok.** `bash route.sh grok`: the
E2E — the real binary, the shipped file, no model. Expected and fail conditions as in
Acceptance, read from Grok's JSON by field, never by substring; then the undo leaves no
copy and no link.

**Navigator, step 4 — diagnose on a broken wiring.** `bash route.sh diagnose`.
Expected: one finding for the stale copy naming the reinstall command with the printed
path; one for the duplicate; one for the dangling rule; zero with the wiring removed.
Fail: a missing or extra finding, or any Grok finding on the clean home.

**Step 5 — untouched.** `bash route.sh untouched`: the real `~/.grok` (`config.toml`,
`settings.json`, `plugins/`, `rules/`, `installed-plugins/`, `marketplace-cache/`),
`~/.claude` (`settings.json`, `skills/`, `plugins/`), and `~/.gemini/config/plugins`
hash as they did before setup.

**E2E decision:** required, and step 3 is it. A model session is US3's.

## Implementation Contract

- Decision 1 is taken before any code; without it the MCP acceptance line cannot pass
  and the story stops.
- Tests first: `claudePlugin.test.ts`, `wiring.test.ts`, `initCli.test.ts`,
  `pluginWiring.test.ts`, `diagnose.test.ts`, `update.test.ts` fail, then the change
  makes them pass.
- Keep changes scoped to `CV21.DS10.US1`: the files named in Scope and this story
  package. No hook, MCP command, or `AGENTS.md` change.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- Decision 1 declined (navigator_decision_needed: the MCP entry stays invisible to Grok,
  and the acceptance line and TS2 both wait on it).
- Any runtime registers the MCP server twice, or refuses the marker, in step 2
  (navigator_decision_needed: the manifest shape changes).
- The installed `grok` changes version before step 3 (re-probe, as the evidence rule
  asks; 1.0.62 is the measured one).
- The route writes outside its scratch directory — `untouched` fails
  (navigator_decision_needed: the route cannot be isolated).
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix.

## Decisions Taken At Approval

Approved by the Navigator on 2026-10-18, as recommended:

1. **The root `plugin.json` marker carries `version` and `mcpServers`**, generated from
   the one source and drift-guarded. Recommended over `.mcp.json` (restores the server,
   not the version, and is a third MCP declaration the Claude-shaped runtimes may also
   read) and over removing the marker (DS7.US1 needs it for agy). Measured: Grok sees
   both; agy stages the same tree and ignores the field with a warning. Claude Code and
   Codex are re-checked statically in step 2.
2. **The install step is (c), the trusted copy**, by the rule the first plan stated:
   (b) loads no skills on its own, and (b′) asks for a config edit. The price — a copy
   that goes stale, refreshed by uninstall + install — is paid by `diagnose` and
   `update` naming the command.
3. **Step 2 is printed**: the home-level rule, ~2,233 tokens in every Grok session in
   every project. The alternative is no step 2 and the instructions only inside a
   trusted checkout that carries `AGENTS.md`, which an installed package never is.

Amendments 2–10 from the plan review (engineer, devops-engineer, quality-assurance,
security-engineer, ai-engineer; 2026-10-18) are folded into Scope and the route as
written above.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
