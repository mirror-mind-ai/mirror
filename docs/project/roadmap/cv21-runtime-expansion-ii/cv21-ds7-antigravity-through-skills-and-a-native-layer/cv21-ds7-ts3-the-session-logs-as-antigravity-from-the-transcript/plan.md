# Plan — CV21.DS7.TS3

## Objective

Log an Antigravity session. agy's hook payloads carry no prompt or reply
text (DS12.TS3 L7); the `Stop` payload names `conversationId`,
`transcriptPath`, and a termination reason. So the `agy:stop` handler reads
agy's JSONL transcript, extracts the turn's user message and the model's
final answer, and logs them as `antigravity`, the reply beside its prompt —
bar item 4, the last mechanism before US4.

**Probe-first, as US1 and TS2 were.** TS2 saw the transcript's envelope
(`step_index`, `source`, `type`, `status`, `created_at`, `content`; the
injected step was `type: EPHEMERAL_MESSAGE`, `source: SYSTEM_SDK`). What is
NOT yet pinned in bytes: the step type of a user turn (`USER_INPUT`
expected) and of the model's final answer (`AGENT_MESSAGE` expected), how a
multi-step answer composes into one reply, and how the transcript grows
across turns. Implementation leads with a probe on the installed agy
(1.4.2) that captures a real two-turn transcript into the story package's
`evidence/`, and the reader is written from those bytes — the DS12.TS3
lesson about uncommitted evidence, not repeated.

**The shape, resolved (Plan review, database-architect).** The existing
`importClosedConversation` seam dedups on `runtime_sessions.session_id` at
WHOLE-SESSION granularity: it imports a closed session once and returns null
if the id is already tracked. That seam cannot both "leave the conversation
open" across turns AND dedup per turn — the first draft of this plan asked
it to, and it won't. TS3 builds **Shape A: append-per-turn, close by
orphan**, not import-closed:

1. **The close model.** agy has no SessionEnd hook (its contracts are
   SessionStart, PreToolUse, PostToolUse, PreInvocation, PostInvocation,
   Stop); `Stop` fires at the end of each user turn, so there is no
   session-end signal. The `agy:stop` handler OPENS the conversation on the
   first turn (bound to `conversationId`) and APPENDS each turn's user and
   assistant messages on each `Stop`, leaving it open. Session maintenance
   closes it as a stale orphan (`MIRROR_STALE_ORPHAN_MINUTES`), the exact
   path Codex uses (CV21.DS4.US4) — proven; Antigravity's situation is
   Codex's. TS3 **inherits Codex's extraction latency verbatim**: an agy
   conversation's memories extract when the orphan closes (default 30 min
   after the last turn), not instantly — the documented Codex behavior, so
   "logging works" does not promise instant extraction (devops-engineer).
   The probe checks for a cleaner end-of-session signal; absent one, the
   stale-orphan close stands and US4 measures the extraction after it.
2. **Idempotency keyed on the transcript's own ordinal, not wall-clock.**
   `Stop` fires every turn and the transcript holds the WHOLE session each
   time, so the handler logs only steps past a HIGH-WATER MARK: the last
   agy `step_index` already logged for this conversation. `step_index` is
   agy's monotonic per-conversation ordinal (TS2 saw it on the injected
   step); `created_at` is NOT the key — two steps in one millisecond
   collide (the backfill corpus already holds same-timestamp rows). The
   mark is new per-conversation state this story owns (its storage settled
   in implementation: a column on the conversation's metadata, or a small
   keyed table); a re-fired `Stop` or a grown transcript whose max
   `step_index` has not advanced logs nothing. The probe's two-turn capture
   pins that `step_index` is stable across `Stop` fires.
3. **Single writer, with the lock-recheck for the one race.** On agy
   nothing else logs per turn, so `agy:stop` is the sole per-turn writer.
   The one race is the orphan close (or a late `Stop`) opening a
   conversation for an id another path is closing: the handler opens and
   appends under the same lock-and-recheck `importClosedConversation` uses,
   so a closed id is never reopened. Named because US4 runs with a real key
   and the close tail writes too.

## Scope

**The transcript reader — `ts/src/conversation/agyTranscript.ts`:**

- Parse agy's JSONL (reusing `parseJsonl` where it fits), select the
  `USER_INPUT` and `AGENT_MESSAGE` steps (names settled by the probe),
  compose a multi-step answer into one reply, in transcript order, and
  carry each step's `step_index` so the handler can mark its high-water
  line. Pure over an injected path, fixtures from the captured bytes.
- The multi-part-answer composition (join in order, trim, drop empties) is
  ONE helper (engineer): agy's step shape differs from Claude's content
  blocks, so the reader is new, but the "how parts become one string" rule
  is shared with `transcriptBackfill.ts`'s `assistantText`, not reinvented.

