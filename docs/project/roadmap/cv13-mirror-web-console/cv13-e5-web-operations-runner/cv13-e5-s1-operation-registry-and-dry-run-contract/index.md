[< CV13.E5](../index.md)

# CV13.E5.S1 — Operation registry and dry-run contract

**Status:** ✅ Done
**Epic:** CV13.E5 — Web Operations Runner
**Release target:** v0.15.0

---

## User-visible outcome

The web app can ask the server which maintenance operations are available and receive a safe, structured catalog describing each operation, its purpose, risk, parameters, and dry-run behavior.

---

## Scope

- Add a server-side registry for allowlisted web operations.
- Define operation metadata: id, title, description, category, risk level, dry-run support, execution availability, and parameter schema.
- Expose a read-only API endpoint for the operation catalog.
- Include initial catalog entries for safe early candidates without executing them yet.
- Add focused tests that prove arbitrary operations cannot appear through request input.

---

## Non-goals

- No operation execution.
- No job table or operation history.
- No streaming output.
- No UI page beyond what is necessary to keep the API reachable, unless implementation reveals a small coherent shell link is needed.
- No shell command invocation.
- No runtime update, migration, extension install, or git mutation.

---

## Validation

See [test guide](test-guide.md).
