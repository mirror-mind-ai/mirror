# Plan — CV9.DS8.US4

## Objective

Make the Claude-family inject hook (`mirror-inject.sh` → `claudeInject`) call the
one doorman instead of carrying its own two-case policy, so that on Claude Code and
Codex the runtime puts Mirror's context before the model by DS8's policy: the full
folder on the explicit form, opened by the delivered line TS3's skill trusts, so the
turn loads once; a delta on each ordinary turn while Mirror Mode is on, so a follow-up
in another domain re-routes and signs; nothing when it is off. Then measure it live on
the installed Claude Code and Codex, which is what this User Story is for.

## Scope

1. **The hook calls the doorman.** In `ts/src/hooks/claude.ts`, `claudeInject` keeps
   its first line — CR143's runtime check, so a Grok-shaped payload returns before any
   load — and then runs, in-process through `runFrontDoor`,
   `mirror doorman --prompt <payload.prompt> [--session-id <payload.sessionId>]`,
   writing the result's stdout as the hook's own. The explicit-form detection, the
   `mirror load --context-only` calls, the state read, `needsInject`, the live-write
   handle, and `markInjected` all leave the hook: the doorman decides (explicit →
   full; active ordinary → delta; off → nothing), renders, writes the session by its
   id, pays the one embedding, and logs the scores — through the same front-door
   route the Pi extension will call (US5). The CR100 warning on a missing `session_id`
   stays (a misconfigured hook must be visible), but the doorman still runs: an
   explicit turn delivers unnamed, as the command does.
