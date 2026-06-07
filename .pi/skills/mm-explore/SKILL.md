---
name: "mm-explore"
description: Activates Explorer Mode for a journey and loads exploratory context
user-invocable: true
---

# Explorer Mode

Activates Explorer Mode for a specific journey. Explorer Mode is a Mirror-native
lens for uncertainty before construction.

Explorer Mode is experimental right now. The full Explorer experience is being
built and will be available soon.

## Usage

Pi and Gemini CLI:

```text
/mm-explore <journey-slug>
```

Codex:

```text
$mm-explore <journey-slug>
```

Claude Code:

```text
/mm:explore <journey-slug>
```

Natural-language equivalents should be treated as the product interface:

```text
entrar em modo explorador nesta jornada
abrir exploração em <journey-slug>
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
- prints Explorer Mode guidance, including the experimental availability note.

## 1.1 Required Surface Rendering

The `explore load` output includes the conversational transition surface. Render
that surface visibly to the user before continuing with exploratory work. Do not
recreate it from scratch unless the command failed to render it; copy the
rendered surface from the command output.

After any `uv run python -m memory explore story ...` command that returns a
Mirror surface, paste the returned surface verbatim as the first visible block in
the response. Do not summarize, interpret, or paraphrase before rendering it.

For `story open`, `story thicken`, `story snapshot`, `story attractors`, `story
experiment`, and `story handoff`, the returned `△ ...` surface is the primary
response. Render it before commentary. Commentary may follow only after the
surface is visible.

## 2. Work In Explorer Mode

Explorer Mode is experimental. The full Explorer experience is being built and
will be available soon.

Explorer preserves uncertainty. Builder executes commitment.

While Explorer Mode is active:

- Treat new substantive material as part of the current Exploratory Story unless the user asks for a clear operational action.
- Preserve tensions, hypotheses, corrections, and emerging story shape.
- When an Exploratory Story begins, open it with:

```bash
uv run python -m memory explore story open <slug> --story "..." --summary "..." --last-card "..."
```

- When material changes the accumulated story, thicken it with:

```bash
uv run python -m memory explore story thicken <slug> --story "..." --summary "..." --last-card "..." --changed "..."
```

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

- Render the story surface returned by those commands visibly to the user.
- Do not promote to Builder or Delivery without explicit user confirmation.

## 3. Deactivation

The user should use natural language:

```text
sair do modo explorador
voltar ao modo normal
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
promover essa exploração para construção
promover para builder
isso já está pronto para virar Builder?
```

Do not switch to Builder silently. First produce a transfer document set and
render the handoff proposal:

```bash
uv run python -m memory explore story handoff <slug> --title "..." --summary "..."
```

Render `△ BUILDER HANDOFF PROPOSED` visibly, including the generated document
paths under `docs/project/explorations/<es-id>/` when available:

```text
exploratory-story.md
handoff-info.md
product-design-proposal.md
```

Ask for explicit confirmation. Only after the user confirms should Mirror call:

```bash
uv run python -m memory explore story promote <slug>
```

Promotion activates Builder Mode through the normal Builder load path. If the
user does not confirm, remain in Explorer Mode and continue thickening the story.
