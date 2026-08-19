[< Roadmap](../index.md)

# CV22 — TypeScript Core Port (Database-Seam Strangler)

**Status:** 🟢 In Progress
**Goal:** Port Mirror Mind's Python core (`src/memory/`) to TypeScript through a database-seam strangler — never a big-bang rewrite — so the system converges on one language across core and runtimes, distributes through npm, widens the contributor pool, and aligns with the MCP/plugin ecosystem, all without losing the accumulated correctness of the ranker, extraction, and memory pipeline.

---

## What This Is

CV21 packaged Mirror Mind's **runtime surface** once — a canonical plugin plus an
MCP server — and propagated it across Claude, Codex, Antigravity, and Grok by
import/install instead of N bespoke adapters. CV22 is the natural successor: it
unifies the **core language underneath** that surface. The runtimes are already
TypeScript (the Pi extension is `.ts`; plugins/MCP are TS-first). CV22 finishes
the convergence by moving the core into the same language.

The strategic frame, including the rewrite-vs-strangle decision and the full
spine, is recorded in
[Decisions — *Mirror Mind ports to TypeScript via a database-seam strangler, not a rewrite*](../../decisions.md).
CV22 is the roadmap structure derived from that spine after the parity spike
validated the approach.

The spine, in one breath: a **TS front door over a shared database**, with the
Python core dissolving one observable **entry point** at a time. CLI progress remains a
command burn-down; the released non-command Workspace/web surface requires a separately
named owner and convergence gate rather than disappearing from the denominator. Python
remains the product authority for each unported entry point and may evolve there; every such
change creates explicit TS parity scope. Once an entry point transfers, new behavior
lands in TS and Python becomes compatibility-only for that surface. The **database is
the seam** — two cores, one `memory.db`, one schema and FTS5 config, no in-process
language bridge. The hard part was never the language; it is the **convergence
discipline** that makes a moving target visible and prevents permanent dual authority.

---

## Spike Findings (evidence-based)

The riskiest assumption — *can a TS core replicate Mirror's subtlest behavior
against the real database?* — was attacked first. The subtlest behavior is the
hybrid ranker (semantic + recency + honest reinforcement + manual relevance +
ordinal lexical + MMR dedup). Spike: [CV22.DS1](cv22-ds1-hybrid-search-parity-spike/index.md),
harness under [`spikes/ts-search-parity/`](../../../../spikes/ts-search-parity/).

- **Parity holds — synthetic and real.** A TS reimplementation reading the *same*
  SQLite file reproduced the Python ranker's ordered results exactly: 8/8 probes
  over **480 real memories** with real **1536-dim** embeddings at `limit=10`.
- **The ranker is not pure.** `recency` and `reinforcement` call
  `datetime.now()`. The golden-corpus contract must **freeze `now`** in both
  implementations — otherwise parity tests throw false mismatches.
- **Lexical is ordinal.** The score uses `1/(1+i)` over bm25 *order*, so TS needs
  bm25 *ordering* parity, not bm25 *value* parity.
- **FTS5 is free.** TS queries the same `memories_fts` table in the same file and
  reimplements zero tokenizer/bm25 logic — the database-as-seam payoff.
- **No native build.** Node's built-in `node:sqlite` runs FTS5 + bm25, and Node
  runs `.ts` directly. No `npm install better-sqlite3`, no compile step.
- **Ordered ids, not bit-identical scores, is the success metric.** Python
  accumulates cosine in float32 (numpy), JS in float64. Worst observed score
  delta `7.2e-8` sits **~1,700×** below the tightest agreeing adjacent ranking gap
  (`1.3e-4`) — the numerical divergence is three orders of magnitude below the
  closest real decision, so it cannot flip a real near-tie.

Residual gaps the spike did **not** close (carried into later delivery stories):
the live `query → embedding → search` path with a fresh OpenAI embedding (DS5),
the write commands (DS4), and behavior at larger scale (the ranker is a full scan
+ cosine per row).

---

## Strangler Mechanics (the load-bearing decisions)

