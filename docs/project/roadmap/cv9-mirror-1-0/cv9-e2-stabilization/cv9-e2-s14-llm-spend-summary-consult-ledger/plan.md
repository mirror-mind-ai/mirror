[< CV9.E2.S14](index.md)

# CV9.E2.S14 — Plan

**Status:** Approved — Navigator confirmed 2026-07-17

---

## Design

### storage/llm_calls.py — one GROUP BY per axis

```python
def get_llm_call_summary(self, *, since: str | None = None) -> dict:
    """Aggregate spend by role and by week. NULL cost is counted, never summed as 0."""
    where, params = ("WHERE called_at >= ?", [since]) if since else ("", [])
    # one GROUP BY per axis; SUM(cost_usd) skips NULLs, unpriced counts them
    by_role = self.conn.execute(f"""
        SELECT role AS bucket, COUNT(*) AS calls,
               COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
               COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
               SUM(cost_usd) AS cost_usd,
               SUM(CASE WHEN cost_usd IS NULL THEN 1 ELSE 0 END) AS unpriced
        FROM llm_calls {where} GROUP BY role ORDER BY role
    """, params).fetchall()
    by_week = self.conn.execute(f"""... strftime('%Y-W%W', called_at) AS bucket ...
        GROUP BY bucket ORDER BY bucket DESC""", params).fetchall()
    # total derived in Python from by_role (single source, no third query)
    return {"by_role": [...], "by_week": [...], "total": {...}}
```

Rows are turned into dicts via `zip` to match `get_llm_calls` (the connection has
no `row_factory`). An all-unpriced bucket returns `cost_usd = None` with a
non-zero `unpriced` — honest, not `$0`.

### cli/inspect.py — `--summary`

Add `--summary` (store_true). When set, call `get_llm_call_summary(since=...)` and
render the by-role and by-week tables plus a TOTAL line; cost `None` → `—`, with a
`(N unpriced)` annotation per bucket. Per-row filters (`--role/--conversation/--session`)
do not combine with summary; only `--since` applies.

### services/observability.py — cost override

```python
def build_llm_logger(store, *, role, conversation_id=None, session_id=None, cost_usd=None):
    ...
    cost = cost_usd if cost_usd is not None else compute_cost(resp.model, ...)
```

Pipeline callers pass nothing (compute from the static table as before); consult
passes the real fetched cost.

### cli/consult.py — join the ledger

After `total_cost = fetch_generation_cost(...)`, log the call through the seam:

```python
log = build_llm_logger(mem.store, role="consult", cost_usd=total_cost)
if log:
    log(resp)
```

Metadata-only by default — the identity-context prompt is withheld unless `full`.

## Why this shape

- **SQL does the aggregation.** One `GROUP BY` per axis; NULL-skip and unpriced
  counting are structural, not Python bookkeeping.
- **Consult on the same seam.** It inherits the metadata/full body policy — the
  identity context is never logged unless the operator opts into `full`.
- **Cost override, not a second log path.** One place still owns how a row is
  written; consult only supplies a truer cost.

## Risks

- `%Y-W%W` is a calendar week (Monday-based), not strict ISO-8601 week numbering —
  adequate for spend bucketing; the column is labeled "week".
- Consult `full` mode logs the identity-context prompt (conscious; consult-to-third-party
  privacy is the separate AI-17 finding).

## Verification

Keyless full CI gate plus the story tests in [test-guide.md](test-guide.md).
