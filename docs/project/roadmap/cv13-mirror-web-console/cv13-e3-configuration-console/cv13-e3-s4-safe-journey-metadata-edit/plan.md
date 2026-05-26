[< Story](index.md)

# Plan — CV13.E3.S4 Safe journey metadata edit

## Implementation plan

1. Add a JourneyService method for updating selected metadata fields.
2. Expose a guarded web endpoint that accepts journey id plus project path, sync file, icon, and color.
3. Validate field types and keep values bounded.
4. Add a Workspace Settings form for the selected journey.
5. Refresh Workspace after save.
6. Add tests for successful persistence and invalid/missing journey rejection.

## Design boundaries

- No raw metadata editor.
- No journey content editing.
- Only selected metadata fields are writable.
