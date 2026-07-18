[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S26 — Budgeted Maintenance Extraction (closes AI-05)

**Status:** Done  
**Epic:** CV9.E2 Stabilization & Robustness  
**Closes:** AI Engineering Audit **AI-05** — every conversation end burns network calls even with all flags off  
**Planned by:** quality-assurance · **Reviewed by:** ai-engineer, database-architect, devops-engineer, prompt-engineer (recused — no instruction-text surface)

---

## User-Visible Outcome

`session_maintenance()`'s extraction step (`extract_pending`) previously processed **every** eligible pending conversation, unordered, in one serial session-start run. A backlog (a gap in usage, a dead API key, a quarantine-adjacent failure period) turned the next session start into a long, invisible, unbounded spend burst — each conversation costs ≥2 LLM calls plus up to ~9 embedding calls.

`extract_pending` now processes **at most `MEMORY_MAINTENANCE_MAX_EXTRACTIONS`** (default 10) conversations per run, **oldest-ended first**, so a backlog drains deterministically over successive session starts instead of bursting in one. The remainder is never dropped — it stays pending and is reported as **"carried over"** in the maintenance output whenever nonzero, keeping a chronic backlog visible rather than silently lagging.

## Grounded facts (verified in source)

- `get_unextracted_conversations()` (`storage/conversations.py`) already excluded quarantined, journey-null, and <4-message conversations, but had **no `ORDER BY` and no `LIMIT`**.
- `retitle_pending_conversations(limit=5)` was the in-repo template for a budgeted maintenance step.
- `session_maintenance()`'s report scaffold (`_timed_step` + `⚠` lines for quarantine/parse-failed) was ready to receive the carried-over line.
- **Two word-collision risks found and avoided:** `"skipped"` is already AI-21's vocabulary (journey-less, never-extracted conversations); `"deferred"` is already `session_start_fast`'s vocabulary (`"Maintenance deferred."` — the *whole* maintenance step skipped to background, a different concept). The report uses **"carried over"** — also the audit's own fix language ("carry the rest to the next run") — keeping all three states disjoint in the operator's mental model.
- **Documentation bug found and fixed in-cycle:** a prior story's `cat >>` appended the AI-11-closure status note *after* the audit document's closing "See also" footer instead of inside AI-11's status stack. Relocated to the correct position; doc-link check confirmed clean before and after.

## Scope

**In:**
- `get_unextracted_conversations(limit=None)` — `ORDER BY c.ended_at ASC` + `LIMIT` when given.
- New `count_unextracted_conversations()` — same predicate, `COUNT(*)`, used post-run for the carried-over count without a second full fetch.
- `extract_pending(limit=None)` — defaults to `MEMORY_MAINTENANCE_MAX_EXTRACTIONS` (new config knob, default 10).
- `session_maintenance()` — reports `"N conversation(s) carried over to the next run"` when the post-run count is nonzero.
- `docs/reference/configuration.md` — new entry, matching the sibling `MEMORY_EXTRACTION_MAX_ATTEMPTS` format exactly.
- Audit misplacement fix (documentation coherence, found while closing AI-05 in the audit).

**Out (named, not built):**
- `(ended_at)` index — only if corpus growth ever surfaces sort cost (local single-user DB; not needed at current scale).
- Chronic-backlog escalation alarm — the visible carried-over count is judged sufficient; no additional warning tier.

## Acceptance Criteria

- 15 pending → 10 processed, 5 carried over (first run); second run drains the 5.
- Oldest-ended conversations processed first (FIFO; no starvation).
- Quarantined conversations never consume the budget (already excluded by the shared predicate; asserted by test).
- Regression: ≤N pending → all processed, matching pre-S26 behavior exactly.
- `MEMORY_MAINTENANCE_MAX_EXTRACTIONS` env-overridable; explicit `limit=` argument still available for direct callers.
- Report shows "carried over" (never "skipped" or "deferred") only when count > 0.
- Full keyless suite green; mypy D-006 baseline unchanged; doc links clean.

## Done Condition

- All new tests green in CI (no live LLM; the pipeline is mocked exactly as AI-02's isolation tests already do).
- `docs/reference/configuration.md` documents the new knob in the established format.
- Roadmap/audit/worklog updated; AI-05 marked closed in the audit's status stack (correct location, not appended after the document footer).

## As-built (implementation and verification)

Shipped exactly as planned — a query `ORDER BY … LIMIT`, a `COUNT(*)`, a config knob, and a report line.

**Storage.** `_UNEXTRACTED_WHERE` extracted as a shared query fragment so `get_unextracted_conversations` and the new `count_unextracted_conversations` cannot drift apart on the eligibility predicate — the database-architect's requirement that the "carried over" count reflect the *exact* same set the capped run drew from. `ORDER BY c.ended_at ASC` relies on `ended_at`'s ISO-8601 lexicographic-equals-chronological ordering (no conversion needed).

**Config.** `MEMORY_MAINTENANCE_MAX_EXTRACTIONS` follows the existing `int(os.getenv(...))` pattern used by `MMR_DEDUP_THRESHOLD` and the reinforcement knobs.

**CLI.** `extract_pending(limit=None)` defaults to the config value only when the caller passes nothing, so existing direct callers (tests) that pass an explicit `limit` are unaffected. `_count_carried_over_conversations` mirrors `_count_quarantined_conversations`'s connection-lifecycle pattern exactly (client held in a local, closed in `finally`, fail-quiet on error) — the same defensive shape for the same reason (a temporary `MemoryClient`'s `__del__` can close the connection before a chained query runs).

**Tests.** 9 storage tests (limit/ordering/quarantine-exclusion on `get_unextracted_conversations`; 5 on the new `count_unextracted_conversations`, including a predicate-parity test that asserts the count matches the unlimited fetch exactly) + 10 CLI tests (default cap, drain-over-runs, exactly-N regression, explicit `limit=` override, config override, oldest-first wiring, carried-over report line present/absent, and an explicit word-collision guard test asserting neither "skipped" nor "deferred" appears). Full keyless suite green; mypy confirmed at the 109-error D-006 baseline both with and without the changed files (stash-verified) — zero new errors.

**Audit coherence fix.** While closing AI-05 in the audit document, found that a previous story's `cat >>` had appended the AI-11-closure status block after the document's closing "See also" footer rather than inside AI-11's own status stack (the established convention for every prior closure — AI-07, AI-09, AI-10, AI-22, AI-23 all recorded their closure status in the top stack, never inline at the finding). Relocated the misplaced block to the correct position, appended AI-05's own closure note in the same stack, and restored "See also" as the true end of the file. `scripts/check_doc_links.py` confirmed clean both before and after (the bug was a structural placement issue, not a broken link).

## See also

- [Plan](plan.md) · [Test Guide](test-guide.md)
- [AI Engineering Audit — AI-05](../../../../ai-engineering-audit.md)
- [Configuration Reference — MEMORY_MAINTENANCE_MAX_EXTRACTIONS](../../../../../reference/configuration.md#memory_maintenance_max_extractions)