- **Seam — the database.** The SQLite file is the language-neutral integration
  point. Read-only commands may run live; any write stays with Python until its
  ported version passes golden tests against a **copy** of `memory.db` (never the
  live file; back up first).
- **Unit — the command.** Strangle CLI behavior by command, whose contract is observable
  as `command + args → stdout`. Progress is a visible burn-down:
  *commands-on-TS / total*.
- **Workspace/web retirement rule.** The web process, endpoints, and static assets do not
  enter the command denominator. DS7.US9 owns hierarchy parity; DS10 owns final process
  and package convergence. Zero commands cannot authorize Python deletion while that
  released surface still depends on Python.
- **Front door — Pi.** The first TS surface wraps Python for unported entry points
  and routes transferred commands to TS, dogfooded daily in the runtime both authors
  use. Routing records authority; it does not imply that every Python surface froze
  simultaneously.
- **Parity oracle — the Python test suite.** Converted into a language-agnostic
  golden-data corpus (frozen `now` + frozen embeddings) that the TS core must
  satisfy.
- **Schema is frozen.** The SQLite schema and FTS5 config are a compatibility
  contract; existing user databases must keep working. Changes require explicit
  migration discipline.

### v0.31.9 journey contract absorption

[RS008](../../refinement/rs008-v0319-recursive-journey-parity/index.md) makes the
released recursive journey contract explicit inside the strangler. CR050 establishes
metadata as mixed-engine semantic parent authority while migration `017`'s column
remains a derived projection. CR051 restores arbitrary-depth read/render parity. CR052
adds complete-ancestry validation and an atomic, meaning-preserving TS parent-movement
core seam without claiming Workspace/web routing. CR053 adds a transactional TS domain
seam that removes only an empty leaf after metadata-authoritative child detection and a
closed eleven-category association inventory. CR054 assigns the Workspace hierarchy
projection, deterministic web adapters, selected-scope evidence, and JavaScript
compatibility to CV22.DS7.US9; CV22.DS10 owns final web-process and package convergence.
This sequence demonstrates the moving-target rule:
released Python behavior becomes named TS parity work instead of silently freezing or
drifting.

---

## Delivery Stories

CV22 is governed by [Ariad](../ariad-adoption.md); its former epics became
Delivery Stories (`DS1`–`DS5` aligned one-to-one with the former `E1`–`E5`).
The former `E6` — *Convergence & Python Retirement* — proved too large for a
single Delivery Story and is split, risk-first, into `DS6`–`DS10` (see
[Decisions — CV22.DS6 splits into a risk-ordered retirement chain](../../decisions.md)).
Each Delivery Story expands into User/Technical Stories on pull — only the
active, authored, or completed expanded DS packages are linked here. DS8–DS9 stay as
delivery-level scope until pulled; DS10 now has an authored convergence gate because
CR054 proved that zero commands alone cannot safely authorize Python deletion.

