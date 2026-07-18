# Technical Debt Ledger

This ledger records structural cost the project is consciously carrying.

Do not record every imperfection. Record debt that may affect future delivery,
safety, maintainability, validation, operation, or product coherence.

## States

```text
Carried   known and accepted for now
Paying    currently being reduced by active work
Paid      resolved or reduced enough to close
Dropped   no longer relevant or replaced by another item
```

## Debt Items

| ID | Title | Kind | Severity | Status | Source | Revisit Trigger |
|----|-------|------|----------|--------|--------|-----------------|
| D-001 | Metadata lifecycle policy and evidence filtering live inside ConversationService | design | medium | Paid | CV9.DS7.US1 / CV9.DS7.TS1 / CV9.DS7.TS2 | Policy boundary extracted before US2 apply behavior |
| D-002 | Journey search silently returns `[]` on embedding failure | product | low | Carried | CV9.E2.S1 (AI-E4) | A "no journeys matched" report that is actually an embedding outage, or unifying journey degradation with memory-search's lexical fallback |
| D-003 | Embedding calls bypass the `llm_calls` ledger (invisible spend, amplified by S1 retry) | observability | medium | Paid | CV9.E2.S1 (AI-E1, AI-09 tail) → CV9.E2.S18 | Paid by CV9.E2.S18 embedding call observability |
| D-004 | Full test suite exhausts file descriptors under a low `ulimit -n` (macOS default) | testing | low | Paid | CV9.E2.S1 validation | Paid: conftest raises the soft fd limit at startup |
| D-005 | `evals/routing.py` fixtures are stale against the current persona catalog | testing | low | Carried | CV9.E2.S19 validation | Update fixtures to the current catalog (treasurer → cfo/financial; add scholar coverage), or the next persona-catalog change |
| D-006 | `mypy` is documented as a CI gate but is enforced in no workflow; `src/memory` carries 109 mypy errors | process | medium | Carried | CV9.E2.S20 QA audit | Wire `mypy` into CI (clear/baseline the 109 errors) so the claim becomes true, or correct §10/the checklist to mypy's real (review-only) status |

## D-001 — Metadata lifecycle policy and evidence filtering live inside ConversationService

**Kind:** design  
**Severity:** medium  
**Status:** Paid  
**Source:** CV9.DS7.US1 / CV9.DS7.TS1 / CV9.DS7.TS2  

### Carrying reason

US1 needed an observable non-mutating dry-run, and TS1 added enough policy to
avoid brittle title decisions. Keeping the policy helpers in `ConversationService`
is acceptable while the behavior remains dry-run-only.

### Revisit trigger

Triggered before CV9.DS7.US2 implementation. Apply/mutation behavior would make
metadata lifecycle policy, evidence filtering, or write boundaries harder to
reason about if the policy remained embedded in `ConversationService`.

### Closure condition

Policy and evidence filtering are either small enough to remain local, or they
are extracted into a clearer metadata lifecycle policy/service boundary before
mutation behavior is added.

### Result

Paid by CV9.DS7.TS2. Metadata lifecycle dry-run policy now lives in
`memory.services.metadata_lifecycle`, while `ConversationService` keeps storage
orchestration and public service entrypoints.

### Notes

Current evidence terms are useful for candidate signaling but noisy. This is not
blocking while decisions remain non-mutating and candidate-based.

## D-002 — Journey search silently returns `[]` on embedding failure

**Kind:** product  
**Severity:** low  
**Status:** Carried  
**Source:** CV9.E2.S1 (AI-E4)  

### Carrying reason

Memory search degrades to lexical-only and flags `degraded=True` (CV9.E2.S10),
but `JourneyService.find_relevant_journeys` wraps the query embedding in
`except Exception: return []`. On an embedding outage that empty result is
indistinguishable from "no journeys matched" — the exact silent-failure pattern
CV9.E2.S16 (AI-10) removed for extraction. S1 did not introduce this (an
`IndexError` slipped past the same handler before), and S1 deliberately did not
unify all five embedding-failure behaviors across the surfaces.

### Revisit trigger

A user reports a suspicious empty journey match during a provider outage, or a
later story unifies embedding-failure degradation across search surfaces.

### Closure condition

Journey search either surfaces an explicit degraded signal (like memory search)
or deliberately documents the empty-on-failure behavior as intended.

## D-003 — Embedding calls bypass the `llm_calls` ledger

**Kind:** observability  
**Severity:** medium  
**Status:** Paid  
**Source:** CV9.E2.S1 (AI-E1, AI-09 tail) · paid by CV9.E2.S18  

### Carrying reason

`generate_embedding` calls the provider directly with no `on_llm_call` seam, so
embedding spend never lands in `llm_calls` — even though `intelligence/cost.py`
already prices `openai/text-embedding-3-small`. AI-09 (CV9.E2.S13/S14) made the
rest of the pipeline observable by default; embeddings are the one hot-path model
call still dark. S1 adds bounded retry (up to `EMBEDDING_ATTEMPTS` calls on the
empty-payload path), which amplifies this invisible spend. The invisibility is
pre-existing, not created by S1, and does not block correctness; S1 bounds the
worst case by keeping `EMBEDDING_ATTEMPTS` small so the deferral stays safe.

### Revisit trigger

An AI-09 follow-up story, or the first time retry-driven embedding spend needs to
be measured or attributed.

### Closure condition

Embedding calls record a metadata-only `llm_calls` row (role, model, tokens,
latency, computed cost) through the same fail-soft seam as the rest of the
pipeline.

### Result

