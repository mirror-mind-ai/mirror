[< CV13.E3](../index.md)

# CV13.E3.S2 — Environment boundary and secrets masking

**Status:** ✅ Done
**Epic:** CV13.E3 — Configuration Console
**Release target:** v0.13.0

---

## User-visible outcome

The Configuration page explains which environment settings affect the active Mirror while protecting secrets through masking or omission.

---

## Scope

- Add an environment section to the read-only configuration overview.
- Show selected safe environment-derived settings and whether they are configured.
- Mask sensitive values such as keys, tokens, and secrets.
- Explain source/boundary clearly so users understand these values are runtime environment settings.
- Keep the page read-only.

---

## Non-goals

- No `.env` editing.
- No full environment dump.
- No secret disclosure.
- No remote configuration.
- No write/update flow.

---

## Validation

See [test guide](test-guide.md).
