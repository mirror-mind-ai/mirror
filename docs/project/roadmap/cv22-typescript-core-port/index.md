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
Python core dissolving one observable **command** at a time, governed by a rule
that **new feature work lands in TS** (Python freezes to maintenance-only as of
the [last Python baseline commit](../../../process/worklog.md), CV21.E2.S2). The
**database is the seam** — two cores, one `memory.db`, one schema and FTS5 config,
no in-process language bridge. The hard part was never the language; it is the
**convergence discipline** that keeps two cores from both growing while one is
supposed to be dying.

---

## Spike Findings (evidence-based)

The riskiest assumption — *can a TS core replicate Mirror's subtlest behavior
against the real database?* — was attacked first. The subtlest behavior is the
hybrid ranker (semantic + recency + honest reinforcement + manual relevance +
ordinal lexical + MMR dedup). Spike: [CV22.E1](cv22-e1-hybrid-search-parity-spike/index.md),
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

Residual gaps the spike did **not** close (carried into later epics): the live
`query → embedding → search` path with a fresh OpenAI embedding (E5), the write
commands (E4), and behavior at larger scale (the ranker is a full scan + cosine
per row).

---

## Strangler Mechanics (the load-bearing decisions)

- **Seam — the database.** The SQLite file is the language-neutral integration
  point. Read-only commands may run live; any write stays with Python until its
  ported version passes golden tests against a **copy** of `memory.db` (never the
  live file; back up first).
- **Unit — the command.** Strangle by CLI/MCP command, whose contract is
  observable as `command + args → stdout`. Progress is a visible burn-down:
  *commands-on-TS / total*. Done when the Python core has zero commands and is
  deleted.
- **Front door — Pi.** The first TS surface wraps the frozen Python engine and is
  strangled command-by-command behind it, dogfooded daily in the runtime both
  authors use.
- **Parity oracle — the Python test suite.** Converted into a language-agnostic
  golden-data corpus (frozen `now` + frozen embeddings) that the TS core must
  satisfy.
- **Schema is frozen.** The SQLite schema and FTS5 config are a compatibility
  contract; existing user databases must keep working. Changes require explicit
  migration discipline.

---

## Epics

| Code | Epic | Done condition | Status |
|------|------|----------------|--------|
| [CV22.E1](cv22-e1-hybrid-search-parity-spike/index.md) | Hybrid-Search Parity Spike | A TS reimplementation of the hybrid ranker, reading the same SQLite file, reproduces Python's ordered results on synthetic data and on a real-DB snapshot; near-tie risk quantified | ✅ Done |
| CV22.E2 | TS Foundation & Read-Only Command Parity | Stand up the TS core (`node:sqlite`, BLOB/embedding read, frozen-`now` golden contract); reach ordered/behavioral parity for read-only deterministic commands (`search`, `detect-persona`, journeys, memory listing) on real-DB copies | 🟡 Planned |
| CV22.E3 | Pi TS Front Door | A TS front door on Pi that wraps the frozen Python engine and routes ported read commands to the TS core; dogfooded daily; runtimes unaffected | 🟡 Planned |
| CV22.E4 | Deterministic Writes | Port write commands (journey/identity CRUD, `log_access`) with parity proven on DB copies; backup-gated; schema-compatible | 🟡 Planned |
| CV22.E5 | External-API Commands | Port extraction (Gemini), embeddings (OpenAI), and consult; record/replay for non-determinism; live embedding-determinism contract; the end-to-end fresh-query path | 🟡 Planned |
| CV22.E6 | Convergence & Python Retirement | TS MCP server; re-home unfinished CV20 Ariad / CV21 MCP feature work to TS; burn down to a deletable Python core; reconsider the `memory → mirror` package rename; npm distribution | 🟡 Planned |

---

## Non-Goals

- **No big-bang rewrite.** The Python core is never replaced wholesale; it
  dissolves command by command behind a stable contract.
- **No new Python features.** Python is maintenance-only from the last baseline
  forward; new feature work lands in TS.
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

1. **E1 — parity spike** (done): prove the hardest thing (ranker parity) before
   committing to anything broader.
2. **E2 — read-only parity**: the deterministic core, validated on real-DB copies.
3. **E3 — Pi front door**: make the transition state durable and dogfooded; begin
   the command burn-down.
4. **E4 — writes**: backup-gated, copy-validated.
5. **E5 — external-API commands**: isolate non-determinism at the boundary.
6. **E6 — convergence & retirement**: TS MCP server, re-homed feature work, Python
   core deleted, npm distribution.

Part-time, no deadline — a background burn. The transition state (TS front door
over a frozen Python engine) is durable and must stay comfortable to live in; no
throwaway intermediate states.

---

## Done Condition

CV22 is done when:

- Every CLI/MCP command is answered by the TS core with proven ordered/behavioral
  parity against the Python oracle.
- The Python core has **zero remaining commands** and is deleted.
- Existing `memory.db` files work unchanged; the schema/FTS5 compatibility
  contract held throughout.
- All runtimes (Pi first, then the CV21 package surface) operate over the TS core
  with no user-visible change.
- Mirror Mind is distributable through npm as a single-language package.

---

## References

- [Decisions — database-seam strangler](../../decisions.md)
- [CV21 — Runtime Expansion II](../cv21-runtime-expansion-ii/index.md)
- Parity harness: [`spikes/ts-search-parity/`](../../../../spikes/ts-search-parity/)
- [Architecture](../../../product/architecture.md)
- [Worklog](../../../process/worklog.md)
