[< Story](index.md)

# Test Guide — CV21.DS4.TS3

## Automated Validation

From the repository root:

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkDocLinks.ts
```

Expected: all green. The tests this story adds — `ts/test/conversation/commandTurn.test.ts`
(the grammar: both sigils, the non-skill `[< Story](index.md)

# Test Guide — CV21.DS4.TS3

## Automated Validation

From the repository root:

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkDocLinks.ts
```

Expected: all green. The tests this story adds — `ts/test/conversation/commandTurn.test.ts`
 prompts, the boundaries at whitespace,
newline, and end, the comma, uppercase, trailing colon, leading space, underscore;
and every `mirrorForm` form a command turn) and the cases in
`ts/test/conversation/logger-hooks.test.ts` (a `codex` `[< Story](index.md)

# Test Guide — CV21.DS4.TS3

## Automated Validation

From the repository root:

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkDocLinks.ts
```

Expected: all green. The tests this story adds — `ts/test/conversation/commandTurn.test.ts`
-skill turn and its reply
skipped as `command_turn`; both `[< Story](index.md)

# Test Guide — CV21.DS4.TS3

## Automated Validation

From the repository root:

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkDocLinks.ts
```

Expected: all green. The tests this story adds — `ts/test/conversation/commandTurn.test.ts`
 Mirror forms logging their question; a
`claude_code` `$5 …` prompt logged; the no-turn-id Stop side unchanged) — fail on the
tree before the change and pass after it. The two existing `/`-command tests
(`logger-hooks`, `replyLogging`) keep their behavior under the new reason
`command_turn`.

Must not change: the Mirror form's exception (`mirrorForm.test.ts`), the inject hook,
Gemini CLI's behavior (its hook now calls the shared predicate; no `[< Story](index.md)

# Test Guide — CV21.DS4.TS3

## Automated Validation

From the repository root:

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkDocLinks.ts
```

Expected: all green. The tests this story adds — `ts/test/conversation/commandTurn.test.ts`
 sigil there),
the Pi extension.

## E2E Decision

Required. The route below is it: the real wrappers and the real entry against a real
database; the prompt and Stop hooks make no model call. The real Codex is US4's.

## Navigator Validation

```bash
bash route.sh static
```

Runs from this package, writes only under `/tmp/cv21-ds4-ts3` (or `DS4_TS3_DIR`),
pins the entry to this tree and prints it, and drives the plugin's wrappers as Codex
and Claude Code would.

**Step 1 — a `codex` `$`-skill turn and its reply log nothing.**
`$mirror-mind:mm:journeys` through `log-user-prompt.sh`, then a reply through
`log-assistant-reply.sh` with the same turn id.
- Expected: zero messages for the session; `hooks.log` gained no line.
- Fail: any message, or a `hooks.log` line.

**Step 2 — the Mirror form keeps its exception in the `$` sigil.**
`$mm-mirror what matters today` through the prompt wrapper.
- Expected: one user message, `what matters today`.
- Fail: no message, or the form left in the content.

**Step 3 — a `$` that is not a skill name is conversation on Claude Code.**
A `claude_code` session, `$5 a month seems fine`.
- Expected: one user message, the prompt as typed.
- Fail: the prompt skipped.

## Validation Evidence

**Driver, 2026-10-17.** Tree `2eff6f2c` plus this story's working set.

- Automated: `npm test` 3252 pass, 0 fail (3255 tests); typecheck, lint,
  `checkDocLinks`, `checkPackContents` (484 files), `checkRetiredSurfaces` clean. Red
  first: `commandTurn.test.ts` (5, the module missing), the four TS3 cases in
  `replyLogging.test.ts`, and the two `slash_command` assertions under their new reason.
- `route.sh static` 8/0, with `/opt/homebrew/bin` first on the PATH to reproduce the
  Navigator's environment and the entry pinned to this tree: the `codex`
  `$mirror-mind:mm:journeys` turn and its reply logged nothing and wrote no
  `hooks.log` line; `$mm-mirror what matters today` and `$mirror-mind:mm:mirror and
  tomorrow?` logged their questions; on `claude_code`, `$5 a month seems fine` logged
  as typed and a following `$mm-journeys` did not.
- One implementation defect caught before any commit: a replacement string holding
  `` `$` `` was read by `String.replace` as "the text before the match" and
  duplicated `logger.ts`; restored from the TS2 commit and redone.

**Navigator, 2026-10-17 15:28 UTC.** `bash route.sh static` on tree `2eff6f2c` plus this
story's working set, the entry `mirror-dev/bin/mirror-hook.js` (the published
`/opt/homebrew/bin/mirror-hook` on the PATH, not used): **8 passed, 0 failed**. The
`codex` `$`-skill turn and its reply logged nothing with no `hooks.log` line; both `$`
Mirror forms logged their questions; `$5 a month seems fine` logged as typed on
`claude_code`, and `$mm-journeys` after it did not.
