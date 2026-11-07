[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR197 — The hook wrappers and the MCP locator accept a relative `MIRROR_BIN`, so Node can run a JavaScript file from the project the session is in

## Problem

`MIRROR_BIN` names the directory holding `mirror` and `mirror-hook`
(`$(npm prefix -g)/bin`). It exists for the readers that run from a runtime's plugin
cache, where no relative path reaches the Mirror tree. Two readers take it:

- The plugin's hook wrappers, bin and agy forms (`scripts/generate_hook_wrappers.sh`,
  `ENTRY_BIN`): `[ -x "$MIRROR_BIN/mirror-hook" ] && ENTRY="$MIRROR_BIN/mirror-hook"`,
  then `"$NODE" "$ENTRY" "$HOOK"`.
- The plugin's MCP locator (`ts/src/guards/claudePlugin.ts`, `MCP_LOCATOR`):
  `[ -x "$MIRROR_BIN/mirror" ] && mmbin="$MIRROR_BIN/mirror"`, then
  `exec "$mmnode" "$mmbin" mcp`.

Neither checks that the value is absolute. A runtime spawns its hooks and its MCP server
from the user's project, so a relative value resolves there. With `MIRROR_BIN=bin`, Node
runs the project's `bin/mirror-hook` as JavaScript on every hook, and its `bin/mirror` at
every MCP server start. Probed on 2026-11-04 with the plugin's prompt hook: the project's
file ran.

A value that names nothing usable, such as a prefix that moved after an nvm switch, is
dropped silently, and the search goes on to the PATH and the global bin directories, as
`MIRROR_NODE` was before CR192.

`REFERENCE.md` puts `MIRROR_BIN` in `MIRROR_NODE`'s trust class ("whoever sets it chooses
what runs"), and `docs/process/troubleshooting.md` calls it "honored as given".

## Expected Behavior

- `MIRROR_BIN` follows CR192's rule: it is used when it is an absolute path, by CR192's
  shell pattern, to a directory holding the bin the reader needs as an executable file.
  Otherwise it is refused with the reason, and the search goes on without it.
- The forward-slash drive form stays accepted. `MIRROR_BIN=C:/Users/…/.mirror/bin` is
  what a Windows machine sets for the Claude Code forwarders, and it works on `main`
  today. CR192's pattern already counts it as absolute (`mirrorNodeRule.test.ts` pins
  `C:/Program Files/nodejs/node.exe`). This CR's tests pin it for `MIRROR_BIN` too, so a
  narrower pattern cannot refuse it and log that refusal on every such machine.
- A refusal is recorded where the reader records failures, in CR192's form: the wrappers'
  once-a-day `hooks.log` line, the locator's stderr line.
- `hooks.test.ts` and `mcpEntry.test.ts` pin the rule, and `REFERENCE.md` and
  `docs/reference/configuration.md` state it beside `MIRROR_NODE`'s.

## Impact

Rare, and serious when met. It needs a user who set `MIRROR_BIN` to a relative path, a
plausible slip because the docs describe it as a directory, and a project that holds a
file at that path, which anyone can put in a repository. The consequence is the
project's JavaScript run under the user's account on every hook. The silent drop costs
less: the search usually finds the bin elsewhere, and when it does not, the existing
`mirror-hook not found` line names the fix.

## Plan Or Decision

Captured, unassigned, 2026-11-04, at the Navigator's direction, from the security
engineer's lens in the review of CR192's plan.

