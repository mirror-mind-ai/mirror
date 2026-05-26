[< Story](index.md)

# Plan — CV13.E4.S4 Single conversation retitle

## Implementation plan

1. Add an LLM helper for concise conversation title suggestions.
2. Add `ConversationService.suggest_title()` that loads one conversation and its messages.
3. Add `POST /api/conversations/title-suggestion` that returns a suggestion without saving.
4. Add transcript UI controls: request suggestion, show preview, use suggestion.
5. Keep final persistence on the manual save endpoint from S3.
6. Restart the web server and stop at manual validation.

## Design boundaries

- Explicit click only.
- Suggestion endpoint is read-only.
- Save remains a separate user action.
