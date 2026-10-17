[< CV21.DS4 Codex Through The Canonical Plugin](../index.md)

# CV21.DS4.TS3 — Codex's `$`-skill turns follow the slash-command rule

**Status:** 🟡 Planned
**Type:** Technical Story
**Delivery Story:** CV21.DS4 — Codex Through The Canonical Plugin

---

## Technical Story

In order to log the same thing for the same action on every runtime,
as the Driver of the shared plugin hooks,
I want a prompt that opens with a skill invocation in Codex's `$` sigil treated as the
same `/` invocation is treated on Claude Code and Grok — a command turn, with the
Mirror form the one exception — so that a Codex `$mm-journeys` and its reply are not
recorded as a conversation while `/mirror-mind:mm:journeys` is not.

## Outcome

One predicate, `isCommandTurn`, decides for every runtime: a prompt opening with `/`,
or with `$` followed by a skill name (`$mm-journeys`, `$mirror-mind:mm:build mirror`),
is a command turn — skipped, its turn recorded so the Stop hook skips the reply. A `$`
that is not a skill name (`$5 a month`, `$HOME`) stays conversation. The Mirror form
keeps its exception in both sigils: the question after it is the conversation turn.
The decision and its counter-case are recorded.

## Acceptance Behavior

```text
Given a session labelled codex
When the prompt hook receives "$mirror-mind:mm:journeys" and then the Stop hook its reply
Then neither is logged, both skips are command_turn, and hooks.log gains no line

Given a session labelled codex
When the prompt hook receives "$mm-mirror what matters today"
Then "what matters today" is logged as the conversation turn, as today

Given a session labelled claude_code
When the prompt hook receives "$5 a month seems fine"
Then the prompt is logged as a conversation turn

Given any session
When the prompt hook receives a prompt opening with "/"
Then it is skipped as a command turn, as today
```

## Scope

- `conversation/commandTurn.ts` (new): the predicate and its grammar.
- `logger.ts`: `handleUserPromptHook` uses it; the skip reason is `command_turn` for
  both sigils. `hooks/gemini.ts` uses it too, so the rule has one home for every hook
  in our process; the Pi extension keeps its copy.
- Tests first; the runtime-interface spec's User Prompt rule; a decision; the story
  `route.sh`.

## Out Of Scope

- The inject hook (already Mirror-only, US7); the Pi extension's copy of the `/` rule
  (a separate process); logging any skill turn's reply (US8 decided).
- The real Codex (US4), TS5, TS6.

## Validation

Automated: the suite. Navigator: `bash route.sh static` — the real wrappers and this
tree's entry: a `codex` `$`-skill turn and its reply log nothing; a `$mm-mirror`
turn logs its question; a `claude_code` `$5 …` prompt is logged. Details in
[plan.md](plan.md) and [test-guide.md](test-guide.md).
