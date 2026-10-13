[< CV21.DS2 Mirror Plugin & MCP Foundation](../index.md)

# CV21.DS2.US8 — Every runtime's session is logged under its own name, replies included

**Status:** ✅ Done
**Type:** User Story
**Delivery Story:** CV21.DS2 — Mirror Plugin & MCP Foundation

---

## User Story

As a person whose Mirror runs on Claude Code, Codex, or Grok through the plugin,
I want my conversations recorded under the runtime I had them in, with the model's
replies beside my questions,
So that memory extraction sees whole turns, and a conversation list tells me where
each one happened.

## Outcome

The shared hooks know which runtime they are in and label the session `claude_code`,
`codex`, or `grok_build`. A new Stop hook logs the turn's final answer beside its
prompt, paired by the runtime's turn id. A Mirror turn is logged as its question,
without the form. The reply to a command turn is not recorded, a repeat Stop adds
nothing, and the hook prints nothing and exits 0 whatever happens.

## Acceptance Behavior

```text
Given a session on Claude Code, Codex, or Grok with the plugin
When the user sends a Mirror turn, then an ordinary prompt, and the model answers each
Then the conversation and its runtime session carry claude_code, codex, or grok_build
And the conversation holds the Mirror question without its form, its answer, the
  prompt, and its reply, in that order, once each, each reply carrying its prompt's
  turn id

Given a command turn, a repeat Stop, or Grok's session-end Stop
When the Stop hook receives it
Then nothing is logged, and the skip is one hooks.log line without the text

Given any Stop payload
When the hook runs
Then it prints nothing and exits 0
```

## Scope

- `ts/src/hooks/runtimeDetection.ts`: the runtime from the payload and the environment.
- `ts/src/conversation/hookPayload.ts`: one reader for the payload fields in both
  spellings; `ts/src/hooks/payload.ts` reads through it.
- `ts/src/conversation/logger.ts`: the label stamped on every prompt; the Mirror turn
  logged without its form; the turn id in `messages.metadata`; `handleStopHook`.
- `ts/src/conversation/loggerCli.ts` and `ts/src/frontDoor/routing.ts`: `user-prompt
  --interface`, and the `stop` subcommand.
- `ts/src/frontDoor/stdinSource.ts`: the one-shot handoff of a payload the entry already
  read, so fd 0 is read once.
- `ts/src/hooks/claude.ts`: `claudeUserPrompt` detects and hands the payload over;
  `claudeStop` logs the reply and counts a skip.
- The `claude:stop` wrapper pair, generated: `.claude/hooks/log-assistant-reply.sh` and
  `plugins/mirror-mind/hooks/log-assistant-reply.sh`, registered on `Stop` with `async`
  in both files.
- The `mm-mirror` Claude skill's step 3, the runtime-interface spec, and a decision
  record.

## Out Of Scope

- Codex's SessionEnd never reaching Mirror (DS12.TS2 L8): DS4's, or a Change Request.
- Whether a `$`-skill turn on Codex, other than a Mirror form, is skipped like a `/`
  turn: noted for DS4; today it is logged, as before.
- Grok's 1.5-second bound on a SessionEnd hook without its own `timeout`: DS10's.

## The Reply Rule

A reply is logged when it answers a logged prompt:

- **by turn id**, when the payload carries one (`prompt_id` on Claude Code, `turn_id`
  on Codex, `promptId` on Grok) and a logged prompt carries the same, unless that
  prompt was already answered (a repeat Stop);
- **else by position**, when the conversation's last message is a logged prompt,
  unless both sides carry a turn id and they differ, which means this turn's prompt was
  a command and an older prompt is waiting because its own Stop was lost.

The hook never creates a conversation. An empty message (an interrupted or tool-only
turn), a subagent's Stop, mute, and the discard marker all log nothing. Grok's clip
marker (`… [+N chars]`) is stored as received. When another Stop hook keeps the agent
working, the first answer stands and the continuation's is not recorded: a known
limitation, accepted.

## Evidence

| # | Finding | How it was measured | Result |
|---|---------|---------------------|--------|
| 1 | Detection separates the three runtimes on DS12's recorded marks, Grok's first | `node --test ts/test/hooks/runtimeDetection.test.ts` | ✓ 7 pass |
| 2 | The label, the Mirror turn, the turn id, and every branch of the reply rule | `node --test ts/test/conversation/replyLogging.test.ts` | ✓ 18 pass |
| 3 | The scripted journey through the real wrappers, on the Claude Code, Codex, and Grok shapes: four rows, both labels, the skips counted and never quoted, nothing printed | `node --test ts/test/hooks/journey.test.ts` | ✓ 4 pass, the backfill case included |
| 4 | Claude Code's SessionEnd backfill does not double a Stop-logged reply, and closes the conversation | the same | ✓ |
| 5 | The registrations still validate on both runtimes with the Stop handler added | `claude plugin validate`, `grok plugin validate` | ✓ no warnings; passes |
| 6 | The whole suite | `npm test` | ✓ 3149 pass, 0 fail |

## Validation

`bash route.sh static` runs the scripted journey against the plugin's wrappers, copied
out of the tree, and the live sessions prove the labels and the pairs inside each
runtime (test guide).
