# Plan — CV9.DS7.US4 Contextual Conversation Metadata Maintenance

## Implementation Plan

1. Add conversation service support for non-mutating lifecycle preview at a message boundary.
2. Add CLI/debug route:

   ```bash
   uv run python -m memory.cli.conversations \
     --metadata-lifecycle-preview-at-message <message-id>
   ```

3. Add web conversation endpoints:
   - preview metadata lifecycle for one conversation;
   - apply explicit values for one conversation.
4. Add conversation detail UI section:
   - `Run metadata update` preview button;
   - report rendering with decisions;
   - explicit apply button using operator-reviewed values.
5. Add unit tests for service/CLI/server surfaces.
6. Validate with focused tests and a manual web/CLI route.

## Out of Scope

- Automatic metadata updates during runtime lifecycle events.
- Per-message buttons in release UI.
- Batch operation catalog entry.
- Auto-accepting `refine_candidate`.
