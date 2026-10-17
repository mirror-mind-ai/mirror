# Plan — CV21.DS4.TS2

## Objective

Make a Codex session's end complete and consistent inside the 1 s Codex gives a
SessionEnd hook, with a provider key set, and leave nothing for the cut to take.
Today the plugin's `session-end` writes `ended_at`, then runs the LLM tail
(extraction, then title/summary/tags), and only then marks the runtime session
inactive and takes the backup. Codex runs the hook synchronously (DS12.TS2 L2) and
bounds a handler with no `timeout` at 1 s (DS2's live `/hooks` table); Grok bounds it
at 1.5 s. With a key set, the kill lands inside the LLM tail: extraction is lost until
the next start (recovered by `extractPending`), the `finally` that finalizes metadata
never runs, the runtime session stays `active = 1`, the backup does not run, and
nothing records that any of it happened. A session left `active = 1` is the state
`guessRuntimeSessionId` reads as "the session", the one DS12.TS2 L9 measured.

The design follows what Pi and Gemini CLI already do: they close without extraction
at exit (`session-end-pi`, `extract: false`) and let the next session start extract.
The shared Claude-family hook learns the same, for the runtimes that bound it, and the
close is ordered so a cut anywhere leaves a consistent database.

## Scope

**1. The runtimes that bound SessionEnd close without the LLM tail.**

- A policy in the conversation layer (decision 1), `ts/src/conversation/deferredCloseTail.ts`:
  `sessionEndRunsLlmTail(interface)` — `claude_code: true` (the hook is registered
  `async` and runs in the background after exit), `codex: false` (1 s, synchronous,
  DS12.TS2 L2 and DS2's live table), `grok_build: false` (1.5 s, DS12.TS4); any other
  label, and no label, `true` (today's behavior). The measured bounds and their
  sources sit in the comment; DS10 re-measures Grok's and may flip it.
  `conversation/` keeps importing nothing from `hooks/`; `runtimeDetection.ts` is
  untouched.
- `handleSessionEndHook` (`ts/src/conversation/logger.ts`) resolves the runtime from
  the session row's `interface`, which US8 stamps on every prompt, falling back to an
  `--interface` the hook passes (as `claudeStop` already does for `stop`), then to
  `claude_code`. For a runtime whose policy is `false`, the tail is: transcript
  backfill → `ended_at` → runtime session `active = 0`, `closed_at` →
  `close_tail_pending: true` in the conversation's metadata → return. No LLM call. For
  a runtime whose policy is `true`, the tail is today's, in the order of (2).
- One close path, not two: `endSession` takes `{ extract, finalize }` (decision 1), so
  the deferred close is the same function with both off plus the flag, and
  `session-end-pi` (Pi, Gemini CLI: `extract: false, finalize: true`) is unchanged.
- The flag is written and cleared through one helper beside the existing metadata
  writers, read-modify-write on the JSON blob, written immediately before `ended_at`
  so the window against a still-running async Stop logger is microseconds; cleared by
  deleting the key, never by writing `false` (decision 2).
- `claudeSessionEnd` (`ts/src/hooks/claude.ts`) detects the runtime from the payload
  and passes `--interface`, as `claudeStop` does; then `backup --silent` as today. On
  Codex both now fit inside 1 s (DS2 measured the close at +0.39 s and the backup at
  +0.48 s with no key set, which is now the path with a key too).

**2. The close is ordered so a cut is harmless, on every runtime.**

- `endSession` marks the runtime session inactive *before* `endConversation` runs the
  LLM tail, not after. A cut during extraction on Gemini CLI (30 s) or a Claude Code
  background hook that dies leaves no session `active = 1`.
- `handleSessionEndHook` backfills the transcript *before* the tail, not after, so
  extraction sees the fallback replies it was meant to see. (US8 logs replies from
  Stop, so the backfill rarely adds anything; the order is still the right one.)

**3. The next session start finishes what the exit deferred.**

- `sessionMaintenance` (`ts/src/conversation/sessionComposites.ts`) gains a fifth timed
  step after "Extracted pending conversations": **"Finished deferred close tails"**. For
  each conversation with `close_tail_pending`, FIFO by `ended_at`, it runs
  `finalizeMetadata` (the same close-time title/summary/tags the exit would have run)
  and clears the flag. Extraction itself needs no new code: `extractPending` already
  selects ended, unextracted conversations, and the step runs after it so a stored
  summary is kept, not generated twice. Bounded (decision 3): at most
  `DEFERRED_CLOSE_TAIL_LIMIT = 5` per run, carried over like extraction's budget, and
  only conversations already extracted or ineligible for extraction (fewer than four
  messages, or no journey); one still waiting on the extraction budget is left for the
  next run, flag intact, so finalize never precedes its extraction.
- `MaintenanceDeps` gains `finalizeCloseTail(db, conversationId)`, wired in
  `loggerRuntime.ts` from the existing `createCloseHooks`. The maintenance line reads
  `Finished deferred close tails: N (x.xs)` like its siblings.
- Inherited, not new (A3): two runtimes started at once both run maintenance with no
  lock, and can both pick the same flagged conversation. `extractPending` and
  `retitlePending` carry the same race today; this story names it and does not solve it.

**3b. The deferral is observable** (decision 4). `runtime diagnose` counts
conversations with `close_tail_pending` and names the oldest `ended_at`, beside its
quarantined and parse-failed counts, so a deferred tail nobody started a session to
finish is visible before "memories stopped appearing" is.

**4. Timeouts are not changed.** The plugin's SessionEnd keeps no `timeout`: there is no
LLM work left at exit on the runtimes that bound it, and Claude Code's async run is
unbounded as before. The alternative — a `timeout` of 30 s or more, which Codex
honors only by holding the user's exit for the whole tail — was withdrawn: Pi and
Gemini CLI already chose not to hold the exit for extraction, and an exit that waits
on a model call is the wrong default. `hookRegistrations.test.ts` records why in a
comment.

**5. Tests, first.**

- `ts/test/conversation/logger-hooks.test.ts`: a `codex`-labelled session ends with no
  `runExtraction` and no `finalizeMetadata` call, `ended_at` set, the session
  inactive, the flag set; a `claude_code`-labelled session runs both; the payload
  fallback when the session row carries no label.
- `ts/test/conversation/logger-lifecycle.test.ts`: `endSession` has the session
  inactive by the time `runExtraction` is called (a hook that asserts it); a tail that
  throws still leaves the session inactive.
- `ts/test/conversation/sessionComposites.test.ts` (or its sibling): the deferred step
  finalizes flagged conversations after extraction, clears the flag, skips one still
  unextracted and eligible, and counts.
- `ts/test/conversation/deferredCloseTail.test.ts`: the policy names every
  `HookRuntime`, and an unknown or missing label runs the tail.
- The `runtime diagnose` test: the count and the oldest date.

**6. Docs.**

- `docs/product/specs/runtime-interface/index.md` "Session End": the two tails, which
  runtimes get which, the maintenance step that finishes the deferred one, and the
  product behavior stated plainly (A4): a Codex conversation's memories, title,
  summary, and tags arrive at the next session start, of any runtime, as Pi's do.
- `docs/project/decisions.md`: "A runtime that bounds SessionEnd closes without the LLM
  tail, and the next start finishes it".
- `REFERENCE.md` if it lists the maintenance lines; the DS4 index row for TS2.

**7. The story package.** `route.sh` with one `static` step: an end-to-end run of the
real wrappers against a scratch home with replay providers and a key set (the
providers the suite uses, `MIRROR_TS_CONVERSATION_*_REPLAY`), no Codex binary and no
model. Evidence in `test-guide.md`.

## Non-Goals

- Measuring the change on the real Codex with a real key: US4's live session, which
  follows this story for that purpose. DS10's for Grok.
- Pi's and Gemini CLI's exit paths: they already defer extraction; whether they should
  also defer metadata finalization (Gemini's 30 s) is a separate question, noted.
- A `timeout` on any plugin hook (decided above, not changed).
- Making extraction's persist phase one transaction. It stages every network call
  before writing, so a cut during the network phase leaves nothing; a cut inside the
  millisecond persist window could leave memories without the `extracted` flag and a
  retry that duplicates them. Real, narrow, and not this story's: a Change Request if
  the Navigator wants it priced.
- The `$`-skill rule (TS3), the wrapper (TS5), the plugin cache (TS6).

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
Then the conversation is extracted (extractPending) and then finalized
     (title/summary/tags), close_tail_pending is cleared,
     and the maintenance output reads "Finished deferred close tails: 1"

Given a session labelled claude_code
When SessionEnd runs
Then the LLM tail runs at exit as today, and the runtime session is already
     inactive when extraction starts

Given a session whose tail throws during extraction, on any runtime
When SessionEnd runs
Then the runtime session is inactive and ended_at is set
```

## Validation Route

**Automated (Driver).** `npm run typecheck`, `npm run lint`, `npm test`,
`node ts/scripts/checkDocLinks.ts`, `node --no-warnings ts/smoke/conversation_lifecycle_smoke.ts`.
The new tests fail on the tree before the change.

**Navigator — `bash route.sh static`** from this package. A scratch home, the replay
providers, a key set, the real `mirror-hook` through the plugin's wrappers:

1. A `codex` session: `log-user-prompt.sh` with a Codex-shaped payload (`turn_id`), a
   reply through `log-assistant-reply.sh`, four messages so the conversation is
   eligible for extraction; then `log-session-end.sh` with the run timed and killed at
   1 s. Expected: it exits on its own under 1 s; the conversation has `ended_at`; the
   runtime session has `active = 0`; metadata carries `close_tail_pending`; the ledger
   has no LLM call for it; `hooks.log` has no new line; a dated backup exists.
   Fail: the hook killed, any LLM call, the session still active, or no backup.
2. Then `session-start.sh`. Expected: its output carries
   `Finished deferred close tails: 1`, the conversation has memories and a title, the
   flag is gone. Fail: the line reads 0, or the flag survives.
3. A `claude_code` session through the same wrappers. Expected: the tail runs at exit
   (the ledger has its calls), and `active = 0` is written before the first call (the
   route reads the ledger's first timestamp against the session's `closed_at`).
   Fail: the order inverted, or no tail.

**What the route proves, and what it does not** (decision 5). Under replay providers
nothing is slow, so the 1 s kill never fires: the route proves the product claim —
the bounded path is fast, makes no model call, and writes every state — and the
deferred tail finishes at the next start. The *order* — the session inactive before
any LLM call — is proven by the lifecycle unit tests (a hook that asserts the session
is already inactive when `runExtraction` is called), not by the route. Step 3's
timestamp check is `closed_at <= first call`, since both come from the same
millisecond clock. `session-end-pi` is the unchanged surface, held by its existing
test in `loggerCli.test.ts`.

**E2E decision:** required, and the route is it: real wrappers, real entry, real
database, replay providers. The real Codex binary with a real key is US4's session,
where the Navigator also reads `/hooks` for SessionEnd's budget.

## Implementation Contract

- Tests first, as in Scope 5; then the change makes them pass.
- Keep changes scoped to `CV21.DS4.TS2`: `deferredCloseTail.ts` (new), `logger.ts`,
  `loggerCli.ts`, `sessionComposites.ts`, `loggerRuntime.ts`, `hooks/claude.ts`,
  `runtime/diagnose.ts`, their tests, the docs named, and this package. No wrapper,
  registration, or hook timeout is touched.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- A Codex SessionEnd payload that carries no `session_id` would close nothing; DS2's
  live session showed it does (the close at +0.39 s). If US4 finds otherwise, that is
  a new finding, not this story's.
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix,
  navigator_decision_needed.

## Decisions Taken At Approval

Recorded on 2026-10-17, after the plan review by the engineer, database-architect,
ai-engineer, devops-engineer, quality-assurance, and security-engineer lenses.

1. **Layering.** The policy lives in `conversation/`, keyed by the session's interface
   label with the hook's `--interface` as fallback; `endSession` takes a tail option
   rather than growing a second close path. `runtimeDetection.ts` is untouched.
2. **Flag hygiene.** Written and cleared through one helper beside the existing
   metadata writers; cleared by deleting the key.
3. **The deferred step is bounded:** 5 per run, FIFO by `ended_at`, carried over;
   finalize only conversations already extracted or ineligible for extraction.
4. **Observability.** `runtime diagnose` counts `close_tail_pending` conversations and
   names the oldest.
5. **Test-guide precision.** The order is proven by the unit tests; the route proves
   fast-and-no-call and the finish at the next start; `<=` on the timestamp check;
   `session-end-pi` named as unchanged.

Recorded, not changed: the concurrent-start spend race is inherited from
`extractPending` and `retitlePending`; the Codex memory latency is product behavior,
stated in the spec. Marking the session inactive before any slow work closes the
stale-`active` window DS12.TS2 L9 measured, for every runtime.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
