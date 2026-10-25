# Plan — CV9.DS8.US5

## Objective

Make the Pi extension (`.pi/extensions/mirror-logger.ts`) the fourth caller of the one
doorman, so that on Pi the runtime puts Mirror's context before the model by DS8's
policy: the full folder on the explicit form, opened by the delivered line TS3's skill
trusts, so the turn loads once; a delta on each ordinary turn while Mirror Mode is on,
so a follow-up in another domain re-routes and signs; nothing when it is off. Set the
memory threshold DS8's policy names on the semantic score, aligned with the attachments'
rule, informed by the scores TS2 logs and the deltas US4 measured, so a delta carries
the memories relevant to the question and not the five nearest. Then measure it live on the installed Pi with CR165's route and move Pi's
parity row to L4 with version, binary, and date — which is what this User Story is for.

## Scope

1. **The session is named.** At `session_start` the extension sets
   `process.env.MIRROR_SESSION_ID` to the session file, as TS1's P2 probe did and DS8's
   policy rule 3 already states. Pi's bash tool inherits it (TS1 measured, 1.4.0), so a
   `mirror mirror load` the model runs by itself on an unprompted question names the
   Pi session, `writeMirrorState` marks it (TS2), and the doorman takes the next turn.
   The same variable names the session for `mirror build load` (and `explore`, `soul`):
   today those routes guess the session on Pi (the most recently updated row), so a
   Builder switch stamps a row that may not be this session's and the doorman keeps
   delivering deltas on Builder turns; named, the switch ends them (US4 scope 3, now
   true on Pi). `/new`, `/resume`, and `/fork` fire `session_start` again and re-set it.
2. **The turn goes through the doorman.** In the `before_agent_start` handler that
   already resolves the prompt (the typed text, else the skill wrapper read back to its
   command — CR160), for a run a user prompt started (`messageType` undefined or
   `"user"`), the extension runs
   `mirror doorman --prompt <prompt> --session-id <session file>` through the same
   front-door bin every other event uses, **awaited** — the turn cannot start before
   the block exists. Non-empty stdout is returned as the run's message:
   `{ message: { customType: "mirror-context", content: <block>, display: false } }`.
   Pi appends it after the user message in this run's context (`_prepareRun`,
   1.4.0), before the first token, and hands it to the model as a **user-role**
   message (`convertToLlm`, `custom` → `user`): two user messages in a row, the second
   opening with "delivered by the runtime" — the line that tells the model it is not
   the person speaking; nothing precedes it. It is a `custom` entry in the session
   file, not a tool result, so the skill's "this turn, not a tool result" rule reads it
   as delivery. Empty stdout returns nothing: no message, no entry. The prompt is
   truncated for the argument as `--payload` is (50 KB, ARG_MAX): the form is at the
   start, routing and the embedding do not need the tail; without it a pasted
   document would fail the exec silently and the skill would load twice.
   **Shape:** one `deliverMirrorContext(sessionId, prompt)` on a `runOnChain` that
   returns stdout; `enqueueUserLog` becomes a wrapper on it; the handler reads top to
   bottom: flush an earlier stop, deliver, log. `MIRROR_SESSION_ID` is cleared at
   `session_shutdown`, so nothing inherits a stale file between sessions; the header
   names the environment mutation and what inherits it.
   **Ordering on the chain:** the doorman runs on the per-session chain before the
   `user-prompt` logger link is enqueued, so the doorman process has exited before the
   logger's process is spawned. The first-turn logger upsert rebuilds the whole
   `runtime_sessions` row from what it read (`upsertRuntimeSession`), and overlapping
   the doorman's full load it would write back `mirror_active = 0`, persona NULL —
   the revert US4's test guide warns about on row 1. On Pi the extension owns the
   order, so it does not race. The logger stays un-awaited, as today.
3. **What a turn costs on Pi.** Outside Mirror Mode the doorman decides on a
   read-only handle and exits with nothing: no embedding, no snapshot, no write, no
   context — one node process. Measured on this tree against the 61 MB `vinicius-dev`
   home while planning: **0.21 s** wall (`mirror doorman --prompt … --session-id
   <unknown>`, three runs), paid before every Builder turn. The alternative, a local
   gate that spares the process, needs the extension to know the explicit form or the
   session's mode — the policy duplication DS8 was written to end. The plan takes the
   0.21 s and records it; the Navigator may decide otherwise (a stop condition, named
   below). On a delivering turn the cost is the doorman's (US4: ~1 s, one embedding
   per delta, reception on the full turn), inside `pi.exec`'s 30 s cap (worst case
   25 s on an explicit turn, 15 s on a delta — US4's timeouts, unchanged).
