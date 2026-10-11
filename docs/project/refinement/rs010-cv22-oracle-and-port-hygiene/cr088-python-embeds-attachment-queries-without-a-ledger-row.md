[< RS010](index.md)

# CR088 — Python embeds attachment-search queries without writing a ledger row

**Status:** rejected
**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Driver:** —
**Delivery:** —

---

## Problem

`src/memory/services/attachment.py` generates embeddings on three paths. One logs; two do
not:

```python
# line 38 — storing an attachment: logged
emb = generate_embedding(content[:8000], on_llm_call=build_llm_logger(self.store, role="embedding"))

# line 83 — searching attachments: NOT logged
query_emb = generate_embedding(query)

# line 115 — the same, second search path: NOT logged
query_emb = generate_embedding(query)
```

AI-09's rule is that every model-in-the-loop call site logs through
`build_llm_logger`, and `services/observability.py` exists precisely so no call site
hand-rolls that decision. These two skip it, so every attachment search — including every
`mirror_context` call carrying a query, on the CLI and through the MCP server — spends real
money that appears in no ledger.

The practical consequence is not the money, which is fractions of a cent per call. It is
that `llm_calls` is the only record of what the system spends, and it is silently
incomplete: `inspect llm-calls` under-reports, and anything built on that ledger inherits
the blind spot. CV22.DS9.TS1 found this while building a wallet guard *on* that ledger —
the guard was blind to half the paid MCP surface until TypeScript started recording it.

TypeScript now records the call (CV22.DS9.TS1, commit `099daf57`). This CR is about the
Python side, which still does not.

## Expected Behavior

`search_attachments` passes `on_llm_call=build_llm_logger(self.store, role="embedding")` on
both query paths, exactly as the store path already does, so the ledger accounts for every
embedding the process pays for.

## Impact

Low in money, medium in trust. Any statement of the form "this is what Mirror spent" is
currently wrong by the number of attachment searches performed, and nobody can tell by how
much, because the omission leaves no trace. It also means Python and TypeScript now
disagree on this path — TS writes a row, Python does not — which is a divergence to record
while both engines exist.

## Plan Or Decision

Pending, and the decision is partly whether to bother:

- **Fix it in Python** — three lines, restores AI-09's rule, and makes the two engines agree
  while both are alive.
- **Leave it and let DS10 delete it** — `src/memory/` is scheduled for removal once CV22
  completes, and this path has no consumer that depends on the missing rows.

Note that fixing it touches a tracked oracle, so it re-baselines `oracle-baseline.json` and
must name the change it absorbs (see [CR086](cr086-baseline-advance-must-name-the-oracle-change.md)).

## Evidence

Read from `src/memory/services/attachment.py` at 2026-09-18 (lines 38, 83, 115), and found
because `mirror_context(query)` wrote no `llm_calls` row on either engine while
`search_memories(query)` wrote one. Confirmed by test in the TS port: a fixture with
attachments produces exactly one attributed row after the fix and none before it.

## Outcome

**Rejected 2026-09-25**, by the Navigator in [CV22.DS10.TS5's Debt Review](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts5-python-core-deletion/review.md): the subject is gone. `search_attachments`, the Python code that embedded attachment queries without a ledger row, was deleted with the Python core at TS5 plateau 3. TypeScript has recorded both query embeddings since CV22.DS9.TS1 (`099daf57`), so the gap this CR describes no longer exists in any code Mirror runs.

## Provenance

Raised at CV22.DS9.TS1 Debt Review, 2026-09-18. The TypeScript half was fixed inside that
story because a wallet guard reading the ledger cannot bound spend it cannot see; the
Python half was left alone deliberately, as it is oracle maintenance rather than port work.