| Code | Delivery Story | Done condition | Status |
|------|----------------|----------------|--------|
| [CV22.DS1](cv22-ds1-hybrid-search-parity-spike/index.md) | Hybrid-Search Parity Spike | A TS reimplementation of the hybrid ranker, reading the same SQLite file, reproduces Python's ordered results on synthetic data and on a real-DB snapshot; near-tie risk quantified | ✅ Done |
| [CV22.DS2](cv22-ds2-ts-foundation-read-only-parity/index.md) | TS Foundation & Read-Only Command Parity | Stand up the TS core (`node:sqlite`, BLOB/embedding read, frozen-`now` golden contract); reach ordered/behavioral parity for read-only deterministic commands (`search`, `detect-persona`, journeys, memory listing) on real-DB copies | ✅ Done |
| [CV22.DS3](cv22-ds3-pi-ts-front-door/index.md) | Pi TS Front Door | A TS front door on Pi that wraps unported Python entry points and routes transferred reads to the TS core; dogfooded daily; runtimes unaffected | ✅ Done |
| [CV22.DS4](cv22-ds4-deterministic-writes/index.md) | Deterministic Writes | Port write commands (journey/identity CRUD, `log_access`) with parity proven on DB copies; backup-gated; schema-compatible; CLI-write routing on the TS front door (identity + journey) | ✅ Done |
| [CV22.DS5](cv22-ds5-external-api-commands/index.md) | External-API Commands | Port extraction, embeddings/search, and consult behind replay-safe provider boundaries; route validated external command surfaces through the TS front door while preserving Python fallback for unsafe/unconfigured paths | ✅ Done |
| [CV22.DS6](cv22-ds6-schema-custody-transfer/index.md) | Schema Custody Transfer | Move all database creation, migration, and discipline from Python to TS — bootstrap DDL (rewritten in English per CV0), migration engine and `_migrations` bookkeeping, cross-process bootstrap locking, connection pragma discipline — proven over real legacy databases; plus the two schema decisions gated on custody (`identity.metadata` canonicalization, `parent_journey` first-class column) | ✅ Done — all children complete (TS1–TS5, US1–US3); TS owns bootstrap/migration/locking/pragmas, proven over real legacy copies including migration-016's real ADD-COLUMN + backfill; the deletion gate is cleared |
| [CV22.DS7](cv22-ds7-command-burn-down/index.md) | Command Burn-Down & Re-homed Feature Work | Port the remaining command surface to TS — the Builder/Ariad tree (re-homed CV20/CV21 in-flight work), Soul, Explorer, mirror-mode orchestration, remaining identity/journey reads and writes, and the extraction lifecycle — until the deterministic Python command surface is empty; complete the non-command Workspace/web hierarchy retirement rider | 🟢 In Progress — US1–US4 done (**4/11**); US5–US9 and TS1–TS2 remain; TS2 owns removal of US4's bounded extension-context fallback |
| CV22.DS8 | Live-Provider Cutover | Implement the `live` mode of the TS `LlmTransport` (chat + embeddings) with per-role timeouts, bounded retries, error taxonomy, and metadata-only logging (AI-18); route real external calls through TS; validated by live smoke contracts, not golden parity; multi-persona Plan review before implementation | 🟡 Planned |
| CV22.DS9 | TS MCP Server | Threat model first (RS005: localhost binding, per-tool permission scoping, tightest gate on identity-mutating tools; AI-19: per-tool rate/budget guards against denial-of-wallet), then port `python -m memory mcp` to TS | 🟡 Planned |
| [CV22.DS10](cv22-ds10-python-retirement-npm-distribution/index.md) | Python Retirement & npm Distribution | After zero commands, converge the complete Python web process/endpoint inventory and packaged assets; only then may deletion, rename, and npm distribution be planned under separate gates | 🟡 Planned — CR054 web convergence gate authored; DS10 not pulled |

---

## Security Riders (RS005)

Recorded by the security-engineer audit (RS005, CR033) so no future plan
checkpoint can claim these requirements were unknown:

- **Front-door observability (OPS CR026):** the front-door log records command
  names, routing decisions, layers/keys, and errors — **never argument
  payloads**. `--content` carries identity text and stdin can carry entire
  soul documents. A redaction test is part of the observability acceptance
  criteria.
- **DS5 external-API commands:** API keys (OpenRouter/Gemini/OpenAI) enter TS
  for the first time. Secure defaults are plan inputs, not review findings:
  keys are read from env/config only, never accepted as argv (process listings
  and shell history leak), never logged, redacted from error messages; DS5
  record/replay fixtures must be scrubbed of authorization headers before they
  are committed.
- **DS9 MCP server:** the plan must include a threat model before
  implementation — transport and binding (localhost-only by default),
  authentication story, per-tool permission scoping (read tools vs write tools
  vs identity-mutating tools), and abuse/rate considerations. Identity-mutating
  tools deserve the tightest gate: identity content feeds future system
  prompts (see the abuse-cases section of the runtime-interface spec).

## AI Engineering Riders (RS006 audit)

Recorded by the ai-engineer audit (the model-in-the-loop lens). Its live
Python-core reliability findings were re-homed to CV9 (stabilization on `main`);
these two are the genuinely-CV22 slice — DS5/DS8/DS9 plan inputs, kept here so no
future plan checkpoint can claim they were unknown:

