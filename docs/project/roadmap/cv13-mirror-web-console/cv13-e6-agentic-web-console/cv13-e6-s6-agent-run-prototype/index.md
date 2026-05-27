[< CV13.E6](../index.md)

# CV13.E6.S6 — Agent run prototype

**Status:** ✅ Done
**Epic:** CV13.E6 — Async Operations and Agentic Web Console
**Release target:** v2.0

---

## User-visible outcome

The web app can launch a bounded local agent-run prototype from an intent field and inspect its async run, timeline, and result evidence. The prototype is read-only and proposal-oriented.

---

## Scope

- Add a runnable agent prototype operation with an intent parameter.
- Execute it through the same async run, event, result, cancellation, and approval-capable substrate.
- Return a bounded local proposal and safety boundary evidence.
- Avoid autonomous writes or unrestricted headless runtime execution.

---

## Non-goals

- No autonomous database, file, git, update, migration, or shell mutation.
- No unrestricted Pi/headless runtime embedding.
- No background multi-step tool loop beyond this bounded prototype.

---

## Validation

Focused web/service tests plus ruff, node syntax, and diff checks.
