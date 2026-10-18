[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR143 — The inject hook loads Mirror context on Grok, which discards it

## Problem

The plugin's `UserPromptSubmit` hook `mirror-inject.sh` (`claude:inject`,
`ts/src/hooks/claude.ts`) runs on every runtime that takes the Claude-format plugin.
On an explicit `/mm-mirror …` turn it runs `mirror load --context-only --query …`
and prints the context as `additionalContext`; on the first ordinary turn after
Mirror Mode becomes active it loads the session's persona and journey context once
and marks it injected. On Claude Code and Codex that context reaches the model.

Grok Build ignores a `UserPromptSubmit` hook's `additionalContext` (DS12.TS4 L3,
re-confirmed on 1.0.62 by CV21.DS10.US3 with a canary the probe proved it emitted
and the model never saw). The hook still runs, and Grok waits for it: the session's
own log shows the turn held in `waiting_hooks` for **2,610 ms** on the `/mm-mirror`
turn and **2,293 ms** on the next ordinary turn (the once-per-session injection),
then 322–457 ms on turns where the hook only reads state (US3 test guide, TUI
session). The skill turn then runs `mirror mirror load` a second time, as the skill
itself asks — that one is the load whose output the model sees.

So on Grok the inject hook's loads are pure cost: a `mirror load` the user waits
two to three seconds for, twice per session, whose output nobody reads.

## Expected Behavior

- On a runtime that discards `UserPromptSubmit` context — today `grok_build`, the
  label the hooks already stamp (CV21.DS2.US8; `ts/src/hooks/runtimeDetection.ts`)
  — the inject hook does not load context: it exits 0 at once, and the per-turn
  cost is the hook process alone.
- The decision lives beside its siblings in `ts/src/conversation/runtimePolicy.ts`
  (`sessionEndRunsLlmTail`, `sessionOutlivesTui`): one predicate, "this runtime
  reads injected prompt context", keyed by the session's interface label, with a
  test on the three Claude-family labels.
- Mirror Mode on Grok is unchanged: the skill's own `mirror mirror load` is what
  answers the `/mm-mirror` turn, and the log-user-prompt and Stop hooks are not
  touched.
- The runtime interface contract's "Mirror Mode injection models" names Grok as a
  runtime where the hook is registered and inert.

## Impact

Low for correctness — nothing is wrong, only wasted. Real for the Grok user: the
`/mm-mirror` turn is already the slow one (DS12.TS4 L5 saw 5 m 30 s; US3 saw 34 s),
and the hook adds a load before the skill's own; and for honesty: a hook that
"injects" on a runtime that cannot read it is the kind of thing the L3 record should
not have to explain twice.

## Plan Or Decision

Captured, unassigned, 2026-10-18, at CV21.DS10.US3's Debt Review. Current Focus
unchanged. A likely route: `runtimePolicy.ts` gains the predicate; `claudeInject`
reads the label from the payload the way `session-end` already does and returns
before any load when the runtime discards context; `runtimePolicy.test.ts` and
`claude.test.ts` cover it; the contract's injection-models table gets Grok's row.
CV21.DS10.TS4, which writes Grok's reference implementation, is the natural place
to decide whether to pay it there or leave it captured.

## Evidence

```text
# CV21.DS10.US3, TUI session, 2026-10-18 19:16–19:22 UTC, grok 1.0.62 (1474f9cbdd91),
# ~/.grok/logs/unified.jsonl (scratch home), turn.phase_transition from waiting_hooks:
19:17:38.336  waiting_hooks → waiting_model  phase_elapsed_ms 2610   (/mm-mirror turn: inject case 1)
19:19:48.391  waiting_hooks → waiting_model  phase_elapsed_ms 2293   (first ordinary turn: inject case 2)
19:20:03.328  waiting_hooks → waiting_model  phase_elapsed_ms  457
19:20:39.970  waiting_hooks → waiting_model  phase_elapsed_ms  409
# The canary the probe emitted as additionalContext on every turn: never quoted (NONE ×4).
```

## Outcome

Open.