- **DS5/DS8 LLM transport seam (AI-18):** the ported external-API path needs one TS
  `LlmTransport` (chat + embeddings) with three modes — `live`, `record`,
  `replay` — and, designed in as the contract rather than patched later:
  explicit per-role timeouts and bounded retries (the CV9 Python values are
  extraction 60s, reception 10s, embedding 15s, 2 retries), an error taxonomy
  (`timeout | auth | rate_limit | malformed_output | provider_error`), and
  metadata-only call logging. Replay fixtures assert the deterministic
  surroundings (request shape, parsing, storage transitions) — never model
  output equality; the live path gets a separate embedding smoke contract
  (dimension, finite values, self-similarity ≈ 1.0). Fixtures scrubbed of auth
  headers **and** of transcript/identity content (live-database-equivalent
  sensitivity). Embedding writes assert dimension and record provenance.
- **DS9 MCP denial-of-wallet (AI-19):** the DS9 MCP threat model must include
  the wallet. `search_memories` triggers a paid embedding call per invocation
  and extraction-class tools cost more, so an agent loop stuck on a tool is a
  denial-of-wallet vector against the user's own OpenRouter balance. Per-tool
  rate/budget guards (calls per minute; optional daily USD ceiling) belong in
  the plan, alongside the decision on whether agent-initiated searches reinforce
  the ranker.

Full audit and the CV9 backlog live at `docs/project/ai-engineering-audit.md`
(on `main`).

## Maintenance-Sync Riders

Recorded when a `main` maintenance fix is merged into the port branch, so the
obligation it creates for a not-yet-pulled Delivery Story is not rediscovered the
hard way:

- **DS7 slug parity (`kebab_slug`), from the v0.31.2 merge (`1c4e55a`):** the
  Builder fix consolidated four drifted Python `_slugify` copies into a single
  `memory.utils.kebab_slug` — strip accents → kebab → **hard 80-char cap**, with
  an empty result yielding the bare code folder (never a trailing-hyphen name) —
  to stop an `OSError: File name too long` crash in `build pull-item` on
  paragraph-length Story titles. That logic is **pure Python today**: no TS
  counterpart exists, and every slug-generating command (`build` lifecycle,
  explorer handoff) is Python fallback, so nothing is stale now and the
  oracle-drift tripwire correctly does not track it. When **DS7** ports the
  Builder/Ariad tree, the TS port **must** replicate this contract from one
  shared function used by *both* the path writer and the path locator — the
  original bug was writer/locator drift — and then register
  `src/memory/utils.py:kebab_slug` in `ts/parity/oracle-baseline.json` with a
  golden fixture. Related carried debt: **D-012** (candidate-table *code* cell
  still unsanitized) and **D-013** (`transcript_export.slugify` is a separate
  capped-kebab sibling), both in [`debt.md`](../../debt.md).

## Non-Goals

- **No big-bang rewrite.** The Python core is never replaced wholesale; it
  dissolves command by command behind a stable contract.
- **No untracked dual evolution.** Python may evolve where it still owns an entry
  point, but each behavior change creates named TS parity scope. After authority
  transfers, new behavior for that entry point lands in TS and Python is
  compatibility-only.
- **No behavior change.** This is parity, not improvement. The ranker, extraction,
  and memory semantics are reproduced, not redesigned. Improvements are separate,
  later work.
- **No schema or semantic change.** Existing `memory.db` must keep working;
  FTS5/tokenizer behavior is inherited from the shared file, not reimplemented.
- **No runtime disruption.** The runtimes must not notice which language answers a
  command during the transition.

---

## Sequencing

Risk-first, mirroring the decision spine:

1. **DS1 — parity spike** (done): prove the hardest thing (ranker parity) before
   committing to anything broader.
2. **DS2 — read-only parity** (done): the deterministic core, validated on real-DB copies.
3. **DS3 — Pi front door** (done): make the transition state durable and dogfooded; begin
   the command burn-down.
4. **DS4 — writes** (done): backup-gated, copy-validated parity plus CLI-write
   front-door routing (identity + journey).
