[< CV13.E4](../index.md)

# CV13.E4.S4 — Single conversation retitle

**Status:** ✅ Done
**Epic:** CV13.E4 — Conversation Intelligence
**Release target:** v0.14.0

---

## User-visible outcome

A selected conversation can request a generated title suggestion from its transcript page, review it, and save it only through the existing manual title save action.

---

## Scope

- Add an explicit single-conversation title suggestion action.
- Use stored messages as title context.
- Return a suggested title without saving it automatically.
- Let the user apply the suggestion to the title textbox and then save manually.
- Log LLM calls when LLM audit logging is enabled.

---

## Non-goals

- No LLM call on page load.
- No automatic save.
- No batch retitle.
- No message editing.
- No transcript deletion.

---

## Validation

See [test guide](test-guide.md).
