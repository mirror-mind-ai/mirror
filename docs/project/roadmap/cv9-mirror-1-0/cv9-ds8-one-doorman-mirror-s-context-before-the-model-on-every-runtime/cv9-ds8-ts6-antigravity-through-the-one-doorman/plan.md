# Plan — CV9.DS8.TS6

## Objective

Make Antigravity's `PreInvocation` hook the fifth caller of the one doorman — after
the Claude-family inject hook (US4) and the Pi extension (US5) — so that on agy, too,
the runtime puts Mirror's context before the model by DS8's policy instead of by a
policy of its own. Today `agyPreInvocation` runs `mirror load --context-only` on
every turn of every session, routed from nothing: on agy 1.4.2 the payload carried no
prompt (DS12.TS3 L7), so the explicit form is never seen, no persona is re-routed when
the topic moves, no memory is searched for the question, and the block carries no
delivered line for the skill to trust, so an explicit `/mirror-mind:mm:mirror` turn
loads twice.

The plan as first approved read the prompt from the transcript the Stop handler
already reads, after a probe of whether the turn's `USER_INPUT` is written when
`PreInvocation` fires at `invocationNum: 0`. **The probe answered more than it was
asked** ([evidence/probe-20261025.md](evidence/probe-20261025.md), agy 1.4.7): the
transcript does hold the turn's prompt at invocation 0, and the payload itself now
carries it, as `lastUserInput`, verbatim, a skill turn in its slash form. So the hook
hands the doorman the payload's own field and reads no transcript at all. The
amendment below was approved by the Navigator on 2026-10-25, with decision (b) for a
payload without the field.

The bar is **no regression, measured live on the installed agy**: Mirror's context
still reaches the model once per turn, the session still logs as `antigravity`, the
skills still answer, nothing new appears in `hooks.log`, and what a turn costs is read
as a number (`llm_calls` rows per turn), not assumed.

## Amendment — the probe's result (2026-10-25)

What the probe measured on agy 1.4.7, and what it changed:

| finding | change |
|---|---|
| every hook payload carries `lastUserInput`, the turn's text verbatim (absent on 1.4.2) | the hook reads the prompt from the payload; Scope 2's transcript reader is dropped |
| invocation 0 fires once per user turn (seven turns) | no high-water check at `PreInvocation`: a field read at invocation 0 of a user turn is that turn's |
| no transcript read on any path | the `readMirrorState` pre-check is dropped from the doorman path: the hook decides nothing, as Claude's hook and Pi's extension decide nothing, and the explicit form delivers even in a session no `SessionStart` activated (policy rule 1) |
| `SessionStart` fires for a new conversation, not a resumed one; a `systemMessage` persists across turns and processes; an `ephemeralMessage` is stored on disk and dropped from context | the step is a `systemMessage`, as decided; the restart row reads "resume", and expects no second folder |
| — (Navigator decision (b)) | a payload without `lastUserInput` keeps today's injection, byte for byte |

## Scope

1. **The probe — done.** [evidence/probe-20261025.md](evidence/probe-20261025.md):
   branch **reachable, through the payload**. The handlers are reproduced there, so
   it re-runs when agy updates.

2. **The transcript reader — dropped** by the amendment: the payload carries the
   prompt, so `agyTranscript.ts` keeps its one job, the Stop handler's logging.