2. **The retired reader.** `needsInject` and `markInjected` are removed from
   `ts/src/hooks/mirrorState.ts`; `readMirrorState` stays for Antigravity (TS6).
   After this, nothing reads `runtime_sessions.hook_injected`. The column and the
   writes that still fill it (`doorman.ts`'s `hookInjected: true` on a full turn,
   `orchestration.ts`'s on activate/deactivate) are **not** touched here, deviating
   from TS2's note that US4 would retire the doorman's write: removing one writer
   while two remain and the column stays would be a half-measure. They go together,
   as one debt item with a named trigger, in Debt Review.
3. **What "Mirror Mode on" means to the doorman** (review finding, folded in). The
   doorman reads `runtime_sessions.mirror_active`, which only `mirror mirror
   deactivate` (`mm-new`) clears; `mirror build load` activates Builder Mode in the
   operating-mode lifecycle and leaves `mirror_active` set. Without a fix, a session
   that runs `/mm:mirror` and then `/mm:build` gets a delta on every Builder turn —
   an embedding, a snapshot, memories, and "answer as the mirror; sign ◇ …" on a turn
   that edits code — where today's hook injects once and goes quiet. So
   `readDoormanSessionState` in `ts/src/mirror/doorman.ts` reports the session active
   only when `mirror_active` is set **and** the active operating mode for that
   session (falling back to the global record, as `getActiveOperatingMode` already
   does) is `Mirror Mode`. A sharpening of DS8's "while Mirror Mode is on", not a
   policy change; one condition, one test in `doorman.test.ts`, one walk row.
   **Found by the first live walk (2026-10-25), folded in:** the read needs its
   matching write on every mode switch. `build load`, `explore`, and `soul` named
   their session from `MIRROR_SESSION_ID` alone, so on Claude Code the model's own
   `mirror build load` stamped Builder Mode on a *guessed* session (the most recently
   updated row — another runtime's) and the Claude session stayed in Mirror Mode:
   the Builder turn got a delta and signed `◇ engineer`. The four reads now use the
   mirror route's `environmentSessionId` (`MIRROR_SESSION_ID`, else
   `CLAUDE_CODE_SESSION_ID`, else `CODEX_SESSION_ID`) — the widening TS2 and this
   plan's Non-Goals had deferred, taken here because row 5 cannot pass without it.
   One test in `buildCli.test.ts` with a decoy row the guess would have picked.
4. **Tests first.** `ts/test/hooks/claudeInject.test.ts` (new) drives `claudeInject`
   with a payload against a scratch home and asserts, per the decision table: explicit
   form → stdout opens with the delivered line `full` and the session row is
   `mirror_active = 1` with a persona; active + another persona → the delta line
   naming it, the persona section, `S.persona` updated, one `llm_calls` embedding
   row (replay provider); not active → empty stdout and no snapshot in the live-write
   staging directory; Grok-shaped → empty and no database opened; no `session_id` +
   explicit → the warning on stderr and the full block on stdout.
   `ts/test/hooks/injectForms.test.ts`: every explicit spelling's output now opens
   with the delivered line; the "case 2 would mask case 1" note goes, since there is
   no case 2 — the second prompt in a session is a delta, which is what a reader
   should expect. `ts/test/hooks/hooks.test.ts`: the `needsInject` case goes.
5. **Live measurement**, by the Navigator, on the installed Claude Code and Codex
   (version, binary, date, and the home's database size recorded in
   `test-guide.md`), per DS8's route: explicit turn loads once (no `mirror mirror
   load` tool call in the turn; the reply signed); follow-up in another domain
   re-routes and signs; a later turn still signs (sticky voice beyond three turns); a
   mode switch to Builder in the same session ends the deltas; a fresh session's
   unprompted personal question is answered through the skill and the next turn is a
   doorman turn (its own row); logging (prompt and reply rows, the form stripped, the
   hook's block not logged as a message) and MCP (`mirror mcp`) without regression.
   Recorded beside the rows, by the Driver on the CLI with the same prompts: the
   delta's size in bytes and the memory ids repeated across turns (US5's threshold
   is set from these), the active-turn hook latency (`time mirror mirror doorman`),
   and the embedding timeout the hook process resolves against the hook's 30 s cap.
   **Both runtimes are walked before Done**; if Codex cannot be walked, the story
   stays open.
6. **Docs**: the hook's header comment rewritten; one worklog entry. The contract's
   injection section and the parity matrix are TS7's. Debt Review records
   `hook_injected` as one item: no reader, four writers (`doorman.ts` on a full turn,
   `writeMirrorState` on activate and deactivate, `persistStickyDefaults`);
   expand/contract — writers dropped in one commit, the column in a later migration;
   trigger: the next `runtime_sessions` migration.

## Non-Goals

- Do not implement sibling roadmap item: Antigravity through the one doorman.
- Do not implement sibling roadmap item: Written where a user reads it.
- Do not implement sibling roadmap item: Pi through the one doorman, at L4.
- Do not change the doorman's policy, rendering, or cost (TS2) beyond the one
  operating-mode condition in Scope 3 and its matching session write on the Builder,
  Explorer, and Soul routes; nor the memory threshold (US5), the wrappers,
  `hooks.json`, the plugin layout, or the hook's timeout.
- Do not drop `hook_injected` or its remaining writes; one debt item, together.
- Do not touch Grok Build: inert doorman, L3 row (CR143).

## Acceptance Behavior

```text
Given the inject hook receives a Claude Code or Codex payload with session_id S
  and a prompt opening with the explicit Mirror form
When the hook runs
Then its stdout is the doorman's full block, opened by the delivered line (full),
     and runtime_sessions S reads mirror_active = 1 with the routed persona
And the hook itself opened no database handle of its own

Given S is mirror_active with persona P, and the prompt is ordinary and scores
  persona Q above threshold
When the hook runs
Then its stdout is the delta: the delivered line naming Q, Q's section, the
     memories and attachments for the prompt, no identity layer
And S.persona = Q, and llm_calls holds one embedding row for the turn

Given S is not mirror_active and the prompt is ordinary
When the hook runs
Then its stdout is empty and no writable handle was opened

Given S is mirror_active but the session's active operating mode is Builder Mode
When the hook runs with an ordinary prompt
Then its stdout is empty: the doorman treats Mirror Mode as off

Given a Grok-shaped payload
When the hook runs
Then it returns before any load, as CR143 requires

Given a payload with no session_id and the explicit form
When the hook runs
Then the CR100 warning is on stderr and the full block is still on stdout

Given the installed Claude Code (and Codex), a fresh session, `/mm:mirror <question>`
When the turn runs
Then the model answers as the mirror, signs ◇ <persona>, and runs no
     `mirror mirror load` of its own
And a follow-up in another persona's domain is signed with that persona
And a later follow-up is still signed
And after `/mm:build <slug>` in the same session, an ordinary turn carries no
    mirror voice, no signature, and adds no llm_calls row
And in a fresh session, an unprompted personal question answered through the skill
    leaves the session mirror_active, and the next turn's hook delivers a delta
And out-of-scope sibling roadmap items remain untouched
```

## Validation Route

- Automated: `claudeInject.test.ts` red before the rewiring (the old hook prints the
  folder without the delivered line, and prints it again on the second prompt), green
  after; `injectForms.test.ts` through the real shell wrapper; `hooks.test.ts`,
  `doorman.test.ts`, the front-door suites; `cd ts && npm test`, `npm run typecheck`,
  `npm run lint`; `scripts/smoke_claude_plugin.sh` for the installed hooks and MCP.
- Navigator-visible, live (the rows with expected observation, pass and fail
  conditions are in `test-guide.md`), on the installed Claude Code and then Codex,
  with the session rows, ledger, and conversation log read with `sqlite3` between
  turns:
  1. fresh session, `/mm:mirror <personal question>`: the reply is the mirror's and
     signed; the transcript shows no `mirror mirror load` tool call; the session row is
     `mirror_active = 1` with a persona;
  2. a follow-up in another persona's domain: signed `◇ <other persona>`; the row's
     persona moved (re-read a second later: not reverted); `llm_calls` +1 embedding;
  3. a same-domain follow-up and a later one: persona stable, still signed;
  4. `/mm:build mirror`, then an ordinary Builder prompt: no mirror voice, no
     signature, no new `llm_calls` row;
  5. fresh session, an unprompted personal question (no form): the model invokes the
     skill, `mirror mirror load` runs once, the row is `mirror_active = 1`;
  6. the next prompt in that session is a doorman turn (row 2's observations), read
     with its own `sqlite3` pass — TS1's mechanism proven end to end on a live binary;
  7. the conversation log holds the prompts (form stripped) and the replies, and the
     hook's block is not among the messages; `mirror mcp` answers as before.
  Beside the rows: delta bytes and repeated memory ids (CLI), hook latency, embedding
  timeout, home size.
- E2E decision: required and live — this story exists to measure. Codex is run for
  the same three turns; where a Codex observation differs, it is recorded, not
  smoothed over.

E2E decision: required unless Navigator explicitly accepts a narrower fixture-level validation route

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV9.DS8.US4`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