CR192 built the shell pattern, the shared generator fragments, and the once-a-day refusal
note, and this CR reuses them. Selected as Current Focus on 2026-11-07, when the CV9
re-baseline decided to ship it as a patch ahead of the 1.0 gate
([decision](../../decisions.md#cv9-is-re-baselined-on-the-typescript-core)). Driver
`@viniciusteles`, Delivery `main`, named by the Navigator. Plan written the same day,
reviewed through five lenses with the amendments folded below, and approved by the
Navigator on 2026-11-07 (see Decisions Taken At Approval).

### The rule

`MIRROR_BIN` is used when it is an absolute path, by CR192's pattern
(`ABSOLUTE_PATH_CASE`), to a directory that holds the bin its reader needs as an
executable file: `mirror-hook` for the hook wrappers, `mirror` for the MCP entry.
Otherwise it is refused, the refusal is recorded with its reason, and the search goes on
without it, to the PATH and the global bin directories, as today. An empty value is
unset, not refused. Every reader checks in this order and gives these reasons:

1. `relative`: the value fails the pattern;
2. `missing`: it names nothing;
3. `not a directory`: it names a file;
4. `a directory without an executable mirror-hook` (the wrappers) or `a directory
   without an executable mirror` (the MCP entry): the bin is absent, not executable, or
   a directory.

The refusal is worded as `MIRROR_NODE`'s is, with line breaks removed from the value:

```text
MIRROR_BIN=<value> is <reason>; searching the PATH and the usual places instead
```

An absolute value is trusted wherever it points, as `MIRROR_NODE`'s is: whoever sets it
chooses what runs.

### Scope

1. **The wrappers.** `ENTRY_BIN` in `scripts/generate_hook_wrappers.sh` applies the
   rule, and a refusal goes through `note … daily`, CR192's once-a-day line in
   `hooks.log`. Nothing goes to stdout, which is agy's protocol channel. `ENTRY_BIN` will
   carry the pattern's backslashes, so it is spliced by the text around its placeholder,
   as `@LOG@` and `@NODE@` are, never as the replacement in `${out//@ENTRY@/…}`. The bin
   and agy forms take `ENTRY_BIN`, so the eight wrappers under `plugins/mirror-mind/hooks/`
   and `plugins/mirror-mind/agy/` are regenerated. The five tree-form wrappers under
   `.claude/hooks/` read no `MIRROR_BIN` and do not change.
2. **The MCP entry.** `MCP_LOCATOR` in `ts/src/guards/claudePlugin.ts` reads
   `$MIRROR_BIN` once, into `mmbindir`, because Grok pastes a set variable's value into
   the text at load time; today it appears three times. It applies the same pattern and
   tests, reusing `mmwhy`, and prints a refusal on stderr with `printf`, prefixed
   `mirror-mind: `. The server then starts through the PATH and the usual places. The
   three generated manifests follow.
3. **Windows.** `mirrorNodeRule.test.ts`, the file the Windows job runs under Git Bash,
   gains a real run of a plugin wrapper with `MIRROR_BIN` in the forward-slash drive form
   Rodrigo Immaginario's machine sets. The prefix is shaped like npm's on Windows: a
   `mirror-hook` shim beginning `#!/bin/sh`, because Git Bash decides the execute bit
   from a file's content and name rather than its mode, and the package's own
   `mirror-hook.js` beside it. The Windows step is renamed to name both variables; its
   command does not change.
4. **Docs.** The rule is stated in full once, in `docs/reference/configuration.md`,
   beside `MIRROR_NODE`'s. `REFERENCE.md`'s `MIRROR_BIN` row says it in a sentence and
   links there. `docs/process/troubleshooting.md` loses "It is still honored as given,
   relative or not (CR197)" and gains the refusal line and its fix. The runtime-interface
   spec's bin-form paragraph states the rule. Getting Started says the directory is given
   as an absolute path.

### Affected files

- `scripts/generate_hook_wrappers.sh` and the eight wrappers it generates under
  `plugins/mirror-mind/hooks/` and `plugins/mirror-mind/agy/`.
- `ts/src/guards/claudePlugin.ts` and the generated `plugins/mirror-mind/plugin.json`,
  `plugins/mirror-mind/.claude-plugin/plugin.json`, and `plugins/mirror-mind/mcp_config.json`.
- `ts/test/hooks/hooks.test.ts`, `ts/test/mcp/mcpEntry.test.ts`,
  `ts/test/hooks/mirrorNodeRule.test.ts`.
- `.github/workflows/tests.yml`: the Windows step's name.
- `REFERENCE.md`, `docs/reference/configuration.md`, `docs/process/troubleshooting.md`,
  `docs/product/specs/runtime-interface/index.md`, `docs/getting-started.md`.

### Acceptance

1. A relative `MIRROR_BIN` (`bin`, `./bin`, `~/bin`, `C:bin`) is never used. With an
   executable `bin/mirror-hook` and `bin/mirror` planted in the project, neither runs: a
   wrapper writes the refusal line and runs the hook through the PATH, and the MCP entry
   writes one stderr line and answers `initialize`.
2. A missing path, a file, and a directory without the reader's bin (absent, not
   executable, or a directory) are each refused with that reason, and the hook or the
   server still runs through the search.
3. A valid absolute `MIRROR_BIN` behaves exactly as today: it outranks the PATH, adds no
   `hooks.log` line, and leaves the locator's stderr empty. This holds for npm's Windows
   prefix shape (PR #53), for the forward-slash drive form under Git Bash, and for
   `/opt/homebrew/bin`, the value in the Navigator's own Claude settings.
4. On the same UTC day a second refusal of the same value writes nothing, and a line
   break in the value cannot forge a second `hooks.log` line.
5. With both `MIRROR_BIN` and `MIRROR_NODE` refused, one hook run writes both lines, the
   bin's first, and the hook still runs.
6. The wrappers' `MIRROR_BIN` check and the locator's carry the same pattern as
   `MIRROR_NODE`'s, and the locator reads `$MIRROR_BIN` once; a test fails if either
   changes alone.
7. `generate_hook_wrappers.sh --check` under bash 3.2 and under the `bash:5.2` image,
   `buildClaudePlugin.ts --check`, `checkDocLinks`, typecheck, lint, the full suite with
   nothing left behind, and CI, the Windows job included, are clean.

### Validation

Automated, written first. Against today's code the first cases fail for the reason this
CR names: the planted `bin/mirror-hook` and `bin/mirror` run.

By the Navigator, before `validated`, on this machine, with nothing touching the real home
and no paid call:

```bash
# 1. A scratch project holding an executable bin/mirror-hook and bin/mirror, each a
#    script whose only effect is a marker file; an empty home and config.
CHECKOUT=~/dev/workspace/mirror-dev
S="$(mktemp -d)"
mkdir -p "$S/project/bin" "$S/home" "$S/config" && chmod 700 "$S/home"
printf 'require("node:fs").writeFileSync("%s/marker-hook", "ran");\n' "$S" > "$S/project/bin/mirror-hook"
printf 'require("node:fs").writeFileSync("%s/marker-mirror", "ran");\n' "$S" > "$S/project/bin/mirror"
chmod +x "$S/project/bin/mirror-hook" "$S/project/bin/mirror"
export MIRROR_HOME="$S/home" MIRROR_USER= XDG_CONFIG_HOME="$S/config" OPENROUTER_API_KEY= \
  MIRROR_NODE="$(command -v node)" MIRROR_BIN=bin
cd "$S/project"

# 2. The plugin's prompt hook, the way Claude Code runs it, twice.
printf '{"session_id":"cr197","prompt":"cr197 route"}' | bash "$CHECKOUT/plugins/mirror-mind/hooks/log-user-prompt.sh"
printf '{"session_id":"cr197","prompt":"cr197 route"}' | bash "$CHECKOUT/plugins/mirror-mind/hooks/log-user-prompt.sh"

# 3. The MCP entry, as the manifest carries it, sent `initialize`.
LOCATOR="$(node -p 'require(process.argv[1]).mcpServers["mirror-mind"].args[1]' "$CHECKOUT/plugins/mirror-mind/.claude-plugin/plugin.json")"
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"route","version":"0"}}}'
printf '%s\n' "$INIT" | /bin/sh -c "$LOCATOR"

# 4. Look.
cat "$S/home/hooks.log"
ls "$S"
mirror conversations --limit 3
mirror runtime diagnose

# 5. Your own value, from your Claude settings.
export MIRROR_BIN=/opt/homebrew/bin
printf '{"session_id":"cr197b","prompt":"cr197 route"}' | bash "$CHECKOUT/plugins/mirror-mind/hooks/log-user-prompt.sh"
printf '%s\n' "$INIT" | /bin/sh -c "$LOCATOR"
cat "$S/home/hooks.log"

# 6. Clean up.
cd ~ && rm -rf "$S"
```

Pass:

- after step 2, `hooks.log` holds exactly one line, ending `claude:user-prompt:
  MIRROR_BIN=bin is relative; searching the PATH and the usual places instead`;
- step 3 prints `mirror-mind: MIRROR_BIN=bin is relative; …` and then the server's answer,
  a JSON line naming `mirror-mind`;
- `ls "$S"` lists `config`, `home`, and `project`, and no marker;
- `mirror conversations` lists a conversation titled `cr197 route`;
- `mirror runtime diagnose` reports `hook_failures_recorded` (1, latest
  `claude:user-prompt`), and `openrouter_key_missing`, which the route causes by emptying
  the key;
- in step 5, `hooks.log` still holds one line, and no `mirror-mind:` line comes before the
  server's answer.

Fail: a marker exists; after step 2 `hooks.log` holds no refusal, or two; or step 5
refuses `/opt/homebrew/bin`.

The Driver ran the route first, as CR192's Driver did (see Implementation, below).

On Windows, Rodrigo Immaginario is asked on PR #47 to run the installer against `main`:
his forward-slash `MIRROR_BIN` gives no refusal line, and the hooks and the MCP server
work. His run does not gate the release tag (Decisions Taken At Approval): the Git Bash
run in the Windows job is the release's Windows evidence, and a refusal his run finds is
fixed as its own change.

### Exclusions

- The tree-form wrappers and the Pi extension: neither reads `MIRROR_BIN`. The
  extension's `MIRROR_BIN` is a constant, the path of its own tree's `bin/mirror.js`.
- `runtime diagnose`: it reads no `MIRROR_BIN`. A wrapper's refusal reaches it as
  `hook_failures_recorded`; a finding that names a refused value is CR198's, for both
  variables.
- A relative entry in the person's `PATH` (`.`, or `node_modules/.bin`): `command -v`
  would find a project's file the same way, but it does so for every command the person
  runs, not Mirror's alone.
- Whitespace around a value, and MSYS's `/c/…` form, as in CR192.
- No new environment variable, no new diagnose finding, and no change to what a valid
  value does.

### Authority boundaries

As CR192's: the wrappers never fail the turn, exit 0, put nothing on stdout but the
entry's output, and write one line per failure in the format `hookFailureFindings`
parses. The locator keeps the constraints its comment lists. The release is a separate
gate: CR197 ships as v0.40.1 when the Navigator calls the train, and the release commit,
the promotion, and the publication are each the Navigator's.

### Review, 2026-11-07

Reviewed through five lenses: security engineer, engineer, quality assurance, DevOps
engineer, and writer. What each changed:

1. **Security engineer.** `$MIRROR_BIN` appears three times in the locator, each a place
   Grok pastes a set value into shell text: read it once (scope 2). A line break is
   removed before a value is logged (acceptance 4). The exclusions name what the rule
   leaves open: an absolute value is trusted wherever it points, and a relative `PATH`
   entry is the person's own.
2. **Engineer.** `ENTRY_BIN` will carry the pattern's backslashes, and the generator
   splices any fragment that does by the text around its placeholder (CR192), so
   `@ENTRY@` moves to that splice and `--check` is re-run under bash 5.2 (scope 1,
   acceptance 7). The locator reuses `mmwhy`, which is already reset before the Node
   check, and adds only `mmbindir`.
3. **Quality assurance.** Red first, for both readers; a run in which both variables
   are refused (acceptance 5); a route that exercises the MCP entry, not only the
   wrapper; and the existing `MIRROR_BIN` cases (the GUI launch, npm's Windows shim)
   staying green unchanged.
4. **DevOps engineer.** The forward-slash drive form proven by a Git Bash run in the
   Windows job, not only by the pattern's table (scope 3); the Navigator's own
   `MIRROR_BIN=/opt/homebrew/bin` as a regression case (acceptance 3, route step 5). It
   recommends that Rodrigo's installer run gate the tag, as CR192's did: a wrong refusal
   would skip every hook on a machine whose PATH lacks npm's prefix, which is the case
   the installer sets `MIRROR_BIN` for.
5. **Writer.** One sentence shape for both variables, so the fourth reason reads after
   "is"; the rule in full once, in `configuration.md`; troubleshooting's "honored as
   given" line removed, since it becomes false; "absolute" in Getting Started.

### Decisions Taken At Approval

1. **Navigator.** The plan is approved as the review amended it.
2. **Navigator.** Rodrigo Immaginario's installer run does not gate the v0.40.1 tag,
   against the DevOps engineer's recommendation. The Git Bash run in the Windows job
   (scope 3) is the release's Windows evidence; his run confirms it when it comes.

### Release note draft

> **Every reader uses `MIRROR_BIN` only when it is an absolute path to a directory
> holding Mirror's bins** (CR197). A relative value such as `bin` could make a plugin
> hook run a file from the project you were in, and a value that no longer held
> `mirror-hook` was dropped without a word. The plugin's hook wrappers and MCP entry now
> refuse such a value, say why, and keep searching the PATH and the usual places.
> `C:/Users/<you>/.mirror/bin`, the forward-slash form set on Windows for the Claude Code
> forwarders, counts as absolute.

## Evidence

- `scripts/generate_hook_wrappers.sh`, `ENTRY_BIN`: the `MIRROR_BIN` line, before the
  PATH and the global bin directories. The agy form takes the same fragment.
- `ts/src/guards/claudePlugin.ts`, `MCP_LOCATOR`: the `mmbin` line.
- Probe, 2026-11-04, in a scratch directory: a project holding an executable
  `bin/mirror-hook` whose JavaScript writes a marker file; `MIRROR_BIN=bin`, an absolute
  `MIRROR_NODE`, and `PATH=/usr/bin:/bin`. `plugins/mirror-mind/hooks/log-user-prompt.sh`,
  run from the project, exited 0 and the marker was written.
- `REFERENCE.md`, the `MIRROR_BIN` row; `docs/process/troubleshooting.md`: "`MIRROR_BIN`
  is the same trust class as `MIRROR_NODE`: an executable path the environment names,
  honored as given."
- [CR192](cr192-the-hook-wrappers-and-the-mcp-locator-accept-a-relative-mirror-node.md),
  Decisions Taken At Approval, decision 3.
- Rodrigo Immaginario's installer run on
  [PR #47](https://github.com/mirror-mind-ai/mirror/pull/47#issuecomment-6644116024),
  2026-11-04, against `main` at `28d9718b`: his Windows machine sets
  `MIRROR_BIN=C:/Users/…/.mirror/bin`, with forward slashes, for the Claude Code
  forwarders. With the prefix in that form and off the PATH, the hook and the MCP server
  ran.

### Planning reads, 2026-11-07

- The readers of the variable are `ENTRY_BIN` (the bin and agy wrapper forms) and
  `MCP_LOCATOR`. `.pi/extensions/mirror-logger.ts` names a constant `MIRROR_BIN`, its own
  tree's `bin/mirror.js`, and reads no environment variable of that name;
  `ts/src/runtime/` reads none.
- `MCP_LOCATOR` (`ts/src/guards/claudePlugin.ts`) holds `$MIRROR_BIN` three times, in one
  line.
- `scripts/generate_hook_wrappers.sh`, `render()`: `@LOG@` and `@NODE@`, which carry
  backslashes, are spliced by the text around their placeholder; `@ENTRY@` is still a
  `${out//@ENTRY@/…}` replacement, safe today because `ENTRY_BIN` holds no backslash.
- This machine's `~/.claude/settings.json` sets `MIRROR_BIN=/opt/homebrew/bin` and
  `MIRROR_NODE=/opt/homebrew/bin/node`; that directory holds `mirror` and `mirror-hook`,
  links into the installed package (the worklog's v0.40.0 entry records the pin).
- The Windows job runs `ts/test/hooks/mirrorNodeRule.test.ts` under Git Bash
  (`.github/workflows/tests.yml`, `windows-install-kind`).

### Implementation, 2026-11-07

- **Code.** `scripts/generate_hook_wrappers.sh`: `ENTRY_BIN` applies the rule and notes a
  refusal once a day, and `@ENTRY@` is spliced by the text around its placeholder, as
  `@LOG@` and `@NODE@` are. The eight bin and agy wrappers are regenerated; the five
  tree-form wrappers came out byte-identical. `ts/src/guards/claudePlugin.ts`:
  `MCP_LOCATOR` reads `$MIRROR_BIN` once, into `mmbindir`, tests it with
  `ABSOLUTE_PATH_CASE`, reuses `mmwhy`, and prints a refusal with `printf`; the three
  manifests are regenerated. `.github/workflows/tests.yml`: the Windows step names both
  variables. Docs: `REFERENCE.md`, `docs/reference/configuration.md` (a new "Hook bin
  resolution" section), `docs/process/troubleshooting.md`,
  `docs/product/specs/runtime-interface/index.md`, `docs/getting-started.md`.
- **Tests, written first.** Against `c32bf8d4` they failed for the reasons this CR
  names: the plugin wrapper ran the project's `bin/mirror-hook`, the MCP entry ran its
  `bin/mirror`, no refusal was written, and the pattern and the single read were absent.
  The cases for valid values passed before and after. New: six cases in `hooks.test.ts`
  (a relative value never run; each reason; a valid value outranking the PATH; the daily
  rule and a forged line break; both variables refused in one run, the bin's line first;
  the agy form), four in `mcpEntry.test.ts` (one read of `$MIRROR_BIN`; a relative value
  never run, the server starting through the PATH; each reason printed intact; a valid
  value outranking the PATH's `mirror`), and two in `mirrorNodeRule.test.ts` (the pattern
  held equal in the bin and agy wrappers and the locator; a real wrapper run with
  `MIRROR_BIN` in the platform's absolute form over npm's Windows prefix shape, which the
  Windows job runs under Git Bash). One structural test changed: "the two forms share
  everything but how the entry is found" removes the bin search through its last `exit 0`
  and `fi`, because the `MIRROR_BIN` check now closes an `if` of its own before them.
- **Checks, this machine (macOS, bash 3.2, Node 26.12.1).** Typecheck clean; Biome with
  the one warning that predates this work (`ts/test/scripts/testTempHomes.test.ts`);
  `bash scripts/test_leaves_nothing.sh`: 3,821 tests, 3,818 passed, 0 failed, 3 skipped
  (machine-dependent), and nothing left behind; the three touched test files: 75 tests,
  73 passed, 2 skipped; `generate_hook_wrappers.sh --check` in sync under bash 3.2 and
  under the `bash:5.2` image; `buildClaudePlugin.ts --check`, `checkDocLinks`,
  `checkTestTempHomes`, `checkRetiredSurfaces`, `checkSkillCommandParity`,
  `checkPackContents`, and `git diff --check` clean.
- **Smokes.** `smoke_mirror_mcp.sh` passed, with no data leaked into production.
  `smoke_claude_plugin.sh` passed every step up to "no hooks.log line after mirror-hook
  went missing", and failed there; it fails at the same step at `c32bf8d4`, before this
  change, in a throwaway worktree: CR172's failure on a machine with a global
  `mirror-hook`.
- **The Driver's dry run of the route**, against the working tree, with a random prompt.
  Both hook runs exited 0, and `hooks.log` held one line, `2026-11-07T17:28:09Z
  claude:user-prompt: MIRROR_BIN=bin is relative; searching the PATH and the usual places
  instead`. The MCP entry printed the same refusal on stderr and answered `initialize`
  as `mirror-mind`. No marker existed, and `mirror conversations` listed the prompt.
  `runtime diagnose` reported `hook_failures_recorded` (1, latest `claude:user-prompt`),
  beside `openrouter_key_missing`. With `MIRROR_BIN=/opt/homebrew/bin` no line was added
  and the entry's stderr was empty. The real homes' `hooks.log` kept their size and
  modification time, and neither real database held the prompt. The route gains
  `chmod 700` on the scratch home, which removes the `loose_permissions` finding CR192's
  route showed.
- **Not verified here.** The Windows case runs only in CI, after a push.
- **Navigator validation, 2026-11-07 19:11 UTC**, on this machine, in bash 3.2, the route
  above run against `b2468024`. After the two hook runs, `hooks.log` held one line,
  `2026-11-07T19:11:56Z claude:user-prompt: MIRROR_BIN=bin is relative; searching the
  PATH and the usual places instead`. The MCP entry printed the same refusal, prefixed
  `mirror-mind: `, then answered `initialize` as `mirror-mind`. `ls` showed `config`,
  `home`, and `project`, and no marker. `mirror conversations` listed `ca458e73`,
  `cr197 route`, 2 messages. `mirror runtime diagnose` reported two findings:
  `openrouter_key_missing`, which the route causes, and `hook_failures_recorded` (1, latest
  `claude:user-prompt`). With `MIRROR_BIN=/opt/homebrew/bin` the hook added no line, and
  the MCP entry answered with nothing on stderr. Every pass condition held, and no fail
  condition. Validated by the Navigator, 2026-11-07.
- **CI on `main`, 2026-11-07.** Pushed as `c32bf8d4` to `67892ec5`. Tests run 42405662185
  passed on every job: `ts (ubuntu-latest)`, `ts (macos-latest)`, `smoke`, and
  `windows-install-kind`; the Docs run passed. In the Windows job the Git Bash step ran
  `mirrorNodeRule.test.ts`: 6 tests, 6 passed, none skipped, among them the plugin
  wrapper run with `MIRROR_BIN` in the forward-slash drive form over npm's Windows prefix
  shape, with no refusal line.

### Debt review, 2026-11-07

1. **`runtime diagnose` calls a refusal a hook failure, and its recommendation names
   neither refused variable.** The Navigator's run shows it: the refused `MIRROR_BIN`
   reached diagnose as `hook_failures_recorded`, whose recommendation reads "a missing or
   too-old Node, or a failing front-door call", though the hook ran through the PATH.
   CR192 left the same gap for `MIRROR_NODE`, and
   [CR198](cr198-runtime-diagnose-does-not-name-a-refused-mirror-node.md) owns it.
   Recommendation: **defer** to CR198, widened to `MIRROR_BIN`. Defer reason: the
   `hooks.log` line the finding points to names the value and the reason, so a person who
   follows it reaches the cause; rewording the recommendation alone would leave the
   finding's name and severity wrong, which is CR198's decision. Revisit trigger: CR198's
   planning, or a report of a refused `MIRROR_BIN` that `runtime diagnose` did not
   explain.
2. **The rule's checks are written once per reader:** two variables in two shell
   readers, and `MIRROR_NODE`'s again in TypeScript, in diagnose and the Pi extension.
   Recommendation: **no action**. The readers run in bash, in POSIX `sh` inside a
   manifest, and in Node, so no copy can be shared. The pattern is one constant held
   equal by a test, and each reader's reasons are pinned by its own tests, as CR192
   accepted.
3. **Two scratch worlds in `hooks.test.ts`.** `binWorld` repeats `nodeWorld`'s `date`
   stand-in and log reader. Recommendation: **no action**. They differ in what is real:
   `nodeWorld` fakes Node to see which entry it was handed, and `binWorld` runs a real
   Node, so that a wrongly chosen entry really runs. One helper would blur the two.

Navigator decision, 2026-11-07: finding 1 deferred to CR198, which is widened to
`MIRROR_BIN`; no action on findings 2 and 3.

## Outcome

Done on 2026-11-07. The plugin's hook wrappers and MCP entry use `MIRROR_BIN` only as an
absolute path to a directory holding the bin they need, refuse anything else with its
reason, and keep searching. Validated by the Navigator on this machine; the Windows form
is held by the Windows CI job. Ships in v0.40.1.
