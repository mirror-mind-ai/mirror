[< CV9.E2.S8](index.md)

# CV9.E2.S8 — Plan

**Status:** Approved — Navigator directed "fix the bug now" 2026-07-16

---

## Design

Minimal, matching the established safe pattern already present in the same file
(`mark_injected`): assign the client to a local so it stays referenced — and its
connection stays open — for the duration of the store call.

```python
# _load_state
mem = _memory_client()
session = mem.store.get_runtime_session(resolved_session_id)

# write_state
mem = _memory_client()
mem.store.upsert_runtime_session(resolved_session_id, ...)
```

No explicit `close()`:

- In production, `_memory_client()` returns a fresh client; when `mem` goes out
  of scope at function return its `__del__` closes the connection — after the
  call, which is correct. The hook runs as a short-lived subprocess.
- In tests, `_memory_client` is patched to return one shared client across
  calls; an explicit `close()` would close it after the first call and break
  every subsequent read/write in the same test. `mark_injected` documents this.

## Test strategy

The existing tests cannot catch the bug because they inject a *held* client
(`return_value=client`). The regression tests reproduce the production path with
`side_effect=lambda: MemoryClient(db_path=db)` — a fresh client per call — so the
chained-temporary version GC-closes the connection and raises, while the fix
succeeds. Coverage: `write_state` persistence, the `_load_state` read path
(`get_value`/`needs_inject`), and a full write → inject → mark round-trip.

## Risks

- **Under-fix:** other chained-temporary sites elsewhere. Mitigation: a
  repo-wide sweep found exactly these two (plus S7's already-fixed helper).
- **Over-fix:** adding `close()` and breaking shared-client tests. Mitigation:
  explicitly out of scope; rely on `__del__` at scope exit like `mark_injected`.

## Verification

Full CI gate per the development guide, plus the isolated real-connection
regression tests. Details in [test-guide.md](test-guide.md).