Paid by CV9.E2.S18. `generate_embedding` now logs once per API round-trip via an
optional `on_llm_call`; failures land as unpriced rows; two-pass's curation
searches use `role="embedding:curation"` so their spend is separable. The AI-20
two-pass revisit trigger (measurable embedding spend) is now satisfied. Table
growth is tracked as a retention radar item.

## D-004 — Full test suite exhausts file descriptors under a low `ulimit -n`

**Kind:** testing  
**Severity:** low  
**Status:** Paid  
**Source:** CV9.E2.S1 (Navigator validation) · paid alongside CV9.E2.S18  

### Carrying reason

Running the full `tests/unit tests/integration -m "not live"` suite on a shell
with the macOS default `ulimit -n` (256) fails a burst of CLI/migration/runtime
tests with `OSError: [Errno 24] Too many open files` and
`sqlite3.OperationalError: unable to open database file`. The failures cluster
where several tests open SQLite connections and temp database files in quick
succession and do not release the descriptors fast enough. It is not a product
defect and not caused by S1 — the same tests pass in isolation and under a higher
limit, and CI (Linux, higher default limit) is green. The workaround is
`ulimit -n 8192` before the run.

### Revisit trigger

The failures recur for a contributor who runs the full suite on a stock macOS
limit, or CI file-descriptor limits tighten.

### Closure condition

The descriptor-heavy fixtures/tests close their SQLite connections and temp
database handles deterministically (context managers or fixture teardown), or
the suite bounds the number of concurrently open databases, so a default-limit
run is clean without raising `ulimit`.

### Result

Paid pragmatically: `tests/conftest.py` `pytest_configure` now raises the process
soft `RLIMIT_NOFILE` toward the hard cap at startup, so the full not-live suite
runs clean under a stock macOS shell (verified under `ulimit -Sn 256`, hard
unlimited) without the caller raising `ulimit`. The hook is platform-guarded
(no-op where `resource` is unavailable or a sandbox forbids the raise). This
lifts the ceiling rather than reducing per-test fd usage — the fixtures still open
many temp databases — so the underlying leak is masked, not eliminated; a future
fixture-cleanup pass could still reduce concurrent open handles, but the
validation-blocking symptom is resolved.

## D-005 — `evals/routing.py` fixtures are stale against the current persona catalog

**Kind:** testing  
**Severity:** low  
**Status:** Carried  
**Source:** CV9.E2.S19 validation  

### Carrying reason

Navigator validation of CV9.E2.S19 (`eval routing` against the real production
database) surfaced a genuine 11/15 score (0.73, below the 0.85 threshold) that
is unrelated to S19 itself — S19 only added `EVAL_MODEL`/`EVAL_PROMPTS`
constants, never touching `_top_persona()` or fixture content. The persona
catalog has evolved since the eval's fixtures were last written
(`e10067c`, CV7.E1.S3): `treasurer` no longer exists (`cfo`/`financial` cover
that ground now), and newer personas (`cfo`, `scholar`) route queries the
fixtures did not anticipate (`treasurer-finances → None`,
`ambiguous-finance-over-research → 'cfo'`, `null-open-question → 'scholar'`).
This is exactly the drift AI-11/CV9.E2.S19 exists to surface — it is now
persisted and trendable instead of a number that flashed on stdout. Fixing
fixture content is out of S19's scope (persistence infrastructure, not eval
content).

### Revisit trigger

Before the routing eval is treated as a red/green release-gate signal, or the
next time the persona catalog changes and the fixtures need re-verification
anyway.

### Closure condition

`evals/routing.py`'s fixed queries and expected personas are reconciled with
the current persona catalog (`treasurer` references updated to `cfo`/`financial`;
`scholar` and other newer personas get explicit coverage or documented
exclusion), and the eval scores at or above threshold on a representative
seeded database.

## D-006 — `mypy` is documented as a CI gate but is enforced nowhere

**Kind:** process  
**Severity:** medium  
**Status:** Carried  
**Source:** CV9.E2.S20 QA audit (engineering-principles.md compliance review)  

### Carrying reason

`engineering-principles.md` §10's gate table lists `mypy` under **CI-enforced**
("a green `main` is impossible without it"), and the development-guide
[Verification Checklist](../process/development-guide.md#verification-checklist)
lists `uv run mypy src/memory` as a required local step. Neither is backed by
reality: no `.github/workflows/*` runs mypy, there is no `.pre-commit-config.yaml`,
and `uv run mypy src/memory` currently reports **109 errors across 26 files**
(identical at `6049b2e^` and `main` — pre-existing, not introduced by CV9.E2.S20,
whose own files sit outside the `src/memory` mypy target anyway). So the
type-check gate the rulebook claims as a hard safety net does not exist, and
could not be switched on today without first clearing or baselining those
errors. By the document's own standard — "a rule with no real gate is a hope,
not a rule" — this is a false safety net, surfaced by the S20 compliance audit
rather than left implicit.

### Revisit trigger

Before `mypy` is relied on as a release or CI signal; or the next change to the
CI workflow or the verification checklist; or whenever the 109-error backlog is
addressed for another reason.

### Closure condition

Either (a) `mypy` — with a defined target and an agreed error baseline — is wired
into `tests.yml` so a green `main` genuinely depends on it, making the §10
gate-table claim true; or (b) the §10 gate table and the verification checklist
are corrected to state mypy's real status (review-only / advisory, not
CI-enforced), so the documented gate matches the enforced gate. Either path
closes the honesty gap — the choice is whether to raise the gate to the claim or
the claim to the gate.
