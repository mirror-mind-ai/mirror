[< Parent](../index.md)

# CV9.DS8.TS6 — Antigravity through the one doorman

**Status:** 🟡 Planned
**Type:** Technical Story
**Delivery Story:** CV9.DS8 — One Doorman: Mirror's Context Before the Model on Every Runtime

---

## Technical Story

In order to have Antigravity's per-turn injection decided by the one doorman — the
policy DS8 built in the core and US4 and US5 measured on Claude Code, Codex, and Pi —
instead of by the hook's own rule (the whole folder on every turn, routed from nothing,
with no delivered line for the skill to trust),
As the Mirror hook layer on agy,
I want `PreInvocation` to hand the turn's prompt and the session's `conversationId`
to `mirror doorman` in-process and write its answer back as a persistent
`systemMessage` step — the prompt taken from the payload's own `lastUserInput`, which
agy 1.4.7 carries (the probe that was to find it in the transcript found it in the
payload) — and to keep today's injection where the payload has no prompt,
So that on agy an explicit Mirror turn loads the folder once, a follow-up in another
domain re-routes its persona and signs it, a skill turn costs nothing, and the DS8
done condition "Antigravity runs the doorman with no regression, measured live" holds
on the installed agy.

## Outcome

- [evidence/probe-20261025.md](evidence/probe-20261025.md): on agy 1.4.7 every hook
  payload carries `lastUserInput`, the turn's text verbatim (a skill turn in its slash
  form; absent on 1.4.2, where DS12.TS3 L7 measured no prompt); the transcript holds
  the same prompt at invocation 0; invocation 0 fires once per user turn;
  `SessionStart` fires for a new conversation, not a resumed one; a `systemMessage`
  persists across turns and processes, an `ephemeralMessage` is stored on disk and
  dropped from context. The plan's amendment follows from these, approved by the
  Navigator on 2026-10-25.
- `agyPreInvocation`, at invocation 0 with the field, runs `mirror doorman
  --session-id <conversationId> --prompt <lastUserInput>` through `runFrontDoor`, as
  `claudeInject` does, and answers its block as ONE `systemMessage` step, or `{}`.
  The hook decides nothing and reads no transcript: the explicit form delivers even
  in a session no `SessionStart` activated, a skill turn and a turn outside Mirror
  Mode get `{}`, and the prompt goes only to the doorman. A failed doorman answers
  `{}` and leaves one `hooks.log` line naming the fact, never the prompt.
- Without the field (agy before 1.4.7), today's injection, unchanged: the
  `readMirrorState` check, `mirror load --context-only`, one `ephemeralMessage` step
  — Navigator decision (b), no regression on a version this story cannot measure.
- The step type is revised for agy from DS7's `ephemeralMessage` to `systemMessage`:
  agy stores an ephemeral step at rest anyway (measured twice), and the doorman's
  deltas need the folder to stay before the model.
- `agySessionStart` sets `mirror_active` (as since US4), stamps the session's own
  operating mode Mirror Mode — the doorman reads the mode, the old path did not, and a
  global Builder stamp would otherwise silence a new agy conversation — and sets
  `doorman_refresh`, so a new conversation's first turn is the full folder routed from
  its own prompt. A resumed conversation fires no `SessionStart` and keeps its
  persisted folder.
