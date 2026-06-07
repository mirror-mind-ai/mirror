[< Story](index.md)

# Test Guide — CV16.DS7 Promotion Handoff to Builder

## Automated Verification

```bash
uv run pytest \
  tests/unit/memory/services/test_explorer_story.py \
  tests/unit/memory/surfaces/test_explorer_story.py \
  tests/unit/memory/cli/test_explore.py
```

Expected: all tests pass.

Lint:

```bash
uv run ruff check \
  src/memory/services/explorer_story.py \
  src/memory/surfaces/explorer_story.py \
  src/memory/cli/explore.py \
  tests/unit/memory/services/test_explorer_story.py \
  tests/unit/memory/surfaces/test_explorer_story.py \
  tests/unit/memory/cli/test_explore.py
```

Expected: all checks pass.

## Technical Smoke for Driver

The Driver may run contained CLI smoke tests after implementation, but these are not the Navigator's manual validation.

Candidate smoke:

```bash
uv run python -m memory explore story handoff explorer-mode \
  --title "Build Explorer persistence" \
  --summary "The exploration clarified the next Builder boundary."
uv run python -m memory mode status
```

Expected: output includes `△ BUILDER HANDOFF PROPOSED` and mode remains Explorer.

Then:

```bash
uv run python -m memory explore story promote explorer-mode
uv run python -m memory mode status
```

Expected: output includes `■ BUILDER MODE ACTIVE` and mode becomes Builder.

## User Validation in Pi

The Navigator validates DS7 as a user in Pi, without running internal commands.

Activate Explorer Mode:

```text
/mm-explore explorer-mode
```

Create or reuse an Exploratory Story with attractor and experiment proposal.

Ask for promotion:

```text
isso já está pronto para virar Builder?
```

Expected:

- assistant renders `△ BUILDER HANDOFF PROPOSED` as the first visible block before interpretation;
- handoff includes story, attractor, and experiment proposal when available;
- assistant asks for explicit confirmation;
- footer/status remains on `△ Explorer Mode`.

Withhold confirmation:

```text
ainda não, vamos continuar explorando
```

Expected:

- active mode remains Explorer;
- the story can still be thickened.

Confirm promotion:

```text
sim, promover para Builder
```

Expected:

- assistant activates Builder Mode;
- response renders `■ BUILDER MODE ACTIVE`;
- footer/status changes to Builder Mode for `explorer-mode`;
- Builder receives normal project context.

Cleanup if this was only validation:

```text
/mm-discard
```

## Pass Condition

Explorer can propose a Builder handoff from the current story, attractor, and experiment proposal, but only activates Builder after explicit user confirmation.
