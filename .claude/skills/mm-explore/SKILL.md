---
name: "mm:explore"
description: Activates Explorer Mode for a journey and loads exploratory context
user-invocable: true
---

# Explorer Mode

Activates Explorer Mode for a specific journey. Explorer Mode is a Mirror-native
lens for uncertainty before construction.

Explorer Mode is active and supports durable exploration, story thickening,
attractors, experiment proposals, and Builder handoff.

## Usage

```text
/mm:explore <journey-slug>
```

Natural-language equivalents should be treated as the product interface:

```text
enter explorer mode for this journey
open exploration for <journey-slug>
```

## 1. Activate Explorer Mode

```bash
uv run python -m memory explore load <slug>
```

The command:

- activates `△ Explorer Mode` for the journey;
- renders the Mode Transition Surface (`△ EXPLORER MODE ACTIVE`);
- sets the journey as sticky context;
- loads Mirror identity and journey context;
- resumes the active durable Exploratory Story when one exists;
- renders `△ EXPLORATORY STORY RESUMED` when resuming;
- prints Explorer Mode guidance with the active Explorer capability boundary.

## 1.1 Required Surface Rendering

The `explore load` output includes the conversational transition surface. Render
that surface visibly to the user before continuing with exploratory work. Do not
recreate it from scratch unless the command failed to render it; copy the
rendered surface from the command output.

After any `uv run python -m memory explore story ...` command that returns a
Mirror surface, paste the returned surface as the first visible block in the
response. Do not summarize, interpret, or paraphrase before rendering it.

Some Explorer story commands wrap required product surfaces with machine-readable
contract markers:

```text
[[MIRROR_REQUIRED_SURFACE_BEGIN:<surface-id>]]
...
[[MIRROR_REQUIRED_SURFACE_END:<surface-id>]]
```

When markers are present, render the marked `Mirror` surface content first and do
not render the marker lines themselves. The markers are a runtime contract, not
user-facing product copy.

For `story open`, `story thicken`, `story snapshot`, `story attractors`, `story
experiment`, `story list`, `story archive`, and `story handoff`, the returned
`△ ...` surface is the primary response. Render it before commentary. Commentary
may follow only after the surface is visible.

## 2. Work In Explorer Mode

Explorer Mode is active and supports durable exploration, story thickening,
attractors, experiment proposals, and Builder handoff.

Explorer preserves uncertainty. Builder executes commitment.

While Explorer Mode is active:

- Treat new substantive material as part of the current Exploratory Story unless the user asks for a clear operational action.
- Preserve tensions, hypotheses, corrections, and emerging story shape.
- When an Exploratory Story begins, open it with:

```bash
uv run python -m memory explore story open <slug> --story "..." --summary "..." --last-card "..."
```

- Before calling `story thicken`, classify the change as either `narrative/substantive` or `local/refinement`.

- When material substantively changes the accumulated Exploratory Story, thicken it with:

```bash
uv run python -m memory explore story thicken <slug> --story "..." --summary "..." --last-card "..." --changed "..."
```

Use `story thicken` for:

- new or changed attractor;
- new or changed exploratory hypothesis;
- new or changed ritual, voice, scope, or product concept;
- changed experiment or promotion boundary;
- meaningful correction to the narrative arc.

Do not use `story thicken` for local refinements:

- icon choice;
- microcopy;
- wording polish;
- visual label changes;
- surface formatting;
- small naming adjustments that do not change the story;
- conversational elaboration of an already captured idea.

For local refinements, continue the conversation without updating the story. If uncertain, ask the user whether to preserve the change in the Exploratory Story.

- When the user asks for the attractor, or when a strong directional pull should be proposed visibly, render attractors with:

```bash
uv run python -m memory explore story attractors <slug> --attractor "..." --description "..." --status proposed
```

- When the user corrects an attractor, replace it with the corrected attractor using the same command. Do not accumulate hidden competing interpretations.
- When the user asks what small experiment tests the attractor, render an experiment proposal with:

```bash
uv run python -m memory explore story experiment <slug> --title "..." --description "..." --status proposed
```

- When the user asks what is currently being explored, render a snapshot with:

```bash
uv run python -m memory explore story snapshot <slug>
```

- When the user asks to see explorations for the active journey, render durable story visibility with:

```bash
uv run python -m memory explore story list <slug>
```

- When the user asks to archive or close the active exploration without promoting it, archive the active story with:

```bash
uv run python -m memory explore story archive <slug>
```

- Render the story surface returned by those commands visibly to the user.
- Do not promote to Builder or Delivery without explicit user confirmation.

## 2.1 Operational Boundary

Explorer Mode must not directly execute clear operational mutation requests.
When the user asks to edit files, apply a procedure to documents, create code,
run implementation commands, mutate roadmap/docs/code, or otherwise change
project state, do not call Explorer story commands and do not mutate files.

Instead, name the boundary visibly and ask whether to switch to Builder Mode for
the same journey. Use this response shape:

```text
△ EXPLORER → BUILDER BOUNDARY

This is operational Builder work, not exploratory thickening. Explorer preserves uncertainty; Builder executes commitment. I can switch to Builder Mode for <slug> and do this there.
```

Only after the user confirms the switch should Mirror activate Builder Mode with:

```bash
uv run python -m memory build load <slug>
```

Local refinements to the exploration itself, such as microcopy discussion,
labels, wording, icons, or formatting, remain conversational unless the user
explicitly asks to preserve them in the Exploratory Story.

## 3. Deactivation

The user should use natural language:

```text
exit explorer mode
return to normal mode
```

Mirror should then call the contained Explorer operation:

```bash
uv run python -m memory explore deactivate
```

Render the deactivation confirmation visibly to the user. Deactivation leaves the
explicit Explorer lens and returns to Mirror Mode when journey context remains
active. It does not clear sticky journey context or promote the exploration to
Builder. Rendering and clearing the status bar are internal effects, not
user-facing operations.

## 4. Promotion Boundary

When the user says:

```text
promote this exploration to construction
promote to builder
is this ready to become Builder?
```

Do not switch to Builder silently. First produce a transfer document set and
render the handoff proposal. If the user asks to include source conversations,
confirm which conversations should be included before adding raw source evidence.
When the user names the current or recent conversation rather than an id, inspect
recent journey conversations with `uv run python -m memory conversations --journey
<slug> --limit 5`, show the candidate source evidence, and ask for confirmation.
Use `--source-conversation <conversation-id>` for reviewed source evidence. Use
`--include-full-conversation` only after explicit confirmation that raw
conversation evidence should be written with privacy obfuscation.

```bash
uv run python -m memory explore story handoff <slug> --title "..." --summary "..." --editorial-synthesis "..." --source-conversation "<conversation-id>:origin conversation" --include-full-conversation
```

Render `△ BUILDER HANDOFF PROPOSED` visibly, including the generated document
paths under `docs/project/explorations/<exploratory-story-slug>/` when available:

```text
index.md
exploratory-story.md
handoff-info.md
product-design-proposal.md
full-conversation.md        # only after explicit confirmation
```

Ask for explicit confirmation. Only after the user confirms should Mirror call:

```bash
uv run python -m memory explore story promote <slug>
```

Promotion activates Builder Mode through the normal Builder load path. If the
user does not confirm, remain in Explorer Mode and continue thickening the story.