4. **The memory threshold, on the semantic score.** The hybrid score the ranker
   returns is half semantic and half recency, reinforcement, relevance, and lexical: a
   fresh, reinforced, relevance-1 memory floors at 0.35 with no semantic match and
   would pass a composite 0.40 at cosine ≥ 0.10, which unrelated texts reach
   routinely; a 180-day-old, unreinforced one would need cosine ≥ ~0.6. A composite
   threshold is a recency gate, not the relevance gate DS8's policy names. So
   `rankMemories` (`ts/src/search/ranker.ts`) **reports** the semantic component
   beside the score — an additive `semantic` field on `RankedMemory`, the ranking
   itself untouched (DS8's non-goal is how memories are ranked, not what the ranker
   reports) — and `runDelta` renders only the memories whose `semantic` reaches
   `DOORMAN_MEMORY_SEMANTIC_THRESHOLD = 0.4`, the rule `relevantAttachments` already
   applies to attachments (`> 0.4` cosine): one rule for both, `>=` for memories,
   stated and boundary-tested. The five-memory limit stands as the ceiling. The score
   log carries both numbers from now on (`memory_scores=` and `memory_semantic=`), so
   the walk can read the value against data: the 27 composite rows TS2 and US4 logged
   (16 distinct; off-topic deltas topping at 0.331–0.377 with 3 of 5 memories
   repeating, on-topic at 0.444–0.448 and 0.587–0.591) show the gap exists in this
   home; the semantic rows the walk logs show whether 0.4 cuts it. The test guide
   records the value confirmed or the one the rows move it to, and the per-turn
   memories that passed. On a degraded search (no embedding), the `semantic` is 0 and
   no memory passes: the delta carries the line and the persona, as TS2 designed. One
   test in `ranker.test.ts` (the field reported); one in `doorman.test.ts`: a delta
   whose memories' semantic scores sit under the threshold carries no
   `=== relevant memories ===` block and still logs every score; at and above, it
   carries them.
