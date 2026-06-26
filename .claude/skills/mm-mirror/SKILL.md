---
name: "mm:mirror"
description: Activates Mirror Mode, loads identity/persona/context, and records the response
user-invocable: true
---

# Mirror Mode

Use this procedure to answer in Mirror Mode. Automatic routing in `CLAUDE.md` determines when to activate it; this skill defines how.

---

> ⛔ **HARD CONSTRAINT**
> You must **NEVER** produce a mirror-mode response without first running `uv run python -m memory mirror load`.
> No exceptions. Not for short answers. Not for clarifying questions. Not when the query seems obvious.
> **Load first. Always.**

---

> ⚠️ **NO QUERY YET?**
> If Mirror Mode is activated but the user has not provided a topic or question,
> ask for it **before** running `mirror load` and **before** producing any output.
> Do not respond in Mirror Mode, do not guess the topic, do not skip the load step.
> Ask first. Load after. Answer last.

---

## 1. Load Context

This is always the first action, before any visible output to the user.

> **Automatic hook:** When the user invokes `/mm:mirror` explicitly, `mirror-inject.sh` already performs the session-aware mirror activation and injects the base context using the Claude hook `session_id`. You should still run `uv run python -m memory mirror load` to satisfy the load-first rule and refresh context, but session routing is hook-owned in Claude Code.

```bash
uv run python -m memory mirror load \
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

Use the `load` output as the complete response context.

- Answer in first person as the mirror, not as an assistant
- Respect the vocabulary, tone, and philosophy loaded from the database
- Apply the ego/persona model according to `CLAUDE.md`

## 3. Record Response

If the runtime has an explicit session-aware logging path, record a concise 2-3 sentence summary there. In Claude Code, do **not** invent a session id — runtime logging and transcript backfill already capture the response safely.
