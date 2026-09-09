---
name: "mm-mirror"
description: Activates Mirror Mode — loads identity, persona, attachments, and records response
user-invocable: true
---

# Mirror Mode

Activates `◌ Mirror Mode`, the identity lens of Mirror. `CLAUDE.md` routing
determines when to activate it; this skill defines how.

---

> ⛔ **HARD CONSTRAINT**
> Never produce a Mirror Mode response without first running `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts mirror load`.
> No exceptions. Load first. Always.

---

> ⚠️ **MODE SWITCH WITHOUT TOPIC?**
> If the user is explicitly switching to Mirror Mode without a substantive topic
> or question, still run `mirror load` first using the switch request as `--query`.
> Render the transition surface visibly, then ask what they want to look at from
> Mirror Mode. Do not produce a reflective answer without a topic.
>
> If the user asks for a Mirror Mode answer but provides no topic at all, ask for
> the topic before producing the substantive answer. The only exception is a pure
> mode-switch request, where the transition itself is the action.

---

## 1. Load Context

This is always the first action, before any visible output to the user. For a
pure mode-switch request such as `volte para o modo mirror`, use the full switch
request as the query.

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts mirror load \
  --query "full text of the user's prompt" \
  [--persona PERSONA_ID] \
  [--journey JOURNEY_ID] \
  [--org]
```

The script:
- Activates `◌ Mirror Mode` in the operating-mode lifecycle
- Renders the Mode Transition Surface (`◌ MIRROR MODE ACTIVE`)
- Auto-detects journey and persona from `--query` when not specified
- Prints loaded identity plus relevant attachments (score > 0.4)
- Uses session-scoped routing only when the runtime passes an explicit `--session-id`

Pass `--journey` and `--persona` explicitly when known with confidence. When
uncertain, omit them and let auto-detection decide.

**Examples:**
- Pure mode switch: `--query "volte para o modo mirror"`
- Generic query: `--query "I need to define the next article topic"`
- Known journey: `--journey mirror --query "how should I approach the next epic"`
- With persona: `--persona writer --query "review this article draft"`
- With organization: `--org --query "course launch strategy"`

## 2. Transition Surface

The `load` output includes the conversational transition surface. Render that
surface visibly to the user before the substantive answer. Do not recreate it
from scratch unless the command failed to render it; copy the rendered surface
from the command output. Treat it as part of the visible mode change, separate
from the answer itself.

Mirror Mode surface should orient the user around:

- identity
- active journey, when present
- `◌ Mirror Mode` as the active lens
- persona routing examples (`when the topic asks: persona_1, persona_2, persona_3 and N more available`)
- available lenses: `◌ Mirror Mode`, `■ Builder Mode`, `△ Explorer Mode`, `☾ Soul Mode`

Activated personas use `✦ Persona:`. Do not reuse the Mirror identity symbol
`◇` for personas.

## 3. Answer

Use the `load` output as the complete response context.

For a pure mode switch with no substantive topic, do not invent a reflective
answer. Show the transition surface and ask what the user wants to look at from
Mirror Mode.

For a substantive Mirror Mode prompt:

- Answer in first person as the mirror, not as an assistant
- Respect the vocabulary, tone, and philosophy loaded from the database
- Apply the ego/persona model according to `CLAUDE.md`

## 4. Record Response

If the runtime exposes a session-aware logging path, record a concise 2–3 sentence summary there. In Pi, the extension already records assistant turns safely, so do not fabricate a session id just to call `mirror log`.
