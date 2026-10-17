[< Story](index.md)

# Test Guide — CV21.DS4.TS2

## Automated Validation

From the repository root:

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkDocLinks.ts
node --no-warnings ts/smoke/conversation_lifecycle_smoke.ts
```

Expected: all green. The tests this story adds — in
`ts/test/conversation/logger-hooks.test.ts` (the tail by runtime, the payload
fallback), `ts/test/conversation/logger-lifecycle.test.ts` (the session inactive before
the tail, and after a throwing tail), the session-maintenance tests (the deferred
step, its cap, and its extracted-or-ineligible condition),
`ts/test/conversation/deferredCloseTail.test.ts` (every runtime named; unknown runs
the tail), and the `runtime diagnose` count — fail on the tree before the change and pass
after it.

**What proves what.** The *order* (the session inactive before any LLM call) is proven
by the lifecycle unit tests, not by the route: under replay providers nothing is slow,
so the 1 s kill never fires. The route proves the product claim: the bounded path is
fast, makes no model call, writes every state, and the deferred tail finishes at the
next start.

Must not change: the Pi and Gemini CLI exit paths (`session-end-pi`, held by its test
in `loggerCli.test.ts`), the hook registrations and their timeouts
(`hookRegistrations.test.ts`), the wrappers.

## E2E Decision

Required. The route below is it: the real wrappers and the real `mirror-hook` entry
against a real database, with replay providers in place of the model. The real Codex
binary with a real key is US4's session.

## Navigator Validation

```bash
bash route.sh static
```

Runs from this package, writes only under a scratch directory (`/tmp/cv21-ds4-ts2`
unless `DS4_TS2_DIR` says otherwise), and touches no real home. It builds a scratch
mirror home, sets a provider key and the replay providers, and drives the plugin's
wrappers as a runtime would.

**Step 1 — a `codex` session ends inside 1 s, state written, no model call.**

- Expected observation: `log-session-end.sh` exits on its own in under 1 s; the
  conversation row has `ended_at`; the runtime session has `active = 0`; the
  conversation metadata carries `close_tail_pending`; the LLM ledger has no call for
  the conversation; `hooks.log` gained no line; a dated backup exists in the home (it
  exists *because* no model call precedes it: a regression that reintroduces one at
  exit shows here first).
- Pass: all seven. Fail: the hook had to be killed, any LLM call, `active = 1`, no flag,
  or no backup.

**Step 2 — the next session start finishes the deferred tail.**

- Expected observation: `session-start.sh` prints `Finished deferred close tails: 1`;
  the conversation has memories and a generated title; the flag is gone.
- Pass: all three. Fail: `0` in the line, no memories, or the flag still set.

**Step 3 — a `claude_code` session still runs the tail at exit, inactive first.**

- Expected observation: the ledger shows the tail's calls for the conversation, and the
  runtime session's `closed_at` is at or before the first call's timestamp (same
  millisecond clock, so `<=`).
- Pass: both. Fail: no calls, or `closed_at` after the first call.

## Validation Evidence

**Driver, 2026-10-17.** Package 0.33.4 from this tree, `mirror-hook` through
`npm link`.

- Automated: `npm test` 3243 pass, 0 fail (3246 tests; one environmental skip);
  typecheck, lint, `checkDocLinks`, `checkPackContents` (483 files),
  `checkRetiredSurfaces` clean; `conversation_lifecycle_smoke` and
  `smoke_npm_package` (80/0) green. The new tests were red first: the module
  (`deferredCloseTail.test.ts`, 9), the lifecycle order and the deferred close
  (`logger-lifecycle.test.ts`, 3), the tail by runtime and both fallbacks
  (`logger-hooks.test.ts`, 4), the maintenance step wired and unwired
  (`sessionComposites.test.ts`, 2), the diagnose finding and its silence (2). The
  session-composite golden and the CLI report test gained the fifth line at 0.
- `route.sh static` 19/0: the `codex` session's `log-session-end.sh` finished on its
  own in **281 ms** (287 ms on the first run) with `ended_at`, `active = 0`,
  `closed_at`, the flag, no ledger call, no `hooks.log` line, and a dated backup;
  `session-maintenance` then reported `Extracted pending conversations: 1` and
  `Finished deferred close tails: 1`, the conversation with a memory, the replay
  title, and the flag deleted; the `claude_code` session ran its tail at exit (7
  ledger calls) with `closed_at 13:14:04.321 <= first call 13:14:04.322`.
- Unchanged, held by their tests: `session-end-pi` (Pi, Gemini CLI), the hook
  registrations and timeouts, the wrappers.

**Navigator.** Pending: `bash route.sh static`.
