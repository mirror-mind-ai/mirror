# Technical Debt Ledger

Ariad Review records technical debt here when debt should be paid now or deferred.

| ID | Source Story | Location | Kind | Description | Impact | Recommendation | Navigator Decision | Status |
|----|--------------|----------|------|-------------|--------|----------------|--------------------|--------|
| TD-001 | Pi external-skill home divergence fix (`c876c59`) | `.pi/extensions/mirror-logger.ts` (`resolveMirrorHome`, `_readDotenv`, `_effectiveMirrorEnv`, home-dir constants) ↔ `src/memory/config.py` (`resolve_mirror_home`, dotenv loader) | Duplicated contract / drift risk | The Pi logger re-implements the Python core's mirror-home resolution contract in TypeScript (upward `.env` walk, shell-env > `.env` precedence, `MIRROR_HOME` > `MIRROR_USER`, `.mirror-minds` preferred with legacy `.mirror` fallback) because a Pi extension cannot import `memory.config`. Two implementations of one contract can silently diverge. | If the core changes resolution semantics (new precedence, new env var, or another home-dir rename), Pi external-skill discovery breaks again exactly as it did here — and fails quietly, exposing zero external skills. | Contract is centralized on each side (constants + helpers). Longer term, make Python the single source of truth by exposing a machine-readable resolved-home command the extension can call, or a shared language-neutral config; add a regression check asserting Node and Python agree for representative env/`.env` cases. | Accept duplication now (Option 1); track for future consolidation. | Open — Accepted |
| TD-002 | mm-backup skill session, 2026-07-20 | `src/memory/cli/backup.py` (`backup()`, `main()`) ↔ `src/memory/config.py` (`db_name_for_env`, `MEMORY_ENV`) | Coherence gap / silent wrong-target risk | `backup()`'s CLI path always resolves `db_path` to `mirror_home / "memory.db"` whenever `mirror_home` is set — which it almost always is, via `_RESOLVED_MIRROR_HOME`. It never consults `db_name_for_env()`/`MEMORY_ENV`, even though that mapping exists precisely to isolate `production`/`development`/`test` databases (`memory.db` / `memory_dev.db` / `memory_test.db`). Only the fallback path (`mirror_home is None`) reads `DB_PATH`, which does respect `MEMORY_ENV`. | On a `development` or `test` environment, `uv run python -m memory backup` reports "Database not found" instead of backing up the actual environment database — a silent no-op that looks like an error but is actually pointing at the wrong file. Confirmed live: dev DB is `memory_dev.db`, but backup always looked for `memory.db`. Required a manual `backup(db_path=...)` call to work around it. | Make `backup.py`'s CLI path use `db_name_for_env()` (or equivalent) instead of hard-coding `"memory.db"`, so the environment-aware naming in `config.py` is respected consistently across all entry points, not just the `mirror_home is None` fallback. | Pending | Open — Pending |
| TD-003 | Post-merge drift analysis, 2026-07-20 (CV22 DS5→DS6) | TS DS5 ports (`ts/src/search/memorySearch.ts`, `ts/src/providers/{llm,embedding,credits}.ts`, `ts/src/extraction/conversation.ts`, `ts/src/conversation/extraction.ts`, `ts/src/consult/core.ts`) ↔ main CV9.E2 AI-audit oracles (`src/memory/intelligence/{search,extraction,embeddings,cost,llm_router}.py`, `src/memory/cli/consult.py`) | Parity drift / stale replay ports | The TS DS5 replay-backed ports were frozen ~2026-07-16 and predate the CV9.E2 AI-engineering-audit hardening landed on main 2026-07-16..07-19 (AI-04 search lexical-degrade, CR036 provider timeouts, AI-06 model-pin + diagnose, AI-09 cost/consult ledger, AI-15/16 + AI-25 extraction injection fencing, AI-10 extraction status, CV9.E2.S1/S17/S18 embedding fail-safe/provenance/ledger), which redefined the live-correct behavior of those Python oracles. CI does not catch it: the golden gate only re-derives the 3 read-only goldens, real-DB-copy parity is read-only, DS5 replay fixtures are static, and `write_parity.py` runs local-only. Captured as Ariad Refinement Work **RS007** with **CR037–CR044** (`uv run python -m memory build refinement-story overview --journey mirror-ts-core --refinement-story-id 085e19a6`). | **Resolved by RS007 (closed 2026-07-20)** for search lexical-degrade (CR037), model-pin resolution (CR039), consult cost ledger (CR040), extraction injection fencing as defense-in-depth (CR041), extraction status recording (CR042), and embedding fail-safe/provenance/ledger (CR043) — all reconciled, TDD-verified, CI-green, zero Python touched. **Remaining, carried forward:** TS LLM/embedding providers still lack explicit per-call timeouts (CR038, parked — no live HTTP client exists in TS to bind one to); when TS goes live at the DS5→DS6 cutover without this, a hung provider connection could stall a session-end hook or the interactive path with no error, exactly as CR036 fixed in Python. Also carried forward: CR041's prompt-level injection resistance (the 'Untrusted input' guard + AI-25 sandwich) has no TS surface yet — see the deferred-debt entries below for both. | Reconcile via RS007 as the behavioral acceptance list for the DS5→DS6 live-provider cutover (multi-persona Plan review); land CR044 (oracle-drift tripwire) first to prevent silent recurrence, and evaluate adding `write_parity.py` to CI. | Pull RS007; start CR044 (tripwire) first (2026-07-20). RS007 closed 2026-07-20: CR037/CR039/CR040/CR041/CR042/CR043/CR044 done; CR038 (LLM/embedding timeouts) parked, carried forward as deferred debt below. | Open — Substantially resolved (RS007 closed); CR038 timeouts + CR041 prompt-level fencing carried forward |

