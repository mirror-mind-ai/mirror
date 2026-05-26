[< Story](index.md)

# Plan — CV13.E4.S6 Journey attachments visibility

## Implementation plan

1. Pass `AttachmentService` into the Workspace surface.
2. Load attachments for the selected journey.
3. Render an Attachments tab in Workspace with read-only cards.
4. Add an attachments metric.
5. Add focused surface tests.
6. Restart the web server and stop at manual validation.

## Design boundaries

- Read-only visibility only.
- No upload/edit/delete.
- No LLM call.