5. **Tests first.** `ts/test/pi/mirrorLoggerExtension.test.ts`, the fake-`pi` harness
   (its `fire` gains a variant that returns handler results): `session_start` sets
   `MIRROR_SESSION_ID` to the session file, re-sets it on a second `session_start`,
   and `session_shutdown` clears it; a user prompt spawns `mirror doorman --prompt
   <typed> --session-id <file>`, and the `user-prompt` link is not spawned until the
   doorman has settled; a doorman that answers a block makes the handler return a
   message with `customType: "mirror-context"`, that block as content, `display:
   false`; an empty answer returns no message; a `"custom"`-typed run and a session
   without a file spawn no doorman; a prompt over 50 KB reaches the doorman truncated;
   a doorman whose exec rejects returns no message and the turn goes on (a
   characterization of `runMirror`'s existing swallow — no new code for it).
   Assertion messages carry no prompt (`hookPayloadRedaction` discipline).
   `ts/test/search/ranker.test.ts`: the `semantic` field. `ts/test/mirror/doorman.test.ts`:
   the threshold cases above. The route the extension calls is already tested
   (`mirrorModeCli.test.ts`, TS2) and is not changed beyond the second log line.
6. **Live measurement**, by the Navigator, on the installed Pi (version, binary,
   date, the home's database size in `test-guide.md`), per DS8's route and US4's
   eight rows: explicit turn loads once (no `mirror mirror load` tool call; the reply
   signed); follow-up in another domain re-routes and signs; a same-domain follow-up
   and two more turns still sign; `/mm-build mirror`, then an ordinary Builder prompt:
   no mirror voice, no signature, no new `llm_calls` row; fresh session, an unprompted
   personal question is answered through the skill, `mirror mirror load` runs once,
   the Pi session row is `mirror_active = 1`; the next turn is a doorman turn; the
   conversation log holds the prompts and replies, the form stripped, no block row;
   the session file holds the `mirror-context` custom entries only on the delivering
   turns. Added by review: the rows for the explicit turn and the unprompted question
   are run **also from a cwd outside the tree** — the npm user's situation (D13) —
   because inside the checkout the project's `.pi/extensions` and `AGENTS.md` are in
   play and a pass could be true of the checkout and false of an install; a `/new`
   row (fresh file, variable re-set, the first ordinary turn gets nothing); a
   `/resume` row of a Mirror-active session (what its first turn does, observed); a
   named-session regression row (`/mm-journeys`, `/mm-build mirror`, `/mm-explore`,
   `/mm-new`, the status line — behaviors that were dormant on Pi while the session
   was unnamed, including whether the model now calls `mirror log`); and the
   prompt-engineer's one failure mode watched on the explicit turn: the model
   answering *about* the block or quoting it. Beside the rows, by the Driver on the
   CLI: delta bytes with the threshold on, the memories kept per turn and their
   semantic scores, the bytes injected over the eight-turn session, the per-turn
   doorman latency on a `nothing` turn and on a delta. **Precondition from US4's first
   walk:** `/opt/homebrew/bin/mirror` → the tree (it does, `npm link`, checked while
   planning), the installed Pi's `mirror-mind` package → the tree (it does:
   `~/.pi/agent/settings.json` lists `/opt/homebrew/lib/node_modules/mirror-mind`, the
   link), one `.env` on both sides. In the checkout the extension is reached twice
   (project `.pi/extensions/` and the package); the process-scoped guard keeps one
   registration, so one doorman per turn — read, not assumed, from
   `mirror-logger.log` ("second registration skipped").
7. **Docs.** The parity matrix row for Pi moves to **L4**: the "Mirror context before
   the model answers" cell names the extension's `before_agent_start` through the one
   doorman, with the version, binary, and date of the walk and this story as the
   record; the architecture's Runtime Model table gives Pi L4 (`runtimeParityDocs`
   holds the two together) and its "Pi is L3 by that line" sentence and the contract's
   L4 paragraph lose the Pi exception (CR165 already reads promoted to DS8,
   2026-10-24, and is not touched). The extension's header comment names the new event behavior. One
   worklog entry. The matrix record names the harness test as Pi's automated proof —
   there is no `smoke_pi.sh`, and L4's definition asks for "an isolated smoke"; the
   gap is named, not implied. The contract's injection section, its "Mirror Mode
   injection models" table, Getting Started's table, and REFERENCE are TS7's, from
   what this walk measured.
8. **Observations carried to Debt Review**, not fixed here (DS8 policy, not US5):
   every block is a user-role message persisted in the session file and replayed on
   every later request (33 KB for the folder, 2.5–8.5 KB per delta before the
   threshold, 3 of 5 memories repeating) — dedupe-within-session is a Change Request
   candidate, with the walk's bytes as its number; and the delta's premise, "the
   identity layers already sit in the transcript", fails after Pi compacts or resumes
   a session that is still `mirror_active` — Pi is the first runtime where it is
   observable (automatic compaction), the `/resume` row records what happens.

## Found During Implementation (2026-10-25)

