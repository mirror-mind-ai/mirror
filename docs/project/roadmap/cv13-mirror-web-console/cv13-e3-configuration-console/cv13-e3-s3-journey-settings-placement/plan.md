[< Story](index.md)

# Plan — CV13.E3.S3 Journey settings placement

## Implementation plan

1. Keep global Configuration scoped to Mirror/runtime configuration.
2. Add read-only journey settings to the Workspace surface for the selected journey.
3. Render the settings as a Workspace tab beside briefing, conversations, memories, and decisions.
4. Show project path, sync file, icon, color, status, and journey id.
5. Add tests proving settings live in Workspace and are absent from global Configuration.

## Design boundaries

- S3 is inspection only.
- S4 owns safe edit flows in the Workspace journey context.