## Deferred Debt Requirements

When debt is deferred, record the defer reason and revisit trigger.

- **TD-001 scope note (2026-07-12, CV9.E2.S6):** the duplicated TS-side
  resolution now also feeds the mirror-logger log destination
  (`_resolveMemoryDir`: `MEMORY_DIR` > resolved home > homes-root bootstrap
  fallback). No third copy was added — the log path reuses the existing
  `_effectiveMirrorEnv` machinery — and the same revisit trigger applies.
- **TD-001** — Defer reason: a Pi (TypeScript) extension cannot import the Python
  `memory.config` constants, so duplicating the resolution contract is the smallest
  correct fix today. Revisit trigger: any change to the core mirror-home resolution
  semantics (precedence, new `MIRROR_*` variable, or a home-directory rename), or the
  next time a non-Python runtime surface needs to resolve the home itself — at that
  point promote the shared resolution to a single source of truth (core command or
  language-neutral config) rather than adding a third copy.
- **TD-003 (CR038, LLM/embedding provider timeouts)** — Defer reason: Python's
  timeout mechanism binds entirely at OpenAI SDK client construction
  (`OpenAI(timeout=X, max_retries=N)`); TS has zero HTTP/SDK dependencies
  (`ts/package.json` `dependencies: {}`) and no live `LlmProvider`/`EmbeddingProvider`
  implementation to bind a timeout to — only `ReplayLlmProvider`/`ReplayEmbeddingProvider`,
  in-memory stubs with no network concept. Building a generic timeout wrapper now
  would be premature (unknown eventual transport shape: `fetch`+`AbortSignal` vs. an
  SDK constructor param). Revisit trigger: when the DS5→DS6 live-provider cutover
  story is planned and a live `LlmProvider`/`EmbeddingProvider` implementation is
  being designed, bind `LLM_TIMEOUT_EXTRACTION=60s` / `RECEPTION=10s` /
  `EMBEDDING=15s` / `MAX_RETRIES=2` (env-overridable via `MEMORY_LLM_TIMEOUT_*` /
  `MEMORY_LLM_MAX_RETRIES`) at that provider's actual transport layer as a hard
  gate, not an optional addition.
- **TD-003 (CR041, prompt-level injection resistance)** — Defer reason: Python's
  primary injection-resistance control (the "Untrusted input" prompt-text guard +
  AI-25 sandwich/worked-example for title/tags/summary) has no TS surface: TS has
  no LLM-based `generateConversationTitle/Tags/Summary` at all, and
  `ReplayLlmProvider` ignores the prompt entirely (canned response by role). CR041
  shipped the defense-in-depth half only (valid-enum sanitization, anti-flood caps,
  a coerce-to-drop integrity fix, and a forward-ready transcript fence). Revisit
  trigger: when the DS5→DS6 live-provider cutover story is planned and a live LLM
  provider carries an actual prompt template, port the untrusted-input guard and
  AI-25 sandwich/worked-example there, and capture the deferred CR at that point
  (explicitly held, not captured at RS007 time, per Navigator decision 2026-07-20).