3. **`agyPreInvocation` calls the doorman** (`ts/src/hooks/agy.ts`).
   - The gates stay: `invocationNum !== 0` or no `conversationId` answer `{}` without
     touching the database.
   - `parseAgyPayload` reads `lastUserInput` (a non-empty string, else absent:
     protojson omits an empty string, so the two cannot be told apart).
   - With the field: `runFrontDoor(["mirror", "doorman", "--session-id",
     conversationId, "--prompt", prompt])`, in-process, as `claudeInject` does — no
     exec, no argv limit, no truncation. `--session-id` comes first because the shared
     route reads a flag's first occurrence, so a prompt that is exactly
     `--session-id` cannot be taken for it. A non-empty answer goes back as ONE
     `systemMessage` step; empty stdout answers `{}`; a non-zero exit or a throw
     answers `{}` and leaves one `hooks.log` line naming the fact, never the prompt.
   - **Data boundary:** the hook reads no transcript. The prompt goes to the doorman
     only, which sends it to the embedding provider on a delta turn and to `mirror
     load --query` on a full turn (reception when enabled, the attachment embedding)
     — what it does for Claude Code, Codex, and Pi. A turn outside Mirror Mode
     decides `nothing` on a read-only handle and sends nothing anywhere.
   - **Without the field** (agy before 1.4.7; 1.4.2 had none): today's injection,
     unchanged — the `readMirrorState` check, `mirror load --context-only` with the
     session's persona and journey, one `ephemeralMessage` step. Navigator decision
     (b): no regression on a version this story cannot measure live; the path is
     removable when the matrix's floor for agy moves to 1.4.7, and its current tests
     (payloads without the field) are its characterization.

