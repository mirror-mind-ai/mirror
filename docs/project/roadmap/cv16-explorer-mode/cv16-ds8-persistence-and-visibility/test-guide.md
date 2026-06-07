[< Story](index.md)

# Test Guide — CV16.DS8 Persistence and Visibility

## Automated Verification

Commands will be finalized during implementation. Expected coverage:

```bash
uv run pytest \
  tests/unit/memory/services/test_explorer_story_persistence.py \
  tests/unit/memory/services/test_explorer_handoff.py \
  tests/unit/memory/cli/test_explore.py
```

Expected: all tests pass.

Lint:

```bash
uv run ruff check \
  src/memory/services/explorer_story.py \
  src/memory/services/explorer_handoff.py \
  src/memory/cli/explore.py \
  tests/unit/memory/services/test_explorer_story_persistence.py \
  tests/unit/memory/services/test_explorer_handoff.py \
  tests/unit/memory/cli/test_explore.py
```

Expected: all checks pass.

## User Validation in Pi

The Navigator validates DS8 as a user in Pi, without running internal commands.

Resume an existing exploration:

```text
/mm-explore soul-mode
```

Expected: if `soul-mode` has an active durable Exploratory Story, Mirror renders `△ EXPLORATORY STORY RESUMED`.

Ask for stories:

```text
me mostra as explorações dessa jornada
```

Expected: Mirror shows the active story and historical archived or promoted stories.

Prepare a handoff with source evidence:

```text
prepare o handoff incluindo as conversas fonte, mas obfusque informações pessoais e caminhos locais
```

Expected:

- Mirror asks for or confirms source conversations before including raw evidence;
- generated package includes `index.md`, `exploratory-story.md`, `handoff-info.md`, `product-design-proposal.md`, and when confirmed, `full-conversation.md`;
- `index.md` lists source evidence with conversation ids and their role in the exploration;
- `full-conversation.md` includes an obfuscation notice;
- local paths, secrets, and private personal details are replaced by placeholders;
- if Mirror is unsure whether content is sensitive, it asks before writing or includes a summarized version instead of raw text.

Promote after review:

```text
sim, promover para Builder
```

Expected:

- Builder Mode activates;
- durable story status becomes `promoted`;
- handoff artifact paths remain available.

## Pass Condition

Exploratory Stories can be resumed beyond runtime state, Builder handoffs include reviewed source evidence when requested, and raw conversation evidence is privacy-reviewed and obfuscated before being written.
