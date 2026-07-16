[< Refinement Campaign](index.md)

# RS006 — AI engineering audit of the model-in-the-loop surfaces

**Lens:** ai-engineer · **CRs:** CR036–CR055 (20) · **Status:** captured — execution not started

> *AI engineering audit of the model-in-the-loop surfaces (authored by the ai-engineer persona).*

## Framing

The sixth lens, run after the five-audit campaign closed. RS001–RS005 audited
the code, the trust, the data, the operations, and the attack surface of the
CV22 TypeScript core. This story audits the **model as a dependency** — the
half of the system the campaign deliberately did not reach: LLM calls,
embeddings, retrieval scoring, the extraction pipeline, evals, cost, and
degradation behavior.

Scope is therefore wider than `ts/`: the findings live mostly in the Python
intelligence layer (`src/memory/intelligence/`, the conversation-end pipeline,
consult, MCP tools) — which is exactly the surface **CV22.DS5 will port**. The
strategy is the same one the campaign proved: fix the live-data exposures as
maintenance-class Python work now, and encode each fix as a DS5/DS6 acceptance
criterion so the port cannot inherit the gap.

The pair this lens holds is **capability vs. reliability**: the capability is
proven (DS1 spike, DS2 golden corpus, daily dogfooding); the findings are all
about what the system does at its worst — provider outage at session end, a
deprecated model pin, an agent loop hammering the paid search path — and
whether anyone would see it happen.

Full evidence, failure-layer analysis, positive ledger, and verification
routes: [AI Engineering Audit](../../../ai-engineering-audit.md) (findings
AI-01…AI-21).

## How this document differs from RS001–RS005

The five campaign documents were written **after** execution, recording each
CR's resolution with its commit hash. This one is written at **composition**:
the CRs are captured in the Workbench but not started. As CRs execute, their
entries below gain the same problem/resolution/commit format the campaign
established. Until then, this document is the campaign-folder anchor for the
story — the durable, roadmap-adjacent record that RS006 exists and what it
covers.

## Change requests

Tiering follows the campaign method: live silent-failure exposure first, then
decisions that get more expensive after DS5/DS6 planning, then leverage per
effort.

### P0 — silent failures live today

| CR | Finding | Title |
|----|---------|-------|
| CR036 | AI-01 | Add explicit timeouts to all LLM and embedding calls |
| CR037 | AI-02 | Isolate poison-pill conversations in pending extraction loops |
| CR038 | AI-03 | Make conversation extraction idempotent across partial failure |
| CR039 | AI-04 | Degrade search to FTS-only when embeddings are unavailable |
| CR041 | AI-06 | Model pin env overrides and a diagnose reachability probe |
| CR047 | AI-12 | Stop internal machinery from polluting the reinforcement signal |

### P1 — evidence, boundaries, and plan inputs

| CR | Finding | Title |
|----|---------|-------|
| CR040 | AI-05 | Budget the session-maintenance extraction run |
| CR042 | AI-07 | Record embedding provenance and assert dimensions at write time |
| CR044 | AI-09 | Metadata-only LLM call logging by default and a single cost authority |
| CR045 | AI-10 | Distinguish extraction failure from no-signal in conversation metadata |
| CR046 | AI-11 | Persist eval reports, cover missing surfaces, write the model upgrade playbook |
| CR048 | AI-13 | Collapse the per-memory access-count N+1 into one GROUP BY |
| CR050 | AI-15 | Validate and cap extraction output at the storage seam |
| CR051 | AI-16 | Fence transcripts against prompt injection plus an adversarial eval probe |
| CR053 | AI-18/19 | Write the AI engineering riders into the CV22 index for DS5/DS6 planning |
| CR054 | AI-20 | Decide and record the shipped intelligence-flag posture for 1.0 |

### P2 — refinements once the evidence base exists

| CR | Finding | Title |
|----|---------|-------|
| CR043 | AI-08 | Optional fallback model for the background pipeline |
| CR049 | AI-14 | Labeled retrieval relevance eval (hit@k / MRR) |
| CR052 | AI-17 | Consult privacy posture — minimal context, call logging, honest FX |
| CR055 | AI-21 | Surface journey-less extraction skips in maintenance reporting |

## Cross-links into the campaign

- **CR047** protects the honest-reinforcement design the DS1/DS2 parity work
  proved; it applies the CR020 spirit (decided contracts over drift) to the
  signal itself.
- **CR048** applies the recorded CR020 decision (*ports semantics, not query
  plans* — single `GROUP BY` with a parity probe) to the Python side as
  maintenance.
- **CR044** extends the CR026 metadata-only, structurally-redacted
  observability posture from the front door to LLM calls, honoring the CR033
  rider (never record content payloads).
- **CR051** is the content-mediated variant of the CR032 identity-poisoning
  abuse family, entering through extraction instead of `identity set`.
- **CR053** writes the DS5 transport-seam and DS6 denial-of-wallet riders next
  to the RS005 security riders in the [CV22 index](../index.md).

**See also:** [AI Engineering Audit](../../../ai-engineering-audit.md) ·
[Campaign index](index.md) · [CV22 index](../index.md) ·
[Decisions](../../../decisions.md)
