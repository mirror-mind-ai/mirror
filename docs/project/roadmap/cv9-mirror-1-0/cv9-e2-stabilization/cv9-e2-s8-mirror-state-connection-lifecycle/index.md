[< CV9.E2](../index.md)

# CV9.E2.S8 — Mirror Mode State Hook Connection Lifecycle

**Status:** Done — Navigator validated 2026-07-16
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** discovered during [CV9.E2.S7](../cv9-e2-s7-extraction-failure-isolation/index.md) Navigator validation

---

## User-visible outcome

The Mirror Mode hook helpers (`needs-inject`, `get`, `mark-injected`) read and
write per-session state reliably in production, where each invocation opens its
own database client — instead of raising `Cannot operate on a closed database`
and silently failing hook context injection.

---

## Problem

`hooks/mirror_state.py` has two functions that chain on a **temporary**
`MemoryClient`:

```python
# _load_state
session = _memory_client().store.get_runtime_session(resolved_session_id)
# write_state
_memory_client().store.upsert_runtime_session(...)
```

`get_connection()` opens a fresh SQLite connection per call and
`MemoryClient.__del__` closes it (added to release file descriptors on Python
3.14). When the client is a bare temporary, CPython refcount-collects it right
after `.store` is read — so `__del__` closes the connection **before** the
`.store` method runs. Confirmed empirically: `write_state` and the `_load_state`
read path both raise `sqlite3.ProgrammingError: Cannot operate on a closed
database` when `_memory_client()` returns a fresh client, which is the
production path (each hook subprocess constructs its own).

**Why it was invisible.** Every existing test injects a single *held* client via
`mocker.patch(..., return_value=client)`. A held client is never a temporary and
never GC-collected mid-expression, so the tests pass while production breaks.
`mark_injected` already sidesteps the trap (it assigns the client to a local and
documents why) — only `_load_state` and `write_state` still chain. A repo-wide
sweep found these two as the only remaining instances.

This is the same failure class fixed in CV9.E2.S7's report-line helper.

---

## Scope

- Hold the client in a local in `_load_state` and `write_state` so the
  connection stays open for the read/write, matching `mark_injected`.
- Add real-connection regression tests that construct fresh clients per call
  (`side_effect`), reproducing the production path a held-client mock cannot.
- A short module note so future edits do not reintroduce the chained-temporary
  pattern.

---

## Non-goals

- **No change to `MemoryClient.__del__` / connection semantics.** The
  close-on-`__del__` behavior is the intentional Python 3.14 FD-exhaustion fix;
  reworking it is out of scope and risks reintroducing descriptor leaks.
- **No explicit `close()` in these helpers.** The hook subprocess exits shortly
  after the call (so `__del__` at function return suffices), and closing would
  break the shared-client test doubles — the exact reason `mark_injected`
  documents *not* closing.
- No change to the hook CLI surface or state schema.

---

## Done condition

- `_load_state` and `write_state` succeed against a fresh per-call client.
- Regression tests fail on the chained-temporary version and pass on the fix.
- Full unit + integration suite, ruff, and mypy gates green.

---

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [CV9.E2.S7 — Extraction Failure Isolation](../cv9-e2-s7-extraction-failure-isolation/index.md) (same failure class)