1. **CR008's tripwire fired, and option B landed here (Navigator: option 1).**
   `namedSessionPrecondition.test.ts` was written on 2026-09-25 to fail the day a
   runtime names its session; Scope 1 is that day. The hazard it guarded: `build
   load` with no name still stamps a *guessed* session (the most recently updated
   row — another window's), and a lifecycle command named to that row would bind
   the other window's journey. Antigravity, Grok Build, and a bare shell still
   guess. So, as CR008 recorded for this moment: `activateOperatingMode` takes
   `named`, and a stamp written under the session's name carries
   `named_session: true` in its payload (the key only when true, so unnamed stamps'
   bytes are unchanged); `build load` sets it when the session it stamps is the
   one named; `namedSessionBuilderJourney` binds only from such a stamp. Tests:
   `operatingMode.test.ts` (provenance present on a named stamp, absent on a
   guessed one and the global row), `commands.test.ts` (a `MIRROR_SESSION_ID`
   naming a session whose Builder stamp was guessed refuses, across every leaf;
   the scenario seeds stamp under the name), `buildCli.test.ts` (the named
   session's stamp carries provenance); the tripwire retired;
   `builder-load.golden.json` moved by the one key on its ten named rows; CR008's
   Debt Review row records the landing.
2. **A degraded search keeps TS2's FTS hits.** Scope 4 said no memory passes on a
   degraded search; TS2's tests assert a degraded delta carries its lexical hits,
   and the Non-Goals forbid changing the doorman's rendering beyond the threshold.
   The threshold applies when a semantic score exists; a lexical hit is relevance
   by another signal. The constant's comment says so.
3. **`.pi` typecheck:** three pre-existing errors in the AGENTS.md handler
   (`contextFiles` optional in the pinned 0.70.0 types), unchanged; the new
   return typechecks.

## Non-Goals

- Do not implement sibling roadmap item: Antigravity through the one doorman.
- Do not implement sibling roadmap item: Written where a user reads it.
- Do not change the doorman's decision, rendering, or session writes (TS2, US4) beyond
  the memory threshold in Scope 4; do not change how the ranker orders memories (it
  reports one more number), the memory limit, or the attachment threshold.
- Do not dedupe memories across a session's deltas or re-deliver the folder after
  compaction or `/resume` (Scope 8: observed, carried).
- Do not duplicate the explicit form, the session-state read, or any policy in the
  extension: it asks the core every turn and carries the answer.
- Do not pass the Pi session to `mirror log` on purpose or change the skill's step 4;
  whether the model now calls `mirror log` on Pi because `MIRROR_SESSION_ID` resolves
  is observed in the walk (row 8) and recorded, not pre-empted.
- Do not change the `user-prompt` / `stop` logging, the welcome, the status line, the
  session close, or the backup.
- Do not rewrite the model's commands (TS1's P1, measured and not chosen).
- Grok Build: its row stays L3 (CR143).

## Acceptance Behavior

```text
Given the Pi extension at session_start with session file F
When the handler runs
Then process.env.MIRROR_SESSION_ID = F, and a later session_start with F' re-sets it

Given a run a user prompt started in session F, and the prompt opens with the
  explicit Mirror form
When before_agent_start runs
Then the extension spawns `mirror doorman --prompt <prompt> --session-id F`, awaits it,
     and returns a message { customType: "mirror-context", content: <block>,
     display: false } whose content opens with the delivered line (full)
And the user-prompt logger link is spawned only after the doorman process has exited

Given session F is mirror_active in Mirror Mode with persona P, and the prompt is
  ordinary and scores persona Q
When before_agent_start runs
Then the message's content is the delta: the delivered line naming Q, Q's section, the
     memories whose semantic score is at or above DOORMAN_MEMORY_SEMANTIC_THRESHOLD
     (at most five), the relevant attachments; no identity layer
And runtime_sessions F reads persona Q, and llm_calls holds one embedding row

Given session F is not in Mirror Mode and the prompt is ordinary
When before_agent_start runs
Then the doorman answers nothing, the handler returns no message, and no custom entry
     is written to the session file

Given a run a custom message started, or a session with no file
When before_agent_start runs
Then no doorman is spawned

Given the doorman exec rejects or times out
When before_agent_start runs
Then the handler returns no message and the turn starts; the failure is in
     mirror-logger.log

Given a prompt longer than 50 KB
When before_agent_start runs
Then the doorman receives it truncated, the form at its start intact

Given session_shutdown
When the handler runs
Then process.env.MIRROR_SESSION_ID is cleared

Given a delta turn whose five ranked memories all have a semantic score under 0.4
When the doorman renders
Then the block carries the delivered line (and a persona section when one re-routed)
     and no `=== relevant memories ===` block, and the log received all five composite
     and semantic scores

Given rankMemories ranks a set of memories
When it returns
Then each result carries `semantic` (the cosine of the query and the memory) beside
     `score`, and the order is what it was before

Given the installed Pi 1.4.0 with the tree linked, a fresh session (in the checkout,
  and once more from a cwd outside it), `/skill:mm-mirror <personal question>`
When the turn runs
Then the model answers as the mirror, signs ◇ <persona>, runs no
     `mirror mirror load` of its own, and does not answer about or quote the block;
     the session file holds one mirror-context entry
And a follow-up in another persona's domain is signed with that persona
And a same-domain follow-up and two later turns are still signed
And after `/mm-build mirror` in the same session, an ordinary turn carries no mirror
    voice, no signature, adds no llm_calls row, and the session file gains no
    mirror-context entry for it
And in a fresh session, an unprompted personal question answered through the skill
    leaves the Pi session mirror_active, and the next turn is a doorman turn
And after /new, the first ordinary turn of the new session gets no block
And /mm-journeys, /mm-build mirror, /mm-explore, /mm-new, and the status line still
    answer with the session named
And the conversation log holds the prompts (form stripped) and the replies once each,
    and no row holding the block
And the parity matrix reads Pi L4 with version, binary, and date, and
    runtimeParityDocs.test.ts passes
And out-of-scope sibling roadmap items remain untouched
```

## Validation Route

- Automated: `mirrorLoggerExtension.test.ts` red before the extension change (no
  doorman spawn, no message, no `MIRROR_SESSION_ID`), green after; `ranker.test.ts`
  red before the `semantic` field, green after; `doorman.test.ts` red before the
  threshold (five memories rendered regardless of score), green after;
  `runtimeParityDocs.test.ts` green with the matrix and architecture moved together;
  `cd ts && npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`;
  `checkSkillCommandParity`, `checkPackContents`, `checkDocLinks`,
  `checkRetiredSurfaces` clean; `.pi` typecheck of the extension against the pinned
  Pi types (`before_agent_start` returning `message` is in the pinned
  `BeforeAgentStartEventResult`).
- Navigator-visible, live (the rows with expected observation, pass and fail
  conditions are in `test-guide.md`), on the installed Pi, with the session rows,
  ledger, conversation log, and the session file read between turns:
  1. fresh session, `/skill:mm-mirror <personal question>` (the menu's form on Pi,
     CR159): the reply is the mirror's and signed, not about the block; the transcript
     shows no `mirror mirror load` tool call; the session row (the session file path)
     is `mirror_active = 1` with a persona, operating mode Mirror Mode; the session
     file holds one `mirror-context` custom entry opening with the delivered line
     (full);
  2. a follow-up in another persona's domain: signed `◇ <other persona>`; the row's
     persona moved; `llm_calls` +1 embedding; a `mirror-context` entry whose first
     line names the persona;
  3. a same-domain follow-up and two more turns: persona stable, every reply signed;
  4. `/mm-build mirror`, then an ordinary Builder prompt: Builder surface, then a
     Builder answer with no mirror voice, no signature, no new `llm_calls` row, no
     `mirror-context` entry; the session row's mode is Builder Mode — the switch
     stamped *this* session, not a guessed one;
  5. fresh session, an unprompted personal question (no form): the model invokes the
     skill, `mirror mirror load` runs once, the row is `mirror_active = 1` by the
     session file's path (TS1's P2, live);
  6. the next prompt in that session is a doorman turn (row 2's observations, no load
     call);
  7. the conversation log holds the prompts (form stripped) and the replies, once each,
     and no row holding the block; whether the model called `mirror log` on Pi is
     recorded;
  8. `/new`: the new session's first ordinary turn gets no block; `/resume` of the
     Mirror-active session from row 1: what its first turn does, recorded;
  9. rows 1–2 and 6–7 again from a cwd outside the tree (a temp dir), the install's
     situation: the same observations;
  10. regression with the session named: `/mm-journeys`, `/mm-build mirror`,
     `/mm-explore <slug>`, `/mm-new`, the status line — each answers as before;
  11. beside the rows: the per-turn `nothing` cost and delta latency (`time mirror
     mirror doorman …`), delta bytes, the memories kept per turn with their semantic
     scores, the bytes injected over the session, the threshold confirmed or moved,
     `pi --version`, `which pi`, the date, the home's size, and "second registration
     skipped" in `mirror-logger.log`.
- E2E decision: required and live — this story exists to measure Pi. The walk is run
  before Done; if a row fails, the story stays open.

E2E decision: required unless Navigator explicitly accepts a narrower fixture-level validation route

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV9.DS8.US5`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- the Navigator declines the per-turn read (Scope 3's 0.21 s) and wants a local gate
- the live walk finds Pi 1.4.0 does not deliver a `before_agent_start` message to the
  model before the first token, the skill treats it as not delivered, or the model
  answers about the block instead of from it

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