- Measured live on the installed agy in a scratch HOME (version, binary, date, model
  in the test guide), interactive and headless, with two bars kept apart: *step
  delivered* (this story's) and *model signed* (observed; Gemini honoring `sign ◇` is
  a model-layer property, a miss is the prompt engineer's). Explicit turn once;
  domain change re-routed in the delivered line; Builder switch read honestly —
  `mirror build load` cannot name the agy session (US4), so it stamps the most
  recently updated row, the agy row unless another runtime's was touched later, and
  the limit is walked; a resumed conversation gets a delta, not a second folder; the
  session logs as `antigravity`, counts equal, skill turns skipped; `hooks.log`
  empty; `llm_calls` per turn recorded as numbers.
- The parity matrix's Antigravity row and the architecture's Runtime Model carry the
  measured injection cell and agy 1.4.7, held by `runtimeParityDocs.test.ts`; the
  DS8 candidate table's TS6 row; `agy.ts`'s header; one worklog entry.
- Carried to Debt Review, not fixed: an execution agy starts without a new user
  input would carry the previous `lastUserInput` and get a second delivery
  (unmeasured); a prompt that is exactly `--forget` trips the shared doorman route's
  flag on every runtime; compaction on agy.
- Not in this story: TS7's docs; the doorman's policy or threshold; explicit-form
  activation on agy, and the model-shell `conversationId` that would also let the
  Builder switch name its session; making Gemini sign; the wrappers and `hooks.json`;
  Grok Build.

## Acceptance Behavior

```text
Given a payload at invocationNum 0 with lastUserInput `/mirror-mind:mm:mirror <q>`
  for a conversation no SessionStart activated
When agy:pre-invocation runs
Then it answers ONE injectSteps systemMessage step whose text opens with
     `=== mirror context delivered by the runtime for this turn: full`
And the session is marked mirror_active with the routed persona

Given agy:session-start for a new conversation
When the handler runs
Then the session row is mirror_active, stamped Mirror Mode, with doorman_refresh set
And the conversation's first ordinary turn is delivered full, routed from its prompt

Given the same session on a later ordinary turn in another persona's domain
When agy:pre-invocation runs at invocationNum 0
Then the step carries `sign ◇ <new persona>` in its delivered line
And one embedding row is written to llm_calls for the turn

Given a skill turn, or an ordinary turn outside Mirror Mode
When agy:pre-invocation runs
Then it answers {} and writes no embedding row

Given a payload whose transcriptPath does not exist
When agy:pre-invocation runs on the explicit form
Then it still delivers, and hooks.log stays empty — the hook reads no transcript

Given a doorman that cannot run
When agy:pre-invocation runs
Then it answers {} and writes one hooks.log line naming the fact, never the prompt

Given invocationNum != 0
When agy:pre-invocation runs
Then it answers {} without touching the database, as today

Given a payload without lastUserInput (agy before 1.4.7)
When agy:pre-invocation runs at invocationNum 0
Then today's behavior holds: an active session gets ONE ephemeralMessage step, a
     quiet one gets {}

Given agy 1.4.7 installed, a scratch HOME, Mirror from the package
When the Navigator walks the test guide, interactive and headless
Then the explicit turn is answered as the mirror with ONE systemMessage step and no
     `mirror mirror load` run by the model; a follow-up in another domain carries the
     re-routed persona in its delivered line, the signature observed and recorded
     apart; after a Builder switch the next ordinary turn carries no step when the
     switch landed on the agy row, and the limit is observed when it did not; a
     resumed conversation's next turn is a delta; the Stop handler logs the session
     as antigravity with equal counts and the skill turns skipped; hooks.log is
     empty; llm_calls rows per turn are recorded as numbers
And the parity matrix and the architecture agree on agy's row
And unrelated Delivery Story scope remains untouched
```

## Scope

- The probe (not committed as code; its result and source as evidence).
- `ts/src/hooks/agy.ts`: `parseAgyPayload` reads `lastUserInput`;
  `agyPreInvocation` through the doorman as a `systemMessage` step, the pre-1.4.7
  path kept; `agySessionStart` stamping Mirror Mode and setting `doorman_refresh`;
  the header comment; `ts/test/hooks/agy.test.ts`.
- `docs/product/specs/runtime-interface/index.md`, `docs/product/architecture.md`
  (Antigravity's row), the DS8 candidate table, `docs/process/worklog.md`, the test
  guide with the live walk.

## Out Of Scope

- TS7; the doorman's policy, threshold, ranker, or folder content; a "full every
  turn" mode in the doorman; the shared route's flag parsing.
- Explicit-form activation on agy; the model-shell `conversationId` question;
  making Gemini sign.
- The generated wrappers, `hooks.json`, the `invocationNum` gate.
- Grok Build; the Stop handler's logging; compaction on agy; executions agy starts
  without a user input.

## Validation

Automated: `agy.test.ts` red before and green after; the hook, registration,
inject, doorman, and parity-docs tests; `npm test`, `typecheck`, `lint`; the hook
smokes. Navigator: the live walk on the installed agy (`test-guide.md`), read against
the transcript's injected steps, the model's replies, `runtime_sessions`,
`llm_calls`, the conversation log, and `hooks.log`.
