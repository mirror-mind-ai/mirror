[< CV9.E2.S11](index.md)

# CV9.E2.S11 — Plan

**Status:** Approved — Navigator confirmed 2026-07-16 (Builder context keeps
reinforcing; curation / MCP / CLI opt out)

---

## Design

Thread an opt-out flag from the search engine outward; the default preserves
today's genuine reinforcement.

- **search.py** — `search_with_status(..., log_access: bool = True)` guards the
  access-log loop:
  ```python
  if log_access:
      for sr in results:
          self.store.log_access(sr.memory.id, context=query[:200])
  ```
  `search()` passes the flag through.
- **memory.py / client.py** — `search` and `search_with_status` gain
  `log_access: bool = True` and pass it down.
- **Callers opt out** with `log_access=False`:
  - `conversation.py` curation search;
  - `mcp/tools.py` `_search_memories`;
  - `cli/memories.py` `--search`.
  Builder context (`cli/build.py`) is left at the default `True`.
- **mcp/tools.py docstring** gains a parenthetical: `search_memories` does not
  reinforce (`log_access=False`), restoring the "no writes" claim's accuracy.

## Trade-offs

- **Default `True`, not `False`.** Matches the audit and keeps genuine context
  loads (Builder/Mirror) reinforcing without each caller opting in. Only the
  three known polluters opt out.
- **No schema change.** Stopping the writes is sufficient; a `source` column is
  deferred.

## Risks

- Missing a genuine reinforcing caller and silencing it: the only caller left at
  the default is Builder context, which is genuine. Curation/MCP/CLI are the
  audit-named polluters.
- Signature churn across three layers — covered by the existing search suite and
  the new opt-out tests.

## Verification

Keyless full CI gate plus the story tests in [test-guide.md](test-guide.md).
