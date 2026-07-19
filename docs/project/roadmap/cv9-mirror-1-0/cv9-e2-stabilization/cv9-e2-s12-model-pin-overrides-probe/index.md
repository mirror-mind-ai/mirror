[< CV9.E2](../index.md)

# CV9.E2.S12 — Model-Pin Overrides & Reachability Probe

**Status:** Done — Navigator validated 2026-07-16
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** [AI Engineering Audit — AI-06](../../../../ai-engineering-audit.md) (P0)

---

## User-visible outcome

A deployed Mirror can be repointed to a new model without a release, and
`runtime diagnose` warns — with the exact fix — when a pinned model no longer
resolves on OpenRouter. Model deprecation stops being a silent, weeks-long
failure of memory, titles, and tags.

---

## Problem

`EXTRACTION_MODEL` and `EMBEDDING_MODEL` are hard-coded in `config.py` and, unlike
the MMR/reinforcement knobs, are not env-overridable. When a model is
deprecated — a certainty on a 1.0 maintenance timescale — every extraction call
404s, and because those paths fail soft (`[]`/`""`), the system degrades
**silently**: no memories, no titles, no tags, for weeks, with nothing telling
the user. `runtime diagnose` has no check that the pins still resolve. The audit
calls this the single most likely long-term failure of the shipped product.

---

## Scope

- **Env overrides.** `EXTRACTION_MODEL` / `EMBEDDING_MODEL` read
  `MEMORY_EXTRACTION_MODEL` / `MEMORY_EMBEDDING_MODEL`, defaulting to today's
  pins — an installed 1.0 can be repointed with an env var.
- **Reachability probe.** `runtime diagnose` performs one cheap OpenRouter
  `/models` lookup and emits an `attention` finding when the **extraction** pin
  is not present, with the env-override remedy. The embedding pin is not
  catalog-verifiable — OpenRouter's `/models` lists completion models only (zero
  embedding models), so flagging it there would be a false positive; an
  embedding-model failure instead surfaces through degraded search
  ([CV9.E2.S10](../cv9-e2-s10-search-offline-degradation/index.md)) and
  extraction quarantine (CV9.E2.S7). Any fetch failure (offline / no key) is
  inconclusive and yields no finding, so diagnose stays green offline.
- **Status visibility.** `runtime status` prints the effective model pins next
  to the AI-01 timeout line.

Part 3 of the audit finding (persistent-failure visibility at session start) is
already delivered by [CV9.E2.S7](../cv9-e2-s7-extraction-failure-isolation/index.md)'s
session-maintenance quarantine line.

---

## Non-goals

- Probing all of `LLM_FAMILIES` (consult models are secondary to the pipeline
  pins).
- A live 1-token embedding probe to verify the embedding pin against a real
  call (the audit's opt-in variant) — embedding failure is already caught
  reactively by S10 / S7.
- A quarantine `runtime diagnose` finding (S7's session line covers part 3).

---

## Done condition

- `MEMORY_EXTRACTION_MODEL` / `MEMORY_EMBEDDING_MODEL` change the effective pins.
- `probe_model_pins()` warns on a missing extraction pin with the override
  remedy, does not flag the embedding pin (absent from the completion-only
  catalog), and is inconclusive (no finding) when the catalog cannot be fetched.
- `runtime status` shows the pins.
- Full unit + integration suite (keyless), ruff, and mypy gates green.

---

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [AI Engineering Audit — AI-06](../../../../ai-engineering-audit.md)
