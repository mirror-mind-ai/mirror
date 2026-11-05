[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR192 — The hook wrappers and the MCP locator accept a relative `MIRROR_NODE`, and say nothing about one they will not use

## Problem

`MIRROR_NODE` names the Node binary a runtime integration runs when the runtime's PATH
holds none. Three readers resolve it, and they disagree about what a usable value is:

- The hook wrappers (`scripts/generate_hook_wrappers.sh`, both forms) take
  `"${MIRROR_NODE:-}"` and keep it when `[ -x "$NODE" ]`. A relative path passes that
  test against the cwd the runtime spawned the hook in, which is the user's project.
  A value that fails it is dropped silently; the wrapper goes on to `command -v node`
  and the candidates, and the user who set `MIRROR_NODE` to pin a Node learns nothing.
- The plugin's MCP locator (`ts/src/guards/claudePlugin.ts`, `mmnode`) does the same:
  `[ -n "$mmnode" ] && [ -x "$mmnode" ] || mmnode="$(command -v node)"`.
- The Pi extension, since CR191, requires an absolute path to an executable file, and
  warns once in `mirror-logger.log`, with the reason (missing, a directory, not
  executable, relative), before searching on without it.

`REFERENCE.md` documents the variable as one trust class for all three, "whoever sets
it chooses what runs", and `runtime diagnose`'s repair route is `export
MIRROR_NODE=/path/to/node`: an absolute path is what every instruction shows, and only
one reader insists on it.

The wrappers and locator run under POSIX `sh`, including Git Bash on Windows. Their
absolute-path test therefore cannot be POSIX-only. The Windows installer writes
`MIRROR_NODE` as a rooted drive-letter path such as
`C:\Program Files\nodejs\node.exe`; Git Bash accepts that path with `[ -x ]`, while a
naive `case "$NODE" in /*)` guard would refuse it and make every installed hook log a
false configuration error.

## Expected Behavior

- One rule for every reader of `MIRROR_NODE`: an absolute path to an executable file,
  else refused. In the shell readers, absolute includes a POSIX-rooted path (`/*`) and a
  Windows rooted drive-letter path (`[A-Za-z]:[\\/]*`); a drive-relative path such as
  `C:node.exe` remains relative and is refused.
- A refused value is recorded where that reader records failures, with the reason: the
  wrappers' and the locator's line in `<mirror home>/hooks.log` (the wrappers' `note`),
  the extension's WARN in `mirror-logger.log`, as CR191 left it.
- `hooks.test.ts` and `mcpEntry.test.ts` pin the rule as `mirrorLoggerExtension.test.ts`
  pins the extension's.
- `REFERENCE.md`'s `MIRROR_NODE` row and `docs/reference/configuration.md` state the rule
  once, for all readers.

## Impact

Low for the current defect. The relative case needs a user who set `MIRROR_NODE` to a
bare name or a `./` path and a project directory that holds a file by that name; the
silent drop needs a `MIRROR_NODE` that moved. Both are misconfigurations that today
produce either the wrong Node or no explanation. What it costs is consistency: three
readers, two rules, and docs that describe one.

The implementation risk is higher than the defect's frequency: a POSIX-only absolute
check would reject the valid drive-letter form the Windows installer writes and regress
every hook on that installation path. The Windows form is therefore an acceptance
constraint, not an optional compatibility note.

## Plan Or Decision

Captured, unassigned, 2026-11-02, at the Navigator's direction, from CR191's debt review,
which left the family's rule as a separate decision. Selected as Current Focus
2026-11-04. Plan written the same day, reviewed through five lenses, and approved by the
Navigator with the amendments folded (see Decisions Taken At Approval). Driver
`@viniciusteles`, Delivery `main`. PR #53 merged before planning, as Rodrigo recommended,
so the plan works from its blocks and tests.

### The rule

`MIRROR_NODE` is used when it is an absolute path to an executable file. Otherwise it is
refused, the refusal is recorded with its reason, and the search goes on without it, as
today. Every reader checks in the extension's order (CR191) and gives its reasons:
`relative`, then `a directory`, `missing`, `not executable`. An empty value is unset, not
refused. Every reader words a refusal as the extension already does, byte for byte:

```text
MIRROR_NODE=<value> is <reason>; searching the PATH and the usual places instead
```

For the shell readers, "absolute" is one `case` pattern:

```sh
/*|\\*|[A-Za-z]:[\\/]*
```

It classifies exactly as Node's `path.win32.isAbsolute`. POSIX-rooted paths, Windows
drive-rooted paths with either slash (`C:\Program Files\nodejs\node.exe`, the installer's
form), and UNC or root-relative backslash paths are absolute. `node`, `./node`,
`../bin/node`, `~/node`, and drive-relative `C:node.exe` are not. Probed 2026-11-04 on
15 values in bash 3.2, dash, ksh, `/bin/sh`, and zsh as `sh`: identical to
`win32.isAbsolute` in all five.

The shell readers take this Windows rule on every platform. They could branch on the
platform at no cost (bash sets `$OSTYPE`, `msys` under Git Bash; only dash leaves it
empty), but one pattern is one rule with one test, and it is the form Rodrigo specified.
On POSIX a drive or backslash value names no file and is refused as `missing`. The Node
readers keep their platform's `path.isAbsolute`, so on Windows every reader draws the
same line.

### Scope

1. **One generator, written once.** `scripts/generate_hook_wrappers.sh` gains two shared
   fragments that both templates take, as they already take `@LOCATE@` and `@ENTRY@`:
   the logging helpers (`env_value`, `note`), today written twice byte for byte with
   nothing holding the copies equal; and the Node search, today also written twice. The
   13 wrappers are regenerated.
2. **The wrappers apply the rule.** `MIRROR_NODE` must pass the pattern and
   `[ -f ] && [ -x ]`: a directory passes `-x` alone, and a wrapper handed one logs
   `node exited 126` today (probed). A refused value is noted in `hooks.log` with the
   refusal message, line breaks removed from the value first, and the search continues.
   Nothing goes to stdout, which is Claude Code's and agy's protocol channel.
3. **Once a day.** `note` gains a daily mode: it writes nothing when `hooks.log` already
   holds the same message stamped today (UTC). The log stays bounded, and the refusal
   stays inside `runtime diagnose`'s seven-day window for as long as the value stays
   wrong. Claude Code runs `mirror-inject.sh` and `log-user-prompt.sh` in parallel on
   each prompt, so the first refusal of a day can be written twice; that is expected.
4. **MCP locator.** `MCP_LOCATOR` in `ts/src/guards/claudePlugin.ts` applies the same
   pattern, file test, and reasons inline, under its constraints: POSIX `sh`, no `${…}`,
   no positional parameter, `mm`-prefixed variables (one new, `mmwhy`). `$MIRROR_NODE`
   appears once in the text, copied into `mmnode`: Grok pastes the value of a set
   variable into MCP args at load time, so each occurrence is a place a value lands in
   shell text. A refusal is one stderr line, the refusal message prefixed `mirror-mind: `
   like the locator's other lines, with line breaks removed from the value. It is written
   with `printf`, not `echo`: dash's `echo` turns the `\n` of `\nodejs` in the installer's
   value into a newline (probed). The server then starts through the PATH and the usual
   places, as today. The plugin manifests and `mcp_config.json` are regenerated.
5. **`runtime diagnose`, the fourth reader.** `hookNodeFindings` counts `MIRROR_NODE` as
   resolvable only under the rule, with its platform's `isAbsolute`. The probe it is
   handed becomes a named, exported `isExecutableFile()` in `diagnose.ts`, which
   `runtimeRoute.ts` uses in place of its inline lambda: an existing executable that is
   not a directory. No new finding: the wrappers' refusal line reaches diagnose as
   `hook_failures_recorded`.
6. **Windows CI.** A `shell: bash` step in the existing `windows-install-kind` job, run
   by Git Bash. It runs the classification table under Git Bash. It then copies one tree
   wrapper into a scratch tree with a stub entry, copies `node.exe` under
   `$RUNNER_TEMP/Program Files/nodejs`, sets `MIRROR_NODE` to that copy's `cygpath -w`
   form, and asserts the stub ran and `hooks.log` holds no refusal. With
   `MIRROR_NODE=C:node.exe` it asserts exactly one `relative` line. About 25 lines; it
   makes Rodrigo's warning something CI checks on every push.
7. **Docs.** The rule is stated in full once, in `docs/reference/configuration.md`, with
   where each reader records a refusal. `REFERENCE.md`'s `MIRROR_NODE` row says it in
   one sentence and points there. `docs/process/troubleshooting.md` adds the refusal
   line under Symptom, and the fix. It says that after a fix no new line is written but
   `runtime diagnose` keeps counting the old ones for seven days, so the latest stamp is
   what to read. It names where each client shows an MCP server's stderr, verified per
   runtime. It corrects "`MIRROR_NODE` … honored as given". The runtime-interface spec's
   Node-resolution section moves "absolute path only" from the extension to the family.
   The extension's comment "though the wrappers accept one" goes.

### Affected files

- `scripts/generate_hook_wrappers.sh` and its 13 generated wrappers (`.claude/hooks/`,
  `plugins/mirror-mind/hooks/`, `plugins/mirror-mind/agy/`).
- `ts/src/guards/claudePlugin.ts` and the generated `plugins/mirror-mind/plugin.json`,
  `plugins/mirror-mind/.claude-plugin/plugin.json`, and
  `plugins/mirror-mind/mcp_config.json`.
- `ts/src/runtime/diagnose.ts`, `ts/src/frontDoor/runtimeRoute.ts`.
- `.pi/extensions/mirror-logger.ts`: one comment, no behavior.
- `ts/test/hooks/hooks.test.ts`, `ts/test/mcp/mcpEntry.test.ts`.
- `.github/workflows/tests.yml`: the Windows step.
- `REFERENCE.md`, `docs/reference/configuration.md`, `docs/process/troubleshooting.md`,
  `docs/product/specs/runtime-interface/index.md`.

### Acceptance

1. A relative `MIRROR_NODE` (`node`, `./node`, `bin/node`, `C:node.exe`) is never run.
   With an executable `bin/node` planted in the project, `MIRROR_NODE=bin/node` leaves it
   unrun: a wrapper writes the refusal line and runs the hook through the PATH or the
   usual places; the MCP entry writes one stderr line and answers `initialize`; diagnose
   does not count the value.
2. The installer's form is used. Under Git Bash in CI, a `node.exe` under a path with a
   space, named in its Windows form, runs the hook with no refusal line. On POSIX hosts,
   `C:\Program Files\nodejs\node.exe` classifies as absolute and is refused as `missing`,
   never `relative`.
3. A directory, a missing path, and a non-executable file are each refused with that
   reason, and the hook runs through the search.
4. A valid absolute `MIRROR_NODE` behaves exactly as today: it outranks the PATH, adds no
   `hooks.log` line, and leaves the locator's stderr empty.
5. Run one after another on the same UTC day, a second refusal of the same value writes
   nothing.
6. Every refusal is the one message, in the extension's words; a value with a line break
   is logged as one line.
7. The wrappers' pattern and the locator's are the same text, and the logging helpers and
   the Node search are the same in all three wrapper forms; a test fails if either side
   changes alone.
8. `generate_hook_wrappers.sh --check`, `buildClaudePlugin.ts --check`, `checkDocLinks`,
   typecheck, lint, the full suite, and the Windows job are clean.

### Validation

Automated:

- The classification table run through the pattern in `bash`, and in `/bin/dash` where it
  exists (a Mac's `/bin/sh` is bash), asserted equal to `path.win32.isAbsolute` value by
  value; and under Git Bash in the Windows job.
- Wrappers run as written, one tree, one bin, and one agy wrapper: each refusal reason;
  the planted `bin/node` never runs; a valid path; a value with a line break; and the
  daily rule, with a fake `date` first on the wrapper's PATH, so the day is fixed and the
  test cannot fail at midnight UTC.
- The logging helpers and the Node search asserted identical across the three forms.
- The MCP entry run as written: a refused relative value, then `initialize` answered; a
  valid value, with stderr empty; the installer's value printed intact.
- `isExecutableFile()` against a real temporary file, directory, non-executable file, and
  missing path; `hookNodeFindings` on both platforms for relative and refused values.

By the Navigator, before `validated`, on this machine, with nothing touching the real
home and no paid call:

1. In a scratch directory, a project holding an executable `bin/node` whose only effect
   is to create a marker file, an empty home, and an empty config directory. Export
   `MIRROR_HOME=<scratch home>`, `MIRROR_USER=` (empty, not unset),
   `XDG_CONFIG_HOME=<scratch config>`, `OPENROUTER_API_KEY=` (empty), and
   `MIRROR_NODE=bin/node`. An empty `MIRROR_USER` outranks the one a checkout's `.env`
   or the config file names, which the core would otherwise report as conflicting
   with the scratch home (found in the Driver's dry run, below).
2. From the project, run the plugin's prompt hook the way Claude Code runs it, twice:
   `printf '{"session_id":"cr192","prompt":"hi"}' | bash <checkout>/plugins/mirror-mind/hooks/log-user-prompt.sh`.
3. Pass: `hooks.log` holds exactly one refusal line; the marker does not exist; the
   prompt is in the scratch home (`mirror conversations`); `mirror runtime diagnose`
   reports `hook_failures_recorded`. Fail: the marker exists, a second refusal line was
   written, or none was.
4. Once more with `MIRROR_NODE=$(command -v node)`: no new line.
5. Remove the scratch directory.

On Windows, there is no machine on this side. Rodrigo Immaginario is asked on PR #47 to
run the real installer against `main`: the installer's `MIRROR_NODE` gives no refusal
line and the hooks and the MCP server work; `C:node.exe` is refused as `relative`. This
run is a gate: the release that carries CR192 is not tagged before it.

### Exclusions

- `MIRROR_BIN`, which has the same exposure and a worse one: captured as
  [CR197](cr197-the-hook-wrappers-and-the-mcp-locator-accept-a-relative-mirror-bin.md).
- The Pi extension's behavior: it already follows the rule.
- A new diagnose finding for a refused value.
- MSYS conversion of `/c/...` values, and `hooks.log` rotation.
- Whitespace: the extension trims the value and the shell readers do not, so
  ` /opt/node` is accepted by Pi and refused as `relative` by the hooks. Nothing writes
  such a value; accepted at approval.

### Authority boundaries

The wrappers keep their contract: never fail the turn, exit 0, put nothing on stdout but
the entry's output, and write one line per failure to `hooks.log` in the format
`hookFailureFindings` parses. The locator keeps the constraints its comment lists. The
extension stays a thin dispatcher and changes in one comment only. No new environment
variable and no new diagnose finding.

### Decisions Taken At Approval

Reviewed on 2026-11-04 through five lenses (engineer, quality assurance, security
engineer, DevOps engineer, writer) and approved by the Navigator the same day with the
amendments folded. Driver `@viniciusteles`, Delivery `main`.

1. **Navigator.** A refused value is noted once per UTC day (scope 3), not on every
   invocation.
2. **Navigator.** `runtime diagnose` stays in scope (scope 5).
3. **Navigator.** `MIRROR_BIN` is captured as its own CR, CR197, not folded in here.
4. **Engineer.** The first draft said a shell cannot tell its platform without spawning a
   process; bash sets `$OSTYPE`. The single pattern stays, for one rule and one test.
5. **Engineer.** The logging helpers and the Node search become shared generator
   fragments (scope 1); the reason order is the extension's; `isExecutableFile()` is
   named and tested (scope 5).
6. **Quality assurance.** A fake `date` fixes the day in the daily-rule test; a planted
   `bin/node` proves the value is never run; dash is run explicitly; the forms are pinned
   equal; the Navigator route has commands, pass and fail, and no paid call; acceptance 5
   is sequential, because the two prompt hooks run in parallel.
7. **Security engineer.** Line breaks are removed from a value before it is logged: a
   probe forged a `claude:stop` line that diagnose counted. `$MIRROR_NODE` appears once
   in the locator, because Grok pastes set values into its text.
8. **DevOps engineer.** The Windows CI step (scope 6); Rodrigo's installer run is a gate
   before the release is tagged, not a check after it; the docs name the seven-day tail
   after a fix and where each client shows an MCP server's stderr.
9. **Writer.** One refusal message, in the extension's words, everywhere; the rule in
   full once, in `configuration.md`; the release note below.

### Release note draft

Rodrigo's installer run (Evidence) corrected two claims below, and the release note
carries the corrections. `runtime diagnose` does not say why it refuses a value: it only
stops counting it as a Node the hooks can use, and the hooks' refusal line reaches it as
`hook_failures_recorded`. And the installer's `MIRROR_NODE` is not under
`C:\Program Files\nodejs\`: the run shows it under
`AppData\Local\Programs\MirrorMind\node\`, in the same drive-letter form.

> **Every reader uses `MIRROR_NODE` only when it is an absolute path to an executable
> file** (CR192; the Windows constraint came from @rodrigoimmaginario). A relative value
> such as `bin/node` could make a hook run a file from the project you were in, and a
> value that no longer pointed at Node was dropped without a word. The hook wrappers, the
> plugin's MCP entry, and `runtime diagnose` now refuse such a value, say why, and keep
> searching the PATH and the usual places. `C:\Program Files\nodejs\node.exe`, the form
> the Windows installer writes, counts as absolute.

## Evidence

- `scripts/generate_hook_wrappers.sh`, the two `NODE="${MIRROR_NODE:-}"` blocks, and
  `ts/src/guards/claudePlugin.ts` line 119–120, the locator's `mmnode`, after PR #53's
  shell-shim changes.
- `.pi/extensions/mirror-logger.ts`, `resolveNode()`, and the CR191 block of
  `ts/test/pi/mirrorLoggerExtension.test.ts`, which pin the extension's rule.
- `REFERENCE.md`, the `MIRROR_NODE` row, as CR191 left it: the extension's stricter rule
  is stated as the extension's alone.
- CR191's debt review, 2026-11-02.
- Rodrigo Immaginario's Windows constraint on
  [PR #47](https://github.com/mirror-mind-ai/mirror/pull/47#issuecomment-6604140651),
  2026-11-03: Git Bash accepts the installer's `C:\Program Files\nodejs\node.exe`, a
  `/*`-only test would refuse it, and PR #53 should merge before CR192 touches the same
  generator, locator, and tests. PR #53 has since merged.
- Planning probes, 2026-11-04, this machine:
  - The pattern against `path.win32.isAbsolute` on 15 values, in bash 3.2, dash, ksh,
    `/bin/sh`, and zsh as `sh`: identical in all five.
  - Dash's `echo` printed the installer's value with newlines in place of each `\n`;
    `printf '%s'` printed it intact.
  - `[ -x ]` accepts a directory and `[ -f ]` refuses it; running a directory as
    `"$NODE"` exits 126.
  - With an executable `bin/node` in the project, `MIRROR_NODE=bin/node` ran the
    project's file. A bare `node` passed `[ -x ]` on a project file and then ran the
    PATH's `node`.
  - `$OSTYPE` is `darwin26` in bash and in macOS's `/bin/sh`, and empty in dash.
- Review probes, 2026-11-04: a value with an embedded line break wrote a second
  `hooks.log` line, as `claude:stop`, that `hookFailureFindings`' parser counted. With
  `MIRROR_BIN=bin`, the plugin's prompt hook made Node run the project's
  `bin/mirror-hook` as JavaScript (CR197).
- `.claude/settings.json` and `plugins/mirror-mind/hooks/hooks.json` register
  `mirror-inject.sh` and `log-user-prompt.sh` on the same `UserPromptSubmit` event.

### Implementation, 2026-11-04

- **Code.** `scripts/generate_hook_wrappers.sh` gains the shared `@LOG@` and `@NODE@`
  fragments, spliced by the text around the placeholder; the 13 wrappers are
  regenerated. `ts/src/guards/claudePlugin.ts` exports `ABSOLUTE_PATH_CASE` and applies
  the rule in `MCP_LOCATOR`; the three generated manifests follow.
  `ts/src/runtime/diagnose.ts` exports `isExecutableFile()` and applies the rule in
  `hookNodeFindings`, which `ts/src/frontDoor/runtimeRoute.ts` now calls with it. The
  extension's comment is corrected; `.github/workflows/tests.yml` gains the Windows
  step. Docs: `REFERENCE.md`, `docs/reference/configuration.md`,
  `docs/process/troubleshooting.md`, `docs/product/specs/runtime-interface/index.md`.
- **Tests, written first.** They failed for the reasons the CR names: today's locator
  ran a directory (exit 126) and the project's `bin/node`. New:
  `ts/test/hooks/mirrorNodeRule.test.ts` (the pattern pinned across the three wrapper
  forms and the locator; the classification table in bash and dash; a real wrapper run
  with a Node under `Program Files/nodejs`, and with `C:node.exe`); nine cases in
  `hooks.test.ts` (each reason, the planted `bin/node`, a valid value, the daily rule
  across two fixed days, a forged line break, the bin and agy forms, the shared
  fragments, and diagnose's rule and `isExecutableFile()`); three in
  `mcpEntry.test.ts` (one read of `MIRROR_NODE`, a real server start past a relative
  value, each reason printed intact).
- **Deviation from scope 6.** The Windows step runs `mirrorNodeRule.test.ts` under Git
  Bash rather than an inline script, so the same assertions run on every host and on
  Windows. The test copies `node.exe` under the temp directory's
  `Program Files/nodejs`, not under `$RUNNER_TEMP`, and passes the wrapper to bash by a
  relative path; `mirrorNodeRule.test.ts` joins the affected files.
- **Checks, this machine (macOS, bash 3.2, Node 26.12.1).** Typecheck clean; biome
  with the one warning that predates this work; `bash scripts/test_leaves_nothing.sh`:
  3,784 tests, 3,781 passed, 0 failed, 3 skipped (machine-dependent), and nothing left
  behind; the four touched test files under `MEMORY_ENV=test`: 96 tests, 0 failed;
  `generate_hook_wrappers.sh --check` in sync, and in sync under bash 5.2.37 too
  (`docker run bash:5.2`, `patsub_replacement` on), against bytes generated under
  bash 3.2; `buildClaudePlugin.ts --check`, `checkDocLinks`, `checkTestTempHomes`,
  `checkRetiredSurfaces`, `checkSkillCommandParity`, and `checkPackContents` clean.
- **Smokes.** `smoke_mirror_mcp.sh` passed, with no data leaked into production.
  `smoke_claude_plugin.sh` passed its first steps with the new wrappers and entry
  (validation by `claude` and `grok`, the hooks writing to the configured home, the
  MCP entry starting the server), then failed at "no hooks.log line after mirror-hook
  went missing". The same step fails identically at `e6bb4a1d`, before CR192, in a
  throwaway worktree: CR172's failure on a machine with a global `mirror-hook`.
- **The Driver's dry run of the Navigator's route.** The first run, with
  `MIRROR_USER` unset, met the wrapper's conditions, but the core refused the scratch
  home: `MIRROR_HOME (...) conflicts with MIRROR_USER (vinicius-dev)`. `mirror-hook`
  on this machine links into this checkout, whose `.env` names `MIRROR_USER`, so
  `conversations` and `diagnose` refused too. With `MIRROR_USER=` exported empty, every
  pass condition held: two hook runs exited 0; `hooks.log` held one refusal line; the
  marker was absent; the prompt was in the scratch home; `runtime diagnose` reported
  `hook_failures_recorded` naming `claude:user-prompt`; a valid `MIRROR_NODE` added no
  line. The real homes' `hooks.log` and `memory.db` were unchanged throughout (size and
  mtime). The route above is corrected.
- **Not verified.** Where each client keeps an MCP server's stderr: no client debug log
  exists on this machine, and running a client would touch the real home. The docs say
  only what each CLI's own help shows: Claude Code 2.1.312 and Grok 1.0.70 write a debug
  log with `--debug` or `--debug-file`. Codex 0.164.0 shows no such flag, and Antigravity
  was not checked. The hooks read the same environment, so `hooks.log` shows a refused
  value too.
- **Navigator validation, 2026-11-04 21:40 UTC**, on this machine, the route above run
  against the working tree. After two hook runs `hooks.log` held one line,
  `2026-11-04T21:40:16Z claude:user-prompt: MIRROR_NODE=bin/node is relative; searching
  the PATH and the usual places instead`. The marker did not exist. `mirror
  conversations` listed the scratch conversation (`abaa7aaf`, 2 messages, `hi`).
  `mirror runtime diagnose` reported `hook_failures_recorded` (1, latest
  `claude:user-prompt`), beside two findings from the scratch setup:
  `loose_permissions` (the route's `mkdir` made the home 755) and
  `openrouter_key_missing` (the route empties the key). The final count was 1.
- Validation accepted by the Navigator, 2026-11-04.
- **CI on `main`, 2026-11-04.** Pushed as `746456b2` (code, tests, CI), `6ee393f2`
  (docs), and `39a98f52` (validation). Tests run 41921988933 passed on every job:
  `ts (ubuntu-latest)`, `ts (macos-latest)`, `smoke`, and `windows-install-kind`; the
  Docs run passed. In the Windows job the new Git Bash step ran
  `mirrorNodeRule.test.ts`: 4 tests, 4 passed, none skipped. The pattern classified as
  `win32.isAbsolute` under Git Bash's bash. A `node.exe` under `Program Files\nodejs`,
  named in its Windows form, ran the hook with no refusal line. `C:node.exe` was
  refused as `relative`, and the hook ran through the PATH.
- **Rodrigo's installer run, the release gate, 2026-11-04**
  ([PR #47](https://github.com/mirror-mind-ai/mirror/pull/47#issuecomment-6644116024)).
  On Windows, against `main` at `28d9718b`, packed and installed the way the installer
  does, in a throwaway prefix and home: the installer's contract passed 21/21. With
  `MIRROR_NODE` in the installer's form,
  `…\AppData\Local\Programs\MirrorMind\node\node.exe` under a user folder with a space
  and accents, first with no `node` on the PATH and then with the PATH as installed, the
  prompt hook exited 0 and the prompt reached `messages`, the plugin's MCP server answered
  `initialize`, and `hooks.log` stayed empty. With `MIRROR_NODE=C:node.exe`, `hooks.log`
  held exactly one line, `MIRROR_NODE=C:node.exe is relative; searching the PATH and the
  usual places instead`, and the hook and the MCP server still ran. With that value,
  `runtime diagnose` found Node on the PATH and reported nothing about the refused value:
  no finding of its own was planned (scope 5, Exclusions), and he suggests one. His
  `MIRROR_BIN=C:/Users/…/.mirror/bin`, with forward slashes, went to CR197. The gate is
  clear.

### Debt review

- The pattern is written twice, in TypeScript (`ABSOLUTE_PATH_CASE`) and in the
  generator's `@NODE@` fragment, because the generator is bash.
  `mirrorNodeRule.test.ts` holds them equal, as `mcpEntry.test.ts` holds
  `GLOBAL_BIN_DIRS` to the wrappers' list. Accepted.
- The rule has three implementations: the shell pattern, `isExecutableFile()` with
  `path.isAbsolute`, and the Pi extension's `resolveNode()`, which imports nothing from
  the core (CR191). Two small differences remain, both accepted. The extension trims
  whitespace (decided at approval). The TypeScript readers accept a special file that is
  not a directory and has the execute bit, where the shells' `[ -f ]` refuses it. No
  real `MIRROR_NODE` is a FIFO or a device.
- The daily mode of `note` searches `hooks.log` on each refusal, and nothing rotates
  `hooks.log` (excluded at planning). The search runs only when a value is refused.
- The agy wrappers now carry the full "Find Node" comment, which their template
  lacked: the cost of one fragment. Accepted.
- The plugin smoke still cannot reach its missing-hook step on a machine with a global
  `mirror-hook` (CR172, captured). CI's runners have none, and it passed there.
- The validation route needed `MIRROR_USER=` exported empty, because the core rightly
  refuses a `MIRROR_HOME` that conflicts with the user a checkout's `.env` names. Any
  scratch-home route on a configured machine needs the same; this route says so. No
  change.
- Where Codex and Antigravity keep an MCP server's stderr is not verified; the docs
  claim only what each CLI's own help shows. Not captured unless the Navigator asks.
- No other findings.

## Outcome

Done, 2026-11-04. Every reader of `MIRROR_NODE` uses it only as an absolute path to an
executable file, refuses anything else with its reason, and keeps searching. The hook
wrappers note a refusal in `hooks.log` once a day, the MCP entry on stderr, and
`runtime diagnose` does not count a refused value. One shell pattern, the
`path.win32.isAbsolute` rule, makes the Windows installer's drive-letter `MIRROR_NODE`
absolute under Git Bash; CI proves it on Windows, and so did Rodrigo's installer run.
On `main` at `39a98f52` (code `746456b2`, docs `6ee393f2`), for the next release.
Rodrigo's run on PR #47 passed on 2026-11-04, so the gate is clear; the release note
takes the draft above with the two corrections the run made.
