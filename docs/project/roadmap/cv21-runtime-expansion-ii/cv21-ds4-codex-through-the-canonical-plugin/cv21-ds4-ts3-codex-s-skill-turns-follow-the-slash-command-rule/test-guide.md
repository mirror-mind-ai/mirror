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

Pending implementation and validation.