4. **The step, and the session's start.**
   - The block rides in a persistent `systemMessage` step. DS7's ephemeral choice is
     revised for agy: the probe measured again that agy stores an ephemeral step at
     rest in the transcript (TS2's observation), so ephemeral never kept identity off
     disk — it only kept it out of later turns, which is the opposite of what the
     doorman's deltas need. agy wraps the step ("The following system message was
     injected by a PreInvocation hook:"); the delivered line opens the text inside.
   - `agySessionStart` keeps `mirror_active` (US4's measured scope change), and now
     also stamps the session's own operating mode Mirror Mode and sets
     `doorman_refresh` (through `forgetDoormanDelivery`). The stamp: the doorman reads
     a session as in Mirror Mode only while its operating mode says so — the session's
     own stamp, else the global one — and the old path never read the mode; without
     the stamp, a new agy conversation on a home whose global mode is Builder would
     get nothing. The refresh: the first turn of a new conversation is the full
     folder, routed from that turn's prompt — the session's fixed cost, one `mirror
     load --query`.
   - A resumed conversation fires no `SessionStart` (probe, observation 4), so
     nothing is re-delivered: the persisted folder is still before the model
     (observation 5), and the next turn is a delta on it.
   - **Known limit, unmeasured:** `lastUserInput` is the conversation's last user
     input. An execution agy starts with no new user input — a timer the agent
     scheduled, a background task's completion — would, if it fires invocation 0,
     carry the previous prompt and get a second delivery for it (a delta: one more
     embedding and the next memories above the threshold; on an explicit-form prompt,
     a second folder). Not observable headlessly; recorded for Debt Review.

5. **Tests first** (`ts/test/hooks/agy.test.ts`), against a scratch home with routed
   personas and replayed providers, as `claudeInject.test.ts` drives Claude's hook:
   - the plugin's explicit form (`/mirror-mind:mm:mirror <q>`) in a session no
     `SessionStart` activated: ONE `systemMessage` step whose text opens with
     `=== mirror context delivered by the runtime for this turn: full`, the session
     marked active with the routed persona;
   - `SessionStart`, then an ordinary first turn: full (the refresh); a second turn in
     another persona's domain: a delta naming that persona, one `llm_calls` embedding
     row; the same domain again: no persona section;
   - a skill turn (`/mirror-mind:mm:build mirror`) in an active session: `{}`, no
     embedding;
   - an ordinary turn outside Mirror Mode (no session; a session whose mode was
     switched to Builder): `{}`, no row created, no embedding;
   - a `transcriptPath` that does not exist does not matter: the explicit form still
     delivers, and nothing reaches `hooks.log`;
   - a prompt or a `conversationId` shaped like a flag or a shell (`--session-id`,
     `$(whoami)`, `"; rm -rf …`, a newline) cannot forge argv or fail the turn;
     `hooks.log` never carries prompt text;
   - a doorman that fails (a database it cannot open) answers `{}` and leaves one
     `hooks.log` line without the prompt;
   - `invocationNum !== 0` answers `{}` without touching the database, with the field
     present;
   - without the field: the existing ephemeral tests stand, renamed as the pre-1.4.7
     path;
   - `agy:session-start` sets `mirror_active`, the session's Mirror Mode stamp, and
     `doorman_refresh`, on a fresh and on a returning conversation.
   `hooks.test.ts` / `hookRegistrations.test.ts` keep holding the wrapper bytes and
   the `hooks.json` registration, which do not change.

6. **Measured live on the installed agy**, in a scratch HOME as DS7 US4 did (version,
   binary, date, model in the test guide), interactive and through the headless
   `--print` route. Two bars, kept apart in the evidence: **step delivered** (this
   story's: the right step, once, with the right delivered line, at the right turn)
   and **model signed** (observed and recorded: agy runs Gemini, and whether it honors
   a one-line `sign ◇ <persona>` in a system step is a model-layer property — a miss
   with the step present and correct is recorded for the prompt engineer, not fixed
   here). Rows: an explicit `/mirror-mind:mm:mirror` question answered as the mirror
   with one step and no second `mirror mirror load` by the model; a follow-up in
   another persona's domain re-routed; later turns; a `/mirror-mind:mm:build mirror`
   turn and the ordinary turn after it; a resumed conversation; the Stop handler's
   logging; `hooks.log`; and `llm_calls` rows per turn as a number. The Builder-switch
   row is read honestly: `mirror build load` from the model's shell cannot name the
   agy session (US4), so it stamps the most recently updated row — the agy row, which
   the Stop handler writes every turn, unless another runtime's session was touched
   more recently — and the limit is walked with a second runtime's session touched in
   between.

7. **The record.** `index.md` written as the story it is, with the probe's branch,
   the amendment, and the step-type revision with its evidence;
   `docs/product/specs/runtime-interface/index.md`: Antigravity's row keeps L4, its
   injection cell reads the doorman with the prompt from the payload, with version
   1.4.7, binary, and date; `docs/product/architecture.md`'s Runtime Model row the
   same, held by `runtimeParityDocs.test.ts`; the DS8 candidate table's TS6 row; the
   header comment of `agy.ts` (the ephemeral rationale and "no prompt" replaced); one
   `docs/process/worklog.md` entry. The contract's injection section, the
   injection-models table, Getting Started, and REFERENCE are TS7's.

## Non-Goals

- TS7: the contract's injection section, the injection-models table, Getting Started,
  REFERENCE, the decisions log's cost line.
- A change to the doorman's policy, the memory threshold, the ranker, or what the
  folder contains; a new front-door command (agy reaches `mirror doorman` in-process);
  a "full every turn" mode in the doorman; the shared route's flag parsing (a prompt
  that is exactly `--forget` — a Debt Review finding).
- Switching agy from always-on activation at `SessionStart` to explicit-form
  activation; measuring whether the model's own shell on agy carries the
  `conversationId` (TS1's question, unasked for agy) — which is also what would make
  the Builder switch name its session.
- Making Gemini sign: the signature line is delivered; whether the model honors it
  is observed, and a miss is the prompt engineer's.
- The generated wrappers (`plugins/mirror-mind/agy/*.sh`), `hooks.json`, and the
  `invocationNum` gate.
- Grok Build (CR143, inert); the Stop handler's logging and high-water.
- Compaction on agy; executions agy starts without a user input; `mirror log` on agy.

## Acceptance Behavior

```text
Given the installed agy and a PreInvocation payload at invocationNum 0
When the probe handler runs
Then it records the payload's lastUserInput and the transcript's last USER_INPUT
     for the turn (evidence/probe-20261025.md: both hold the prompt on agy 1.4.7)

Given a payload at invocationNum 0 with lastUserInput `/mirror-mind:mm:mirror <q>`
  for a conversation no SessionStart activated
When agy:pre-invocation runs
Then it hands `mirror doorman --session-id <conversationId> --prompt <q-form>` the
     turn, and answers ONE injectSteps systemMessage step whose text opens with
     `=== mirror context delivered by the runtime for this turn: full`
And the session is marked mirror_active with the routed persona

Given agy:session-start for a new conversation
When the handler runs
Then the session row is mirror_active, stamped Mirror Mode, with doorman_refresh set
And the conversation's first ordinary turn is delivered full, routed from its prompt

Given the same session on a later ordinary turn in another persona's domain
When agy:pre-invocation runs at invocationNum 0
Then the step opens with `… delta (persona: <new persona> …); sign ◇ <new persona>`
And one embedding row is written to llm_calls for the turn

Given a skill turn (`/mirror-mind:mm:build mirror`), or an ordinary turn outside
  Mirror Mode
When agy:pre-invocation runs
Then it answers {} and writes no embedding row

Given a payload whose transcriptPath does not exist
When agy:pre-invocation runs on the explicit form
Then it still delivers, and hooks.log stays empty — the hook reads no transcript

Given a doorman that cannot run (its database unreadable)
When agy:pre-invocation runs
Then it answers {} and writes one hooks.log line naming the fact, not the prompt

Given invocationNum != 0
When agy:pre-invocation runs
Then it answers {} without touching the database, as today

Given a payload without lastUserInput (agy before 1.4.7)
When agy:pre-invocation runs at invocationNum 0
Then an active session gets ONE ephemeralMessage step from `mirror load
     --context-only`, and a quiet one gets {} — today's behavior, unchanged

Given agy 1.4.7 installed, a scratch HOME, Mirror from the package
When the Navigator walks the test guide, interactive and headless
Then the explicit turn is answered as the mirror with ONE systemMessage step in the
     transcript and no `mirror mirror load` run by the model;
     a follow-up in another domain carries the re-routed persona in its delivered line;
     the signature is observed and recorded per turn, apart from the step;
     after a Builder switch the next ordinary turn carries no step when the switch
     landed on the agy row, and the limit is observed when it did not;
     a resumed conversation fires no SessionStart and its next turn is a delta;
     the Stop handler logs the session as antigravity with equal user/assistant counts
     and the skill turns skipped; hooks.log is empty;
     llm_calls rows per turn are recorded as numbers: one load per new conversation,
     one embedding per ordinary turn, none on a skill turn
And the parity matrix and the architecture's Runtime Model agree on agy's row, held
    by runtimeParityDocs.test.ts
And unrelated Delivery Story scope remains untouched
```

## Validation Route

- **Automated:** `agy.test.ts` red before, green after; `hooks.test.ts`,
  `hookRegistrations.test.ts`, `claudeInject.test.ts`, the doorman tests,
  `runtimeParityDocs.test.ts` green; `npm test`, `typecheck`, `lint`,
  `git diff --check` clean; the hook smokes (`smoke_claude_plugin.sh`,
  `smoke_mirror_mcp.sh`) because the story touches hooks.
- **Navigator, live** (the test guide, in a scratch HOME on the installed agy,
  interactive and headless): read the transcript's `SYSTEM_MESSAGE`/`SYSTEM_SDK` steps
  for the delivered line per turn; the model's reply for the voice and the `◇`
  signature, recorded apart; `runtime_sessions` for the session's persona, mode, and
  `doorman_delivered`; `llm_calls` for the per-turn count; the conversation log for
  user/assistant counts; `hooks.log` for silence. Pass: every row of the walk as
  written. Fail: a second `mirror mirror load` on the explicit turn, a delivered line
  naming the wrong persona, a delivery on a skill turn, a missing log row, any
  `hooks.log` line, or a per-turn cost above the stated figure.

E2E decision: required — the live walk on the installed agy is the story's bar.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV9.DS8.TS6`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- The probe handler is not committed as product code; its result and its source are
  committed as evidence.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- the probe's branch — met on 2026-10-25: reachable through the payload; the
  amendment above was confirmed by the Navigator before any code was written

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