**The hook entry — `ts/src/hooks/agy.ts` (+ `main.ts` dispatch):**

- `agyStop(stdin)`: parse the camelCase payload, read `transcriptPath`
  (absent/empty/unreadable → answer the contract, record nothing, never
  fail the turn), append the turns past the high-water mark as `antigravity`
  through the conversation-logger seam. A skill command turn is skipped as
  every runtime skips it (`isCommandTurn`); agy's skill form is
  `/mirror-mind:mm:*` (DS12.TS3 L4), tested against the USER step's actual
  transcript TEXT with a fixture, so the skip is proven on agy's bytes, not
  assumed (engineer).
- The handler answers agy's `Stop` output contract (`{}` or a `decision`),
  per the probe; it never blocks the stop to keep the agent working.

**Wrapper and generation:**

- A third `agy`-form wrapper, `plugins/mirror-mind/agy/stop.sh` →
  `agy:stop` (no gate: `Stop` fires once per turn, not per invocation, so
  the per-spawn cost the pre-invocation gate solved does not apply here).
- Confirm agy's `SessionStart` path triggers the stale-orphan sweep
  (devops-engineer): `agy:session-start` runs `conversation-logger
  session-start` (TS2), and on an agy-only machine that is the ONLY thing
  that will close a prior orphan — if it does not sweep, an orphan sits
  forever. A test pins that a returning agy session closes the prior one.
- `buildAgyHooks()` grows the `Stop` array with an explicit timeout;
  `hooks.test.ts`'s agy form-group count moves with it (three wrappers).

**Guards and docs:**

- The plugin guard covers the grown `hooks.json` and the new wrapper.
- Getting Started's Antigravity row: logging lands; the bar is met pending
  US4's live measurement.

## Non-Goals

- Do not implement US4's measurement or DS8.
- Do not change Claude/Gemini/Codex logging, the stale-orphan mechanism, or
  the deferred close tail — TS3 reuses them, and the suite proves it.
- Do not chase DS12.TS2 L9 (the cross-session write defect, routed).
- Do not add a SessionEnd mechanism agy does not have.

## Acceptance Behavior

```text
Given a Stop payload naming a conversationId and a readable transcriptPath
When agy:stop runs at the end of a user turn
Then the user message and the model's final answer are logged as
  antigravity, the reply beside its prompt
And a re-fired Stop on the same transcript logs nothing new
When the transcript is absent, empty, or unreadable
Then the handler answers the contract, records nothing, never fails the turn
And a $-skill command turn is not logged as conversation
And the conversation closes so memories extract, by the stale-orphan path
And Claude, Gemini, and Codex logging are unchanged, proven by the suite
```

## Validation Route

Automated:

- `node --test` — the transcript reader over the captured fixture (user +
  assistant selection, multi-step answer composition, order), the
  `agy:stop` handler (logs the turn, idempotent re-fire, absent/empty/
  unreadable transcript answers safely, a `$`-skill turn skipped), the
  grown generated files and the three-wrapper agy group, and the full
  suite proving the other runtimes untouched.
- `npx biome check .`

Navigator-visible route (extends the story's `route.sh`; sanitized
evidence):

- Observation 1: a two-turn live session on the installed agy in a scratch
  HOME; the scratch Mirror database holds both turns labelled `antigravity`,
  the replies beside their prompts — pass; fail: a turn missing, mislabelled,
  or a reply unpaired.
- Observation 2: re-run `agy:stop` against the same transcript — pass: no
  new rows (idempotent); fail: duplicates.
- Observation 3: the conversation closes and extracts — either agy signals
  an end, or the stale-orphan path runs with `MIRROR_STALE_ORPHAN_MINUTES=0`
  in the scratch — pass: the conversation is closed with its metadata; fail:
  it stays open with no close path.

E2E decision: observations 1-3 are the E2E — the real agy, the staged
plugin, the real transcript. CI has no agy; the reader and handler are
unit-covered over the captured fixture, the split US1 and TS2 used.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV21.DS7.TS3`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- Sanitize live evidence: a transcript holds the user's and model's words,
  so commit only the step shape and labels needed to prove the behavior,
  never conversation content.

## Stop Conditions

- scope_change_detected — anything reaching into US4, DS8, or a new
  SessionEnd mechanism.
- plan_rule_conflict.
- failing_required_check_without_clear_fix.
- navigator_decision_needed — the probe shows the transcript does not let a
  turn's final answer be identified cleanly (so logging would guess), that
  `step_index` is not stable across `Stop` fires (so the high-water key
  needs rethinking), or agy offers an end-of-session signal that changes the
  close model from the stale-orphan default.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