5. **DS5 — external-API commands** (done): isolate non-determinism at the
   boundary behind replay-safe provider seams. Plan inputs recorded: the
   access-count read strategy (single `GROUP BY` with a parity probe — see
   [Decisions](../../decisions.md), *ports semantics, not query plans*) and
   the DS5 secrets rider above.
6. **DS6 — schema custody transfer** (✅ done): the deletion gate. Everything
   that creates, migrates, and disciplines the database — schema DDL, migration
   engine and `_migrations` bookkeeping, cross-process bootstrap locking,
   WAL/busy-timeout/FK pragmas — is now owned by the TS core, with compatibility
   proven over real legacy databases at multiple historical migration states
   (including migration-016's real ADD-COLUMN + backfill). Carried the two schema
   decisions gated on custody (`identity.metadata` canonicalization,
   `parent_journey` first-class column). The database no longer blocks retirement;
   actual Python deletion remains subject to DS7–DS10 command and non-command runtime
   convergence.

7. **DS7 — command burn-down & re-homed feature work** (in progress): port the
   remaining command surface — the Builder/Ariad tree (re-homed CV20/CV21
   in-flight work), Soul, Explorer, mirror-mode orchestration, remaining
   identity/journey reads and writes, and the extraction lifecycle — until the
   deterministic Python command surface is empty. US1 (identity/journey reads
   and writes), US2 (content & planning writes), and US3 (memory cultivation,
   the identity-write allowlist and injection fences ported at parity) are
   done; US4 (mirror-mode orchestration) is also done, moving DS7 from **3/11 to
   4/11**. Its approved Plan exposed a Python-only installed-extension context provider
   seam: US4 transferred the core path with an explicit matching-binding fallback, while
   DS7.TS2 owns eliminating that fallback without silent context loss or a permanent
   language bridge. US9 is the separately
   visible non-command Workspace/web hierarchy rider required
   before DS7 can finish.
8. **DS8 — live-provider cutover**: implement the `live` mode of the TS
   `LlmTransport` (AI-18) so real external calls leave Python; validated by
   live smoke contracts, not golden parity, and run through the multi-persona
   Plan review because it spends real money and carries real secrets.
9. **DS9 — TS MCP server**: threat model first (RS005 scoping rider, AI-19
   denial-of-wallet rider), then port `python -m memory mcp` to TS.
10. **DS10 — Python retirement & npm distribution**: after the command, provider, and
    MCP prerequisites, replace the complete Python web process and account for every
    endpoint/static asset. Deletion, rename, npm planning, and publication remain
    separate later gates. The MCP threat-model rider remains a DS9 plan input.

Part-time, no deadline — a background burn. The transition state (TS front door
over a still-evolving Python product at explicitly unported boundaries) is durable and
must stay comfortable to live in; no throwaway intermediate states. Capability-level
parity obligations make migration drift visible rather than blocking product evolution.

---

## Done Condition

CV22 is done when:

- Every CLI/MCP command is answered by the TS core with proven ordered/behavioral
  parity against the Python oracle.
- The Python-owned Workspace/web process, endpoints, and static assets have transferred
  to explicit TS owners with their required evidence.
- The Python core has **zero remaining command or Workspace/web authority** and is
  deleted.
- Existing `memory.db` files work unchanged; the schema/FTS5 compatibility
  contract held throughout.
- All runtimes (Pi first, then the CV21 package surface) operate over the TS core
  with no user-visible change.
- Mirror Mind is distributable through npm as a single-language package.

---

## References

- [Decisions — database-seam strangler](../../decisions.md)
- [CV22 Collaboration Strategy](collaboration-strategy.md)
- [Refinement Campaign — the five-audit code-quality sweep (RS001–RS005)](refinement/index.md)
- [CV21 — Runtime Expansion II](../cv21-runtime-expansion-ii/index.md)
- Parity harness: [`spikes/ts-search-parity/`](../../../../spikes/ts-search-parity/)
- [Architecture](../../../product/architecture.md)
- [Worklog](../../../process/worklog.md)
