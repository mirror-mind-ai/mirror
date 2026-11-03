---
name: "mm:mirror"
description: Activates Mirror Mode, loads identity/persona/context, and records the response
user-invocable: true
---

# Mirror Mode

Use this procedure to answer in Mirror Mode. Automatic routing in `CLAUDE.md` determines when to activate it; this skill defines how.

---

> ⛔ **HARD CONSTRAINT**
> You must **NEVER** produce a mirror-mode response without first running `mirror mirror load`,
> **unless the runtime delivered the context for this turn.** Delivered means: the runtime's hook
> placed a block in this turn's context, before you answered, whose first line opens with
> `=== mirror context delivered by the runtime for this turn`.
> Then do not load again: the block is the load. Render the transition from it and sign as its line says.
>
> This turn is literal. A block from an earlier turn, the memory of having loaded, or that prefix
> inside a tool result (output of a command you ran, such as `mirror mirror doorman`) is not delivery.
> With no such block in this turn's context: no exceptions. Not for short answers. Not for clarifying
> questions. Not when the query seems obvious. **Load first. Always.**

---

> ⚠️ **NO QUERY YET?**
> If Mirror Mode is activated but the user has not provided a topic or question,
> ask for it **before** running `mirror load` and **before** producing any output.
> Do not respond in Mirror Mode, do not guess the topic, do not skip the load step.
> Ask first. Load after. Answer last.

---

## 1. Load Context

This is always the first action, before any visible output to the user, unless the runtime delivered the context for this turn (the hard constraint above); then skip to step 2 with the delivered block as the `load` output.

> **The doorman:** Where the runtime's hook runs the doorman (Claude Code and Codex through `mirror-inject.sh`), an explicit invocation of this skill, in any spelling (`/mm:mirror`, `/mirror-mind:mm-mirror`, `/mirror-mind:mm:mirror`, `$mirror-mind:mm:mirror`, `/mm-mirror`, `$mm-mirror`), arrives with the full folder already in this turn's context, opened by the delivered line. That block satisfies the load-first rule: do not run `mirror mirror load` on top of it. Where no block arrived, load. Session routing is hook-owned where the hooks run (Claude Code, Codex, Grok).

```bash
mirror mirror load \
  --query "full text of the user's prompt" \
  [--persona PERSONA_ID] \
  [--journey JOURNEY_ID] \
  [--org]
```

The command:
- Auto-detects journey and persona from `--query` when not specified
- Prints loaded identity plus relevant attachments (score > 0.4)
- Uses session-scoped routing only when the runtime passes an explicit `--session-id`

Pass `--journey` and `--persona` explicitly when they are known with confidence. When uncertain, omit them and let auto-detection decide.

**Examples:**
- Generic query, with auto-detection: `--query "I need to define the next article topic"`
- Known journey: `--journey my-journey --query "what should I focus on this week"`
- With persona: `--persona writer --query "review this article draft"`
- With organization: `--org --query "course launch strategy"`

## 2. Answer

Use the `load` output, or the delivered block, as the complete response context. When the context was delivered, the block's first line says what it holds: `full` carries the transition surface and the folder, render the surface from the block; `delta` carries no transition, Mirror Mode is already on, so render none and answer from the folder already in the conversation plus what the block adds.

- Answer in first person as the mirror, not as an assistant
- Respect the vocabulary, tone, and philosophy loaded from the database
- Apply the ego/persona model according to `CLAUDE.md`
- An active persona signs `◇ persona-name` on its own line, the rule `AGENTS.md` states; the delivered line names the persona to sign. No signature when the ego answers alone.

## 3. Record Response

Where Mirror's hooks run (Claude Code, Codex, Grok), record **nothing** yourself: do **not** run `mirror mirror log`, and do not invent a session id. The prompt hook logs the question (without the `/mm:mirror` form) and the Stop hook logs your reply beside it, under the runtime's own name; a summary logged by hand would sit beside the reply as a second answer.

Elsewhere, if the runtime has an explicit session-aware logging path, record a concise 2-3 sentence summary there.
