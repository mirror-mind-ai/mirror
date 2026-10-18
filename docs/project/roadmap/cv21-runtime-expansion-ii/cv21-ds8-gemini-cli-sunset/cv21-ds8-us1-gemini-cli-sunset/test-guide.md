[< Story](index.md)

# Test Guide — CV21.DS8.US1

## Automated Validation

- `npm test` — the full suite. The cases that change: `ts/test/frontDoor/initCli.test.ts`
  gains "with `gemini` on the PATH, `init` prints no Gemini CLI section";
  `ts/test/runtime/wiring.test.ts` loses the Gemini CLI case and `gemini: 2` from the
  honest counts; `ts/test/hooks/hooks.test.ts` loses the four `.gemini/hooks` wrappers and
  the three Gemini payload tests; `ts/test/scripts/packContents.test.ts` follows the guard;
  `ts/test/scripts/retiredSurfaces.test.ts` gains seed tests for the `gemini-cli` row and
  drops `.gemini/hooks/` from the "no longer catches the runtime hooks" list.
- `bash scripts/smoke_npm_package.sh <scratch>` — packs this tree, installs from nothing,
  exercises the bins, with no Gemini section.
- `bash scripts/smoke_claude_plugin.sh` and `bash scripts/smoke_mirror_mcp.sh` — the
  runtime smokes that remain in CI's loop.
- The retired-surface guard (`node --test ts/test/scripts/retiredSurfaces.test.ts`, and the
  sweep it runs against the live tree) — `.gemini/`, `ts/src/hooks/gemini.ts`, and
  `scripts/smoke_gemini_cli.sh` absent; no live file names `smoke_gemini_cli`,
  `geminiHooksSettings`, or `hooks/gemini.ts`. The doc-facing names (`.gemini/hooks`, the
  `gemini:*` routes, `gemini skills link`) join the row in US2, once the docs are clean.
  Stage deletions with `git rm` before running it: the sweep walks `git ls-files`.

## E2E Decision

`scripts/smoke_npm_package.sh` is the E2E: it installs the packed tarball from nothing and
proves the shipped artifact carries no Gemini CLI path. No live Gemini CLI session is run —
the story retires the integration, and a runtime being removed is not measured.

## Navigator Validation

1. `npm pack --dry-run` from the repository root.
   Expected: the file list carries no path under `.gemini/`.
   Pass: none listed. Fail: any `.gemini/` path ships.
2. In a scratch directory, create an executable `gemini` stub, put it first on the PATH,
   and run `mirror init <scratch-name>` with `MIRROR_HOME` pointed at a scratch home.
   Expected: the "Wire your runtime" section prints Pi, Claude Code, Codex, and Antigravity
   blocks for whichever of those are on the PATH, and no `Gemini CLI:` block.
   Pass: no `Gemini CLI:` block. Fail: one prints.
3. `mirror-hook gemini:session-start` (or `node ts/src/hooks/main.ts gemini:session-start`)
   with `MIRROR_HOME` pointed at a scratch home.
   Expected: a hook never breaks its runtime, so an unknown name exits 0 and is noted.
   Pass: exit 0, empty stdout, one `hooks: unknown hook name: gemini:session-start` line in
   the scratch home's hooks log. Fail: the Operating Instructions print (the Gemini session
   start ran), or exit is non-zero.
4. `git grep -In "\.gemini/hooks\|gemini:session\|gemini:log\|smoke_gemini_cli\|geminiHooksSettings" -- ':!docs/project' ':!docs/process/worklog.md' ':!docs/releases'`
   Expected: no matches in live code, guards, CI, or the development guide.
   Pass: no output. Fail: a live surface still names the retired wiring. Doc mentions of
   "Gemini CLI" as a runtime (README, Getting Started, REFERENCE, the specs, the skills) are
   US2's and are expected to remain here.
5. In a home that holds a conversation logged as `gemini_cli`, run `mirror conversations`.
   Expected: the conversation lists as before, labelled `gemini_cli`.
   Pass: listed. Fail: missing or an error.

## Validation Evidence

Driver run, 2026-10-18, on this checkout (macOS, node from Homebrew):

- `npm test`: 3309 tests, 3306 pass, 0 fail, 3 skipped (the three are pre-existing
  skips, unrelated). Red first: the new `init`-with-`gemini` case failed on the
  printed `Gemini CLI:` block, and the `gemini-cli` row's "clean against this
  repository" test failed on seven tracked paths plus residue in CI, the dev guide,
  `payload.ts`, `wiring.ts`, `hooks.test.ts`, and one line the plan's inventory had
  missed: `docs/product/specs/runtime-interface/index.md` naming the smoke under
  "References". That line describes a live automated surface, the same class as the
  dev guide's loop, so it was edited here; US2's doc mentions were left alone.
- `bash scripts/smoke_npm_package.sh <scratch>`: 70 passed, 0 failed; sections 9–11
  are MCP, hooks.log, interpreter shadow; no Gemini section.
- `bash scripts/smoke_mirror_mcp.sh`: pass.
- `bash scripts/smoke_claude_plugin.sh`: fails at its step 6 ("no hooks.log line after
  mirror-hook went missing") on this machine, before and after the change: the
  plugin wrapper's GUI-launch fallback finds the global `/opt/homebrew/bin/mirror-hook`,
  so the "gone" case cannot be simulated here. Pre-existing and environmental; CI's
  Ubuntu has no such path. Not this story's.
- Typecheck: one pre-existing error in `ts/src/hooks/agy.ts` (`transcriptPath` missing
  in a test-side `AgyPayload`), identical on the clean tree. Not this story's.
- Biome: clean.
- Retired-surface redaction test: the Gemini-path walk ("a failed Gemini turn is
  recorded without the prompt or the response") was ported to `claude:user-prompt` /
  `claude:stop` through a refusing home, not dropped: the invariant outlives the
  runtime.

Navigator route, observed by the Driver (acceptance is the Navigator's):

1. `npm pack --dry-run`: 487 files, no `.gemini/` path.
2. Scratch home, `gemini` stub first on the PATH, `mirror init obsuser`: no "Wire
   your runtime" section at all (no other runtime on that PATH), no `Gemini CLI:`.
3. `MIRROR_HOME=<scratch> node ts/src/hooks/main.ts gemini:session-start`: exit 0,
   empty stdout, `hooks.log` holds one line:
   `hooks: unknown hook name: gemini:session-start`.
4. `git grep` sweep outside history: matches only in the four US2-owned docs
   (troubleshooting, architecture, runtime-interface spec, configuration) and the
   guard's own table/test. No live code, CI, or dev-guide match.
5. The development home holds 18 `gemini_cli` conversations; `mirror recall 10a36de7`
   loads one (2026-05-12) as before.
