[< Parent](../index.md)

# CV9.DS8.US4 — Claude Code and Codex through the one doorman

**Status:** ✅ Done — 2026-10-25
**Type:** User Story
**Delivery Story:** CV9.DS8 — One Doorman: Mirror's Context Before the Model on Every Runtime

---

## User Story

In order to have Mirror's context put before the model by the runtime, once on an
explicit turn and freshly on every ordinary turn while Mirror Mode is on,
As a person using Mirror Mind on Claude Code or Codex,
I want the Claude-family inject hook to call the one doorman instead of carrying a
policy of its own — so an explicit Mirror turn loads the folder once, a follow-up in
another domain re-routes its persona and signs it, and an unprompted personal
question the model answers as the mirror is followed by doorman turns,
So that the mirror keeps its voice and its signature across a conversation on the
two runtimes the hooks serve, measured live on the installed binaries.

## Outcome

- `claudeInject` (`ts/src/hooks/claude.ts`) no longer decides anything. After the
  runtime check CR143 added (a Grok-shaped payload returns before any load), it runs
  `mirror doorman --prompt <the turn's prompt> --session-id <the hook's session_id>`
  in-process through `runFrontDoor` and writes what comes back to stdout — the block
  the runtime hands the model as context, or nothing. The decision, the rendering,
  the session writes, the one embedding per delta turn, and the memory-score log
  are the doorman's (TS2), reached through the same front-door route the Pi
  extension will use (US5).
- The hook's two cases are retired with their reader: `needsInject` and
  `markInjected` leave `mirrorState.ts`; `readMirrorState` stays for Antigravity's
  `PreInvocation` (TS6). Nothing reads `runtime_sessions.hook_injected` any more;
  the column and the writes that still fill it (`doorman.ts`, `orchestration.ts`)
  are carried as one debt item, to be dropped together in a `runtime_sessions`
  cleanup, not one by one here.
- The doorman treats a session as in Mirror Mode only when `mirror_active` is set
  **and** the session's active operating mode (falling back to the global record) is
  `Mirror Mode`: a `/mm:build` switch in the same session ends the deltas, where
  `mirror_active` alone — which only `mm-new` clears — would have put "answer as the
  mirror" on every Builder turn (review finding; a sharpening of DS8's "while Mirror
  Mode is on").
- On the explicit form, the block opens with
  `=== mirror context delivered by the runtime for this turn: full — … sign ◇ <persona> ===`;
  the `mm-mirror` skill (TS3) reads that line and does not load again. On an ordinary
  turn with Mirror Mode on, the block is the delta (the delivered line, a newly routed
  persona's section, the relevant memories and attachments). Off, nothing: a read
  and no writable handle, as today.
- A session the model activated itself — an unprompted personal question answered
  through the skill's `mirror mirror load`, which names its session from
  `CLAUDE_CODE_SESSION_ID` or `CODEX_SESSION_ID` (TS1, TS2) — is `mirror_active` by
  the hook's own id, so the doorman takes the next turn.
- Measured live on the installed Claude Code and Codex (version, binary, date in the
  test guide): the explicit turn loads once; a follow-up in another domain re-routes
  and signs `◇ <persona>`; an unprompted personal question is followed by doorman
  turns; a later turn still signs; a Builder switch ends the deltas; the prompt and
  Stop hooks still log the conversation with the explicit form stripped and without
  the hook's block, and `mirror mcp` still answers. Beside the measurement: delta
  bytes and repeated memory ids (for US5's threshold), hook latency, the embedding
  timeout against the 30 s cap, and the home's size.
- Not in this story: the Pi extension (US5), Antigravity (TS6), the contract's
  injection section and the parity matrix (TS7), the memory threshold (US5 sets it
  from the scores TS2 logs), and the wrappers, `hooks.json`, and the plugin layout,
  which do not change — the hook keeps its name, its event, and its 30 s timeout.

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
Then the warning CR100 kept is written to stderr, and the full block is still
     delivered, unnamed, as `mirror doorman` does without --session-id

Given the installed Claude Code (and Codex), a fresh session, `/mm:mirror <question>`
When the turn runs
Then the model answers as the mirror, signs ◇ <persona>, and runs no
     `mirror mirror load` of its own
And a follow-up in another persona's domain is signed with that persona
And a later follow-up is still signed
And after `/mm:build <slug>` in the same session, an ordinary turn carries no
    mirror voice and adds no llm_calls row
And in a fresh session, an unprompted personal question answered through the skill
    leaves the session mirror_active, and the next turn's hook delivers a delta
```

## Scope

- `ts/src/hooks/claude.ts`: `claudeInject` rewired to `mirror doorman`; the header
  comment rewritten for what the hook now is.
- `ts/src/hooks/mirrorState.ts`: `needsInject` and `markInjected` removed.
- `ts/src/mirror/doorman.ts`: `readDoormanSessionState` consults the operating mode;
  one test in `doorman.test.ts`. Its matching write: `mirror load` stamps the named
  session's mode, and the Builder, Explorer, and Soul routes name their session from
  `CLAUDE_CODE_SESSION_ID` / `CODEX_SESSION_ID` as the mirror route does (found by
  the first live walk, where `build load` had stamped a guessed session).
- Tests first: `ts/test/hooks/claudeInject.test.ts` (new) for the decision table as
  seen from the hook, against a scratch home; `ts/test/hooks/injectForms.test.ts`
  asserts the delivered line on every explicit spelling and drops its "case 2 would
  mask case 1" note; `ts/test/hooks/hooks.test.ts` drops the `needsInject` case.
- `docs/process/worklog.md`: one entry. The test guide carries the live
  measurement with version, binary, and date.

## Out Of Scope

- US5, TS6, TS7; the memory threshold's value.
- Dropping `hook_injected` or its remaining writes (one debt item, see Outcome).
- Any change to the doorman's policy, rendering, or cost beyond the operating-mode
  condition above; to the wrappers,
  `hooks.json`, the plugin layout, or the hook's timeout.
- Grok Build: its row stays L3, its doorman inert (CR143).

## Validation

Automated: the new hook test, the inject-forms suite through the shell wrapper, and
the existing hooks, doorman, and front-door suites green; `smoke_claude_plugin.sh`
for the installed hooks and MCP. Navigator: the live walk on the installed Claude
Code and Codex (`test-guide.md`): explicit turn, domain change, unprompted question,
each read against the transcript, `runtime_sessions`, `llm_calls`, and the
conversation log.
