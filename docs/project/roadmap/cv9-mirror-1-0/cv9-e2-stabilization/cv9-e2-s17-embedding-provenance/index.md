[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S17 — Embedding Provenance

**Status:** Done
**Epic:** CV9.E2 Stabilization & Robustness
**Closes:** AI-07 (AI Engineering Audit) — the provenance half. The shape-assertion
half shipped in CV9.E2.S1.

---

## User-Visible Outcome

Every embedding Mirror stores records **which model and dimension produced it**,
so a future embedding-model migration can be done incrementally and the current
corpus's model composition is legible instead of a black box. Today a stored
vector is a raw BLOB with no record of its origin — if the pin changes or the
provider re-routes, there is no way to tell which vectors came from where.

`inspect embedding-provenance` reports the distribution:

```text
=== embedding provenance (1240 memory vectors) ===
  1222×  openai/text-embedding-3-small
    18×  unknown (pre-provenance)
```

## Scope

In scope:

- Record `embedding_model` + `embedding_dimensions` in the row `metadata` JSON at
  every persisted-vector write path: `add_memory` (manual + extraction staging),
  `add_attachment`, and the consolidation merge write.
- A `metadata`-merge that preserves foreign keys, treats the provenance keys as
  authoritative for the write, and **never raises on malformed/non-object
  existing metadata** — provenance must not become a new way for a write to fail
  (the boundary CV9.E2.S1 made crash-safe).
- A read surface: `inspect embedding-provenance` reporting the model distribution
  of stored memory vectors, with an explicit `unknown (pre-provenance)` bucket.

Out of scope (recorded):

- **Conversation-summary vector provenance** — deferred; that vector is secondary
  and its metadata is entangled with the CV9.DS7 conversation-metadata lifecycle.
- **Historical backfill** — record-at-write-time only, per the audit. Existing
  vectors stay `unknown`; a backfill is a separate migration.
- **Journey descriptor embeddings** — generated transiently for search, never
  stored; nothing to stamp.
- **Provenance columns** — metadata JSON now (no schema change, audit-consistent);
  a column is the migration-time upgrade after the CR019 schema-custody transfer.

## Reconciliation — reader home is `inspect`, not `diagnose`

The plan named a "runtime diagnose provenance line." In this codebase `runtime
diagnose` emits only **drift findings** (and any finding flips its exit code), so
an always-visible distribution is not a finding. DB-backed reads live in the
`inspect` family (`inspect llm-calls`). The reader therefore ships as a
self-contained `inspect embedding-provenance` subcommand — always visible, and
the story's own validation route. A `diagnose` drift-finding (stored vectors on a
model other than the current pin) is a small, optional follow-up.

## What this closes — and what it does not

S17 makes deliberate model changes **attributable**: swap `MEMORY_EMBEDDING_MODEL`
and new writes carry the new tag, so the old ones are findable. It does **not**
detect a provider-side silent re-route under the *same* model ID (same string,
shifted vector space) — that is shape-blind and needs a reference-vector
self-similarity probe (AI-11). Provenance records the *configured* model at write
time, which equals the *generation* model as long as the pin is not hot-swapped
within a single process.

## Done Condition

- New memory and attachment vectors carry `embedding_model` + `embedding_dimensions`
  in their `metadata` JSON; caller-supplied metadata keys survive the merge.
- The merge never raises on `None`, `{}`, valid, malformed, or non-object metadata.
- The consolidation merge write records provenance.
- `inspect embedding-provenance` reports the model distribution with an `unknown`
  bucket, and does not crash on legacy/malformed metadata rows.
- Focused unit tests cover the helper taxonomy, each write path (incl. staging),
  the store distribution query, and the render.

## See also

- [Plan](plan.md) · [Test Guide](test-guide.md)
- [AI Engineering Audit — AI-07](../../../../ai-engineering-audit.md)
- [CV9.E2 Stabilization & Robustness](../index.md)
