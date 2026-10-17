[< CV21.DS4 Codex Through The Canonical Plugin](../index.md)

# CV21.DS4.TS2 — SessionEnd's close tail survives Codex's 1 s bound

**Status:** ✅ Done
**Type:** Technical Story
**Delivery Story:** CV21.DS4 — Codex Through The Canonical Plugin

---

## Technical Story

In order to let a Codex session end cleanly with a provider key set,
as the Driver of the shared plugin hooks,
I want the SessionEnd tail to finish its state writes inside the 1 s Codex gives it
and defer its LLM work to the next session start, as Pi and Gemini CLI already do,
so that a cut never leaves a session active, a backup missing, or an extraction lost
without a trace.

## Outcome

On a runtime that bounds SessionEnd (Codex at 1 s, Grok at 1.5 s), the shared hook
closes without the LLM tail: transcript backfill, `ended_at`, the runtime session
inactive, a `close_tail_pending` flag, then the backup — all inside the bound. On every
runtime the session is marked inactive before any LLM call, so a cut anywhere leaves a
consistent database. The next session start's maintenance extracts the conversation
(as it already does for any ended one) and then finishes the deferred tail — title,
summary, tags — reporting `Finished deferred close tails: N`. No hook timeout changes.

## Acceptance Behavior

```text
Given a session labelled codex with a bound conversation, a provider key set,
      and an extraction that would take seconds
When the plugin's SessionEnd hook runs and is killed after 1 s
Then before the kill: ended_at is set, the runtime session is inactive,
     the transcript is backfilled, close_tail_pending is set, and the backup ran
And no LLM call was made, and hooks.log has no line

Given that database
When any runtime's SessionStart runs session maintenance
Then the conversation is extracted and then finalized, the flag is cleared,
     and the output reads "Finished deferred close tails: 1"

Given a session labelled claude_code
When SessionEnd runs
Then the LLM tail runs at exit as today, with the session already inactive

Given a session whose tail throws during extraction, on any runtime
When SessionEnd runs
Then the runtime session is inactive and ended_at is set
```

## Scope

- `conversation/deferredCloseTail.ts`: which runtimes run the LLM tail at exit, keyed
  by the session's interface label, with the measured bounds.
- `logger.ts`: `handleSessionEndHook` picks the tail by runtime; `endSession` takes a
  tail option and marks the session inactive before the tail; the backfill precedes
  it; the flag through one metadata helper.
- `sessionComposites.ts` and `loggerRuntime.ts`: the "Finished deferred close tails"
  maintenance step, 5 per run, after extraction. `runtime/diagnose.ts`: the count.
- `hooks/claude.ts`: `session-end` receives `--interface`, as `stop` does.
- Tests first; the runtime-interface spec, a decision, the story `route.sh`.

## Out Of Scope

- The real Codex with a real key (US4) and Grok (DS10).
- Pi's and Gemini CLI's own exit paths; any hook `timeout`.
- Extraction's persist phase as one transaction (a Change Request candidate).
- TS3, TS5, TS6.

## Validation

Automated: the suite and the conversation lifecycle smoke. Navigator:
`bash route.sh static` — the real wrappers and entry against a scratch home with
replay providers: a `codex` session end timed under 1 s with the state written and no
LLM call, then a session start that finishes the deferred tail, then a `claude_code`
session end with the tail at exit. Details in [plan.md](plan.md) and
[test-guide.md](test-guide.md).
