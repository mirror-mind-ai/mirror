[< CV9 Mirror Mind 1.0](../index.md)

# CV9.E2 — Stabilization & Robustness

**Epic:** Harden failure modes so Mirror Mind degrades safely instead of breaking or corrupting runtime state  
**Status:** Planned, with CV9.E2.S3 production updater fix and CV9.E2.S4 conversation title hardening done
**Depends on:** CV9.E1 Boundary Hardening, except for isolated production-bug fixes that are already understood

---

## What This Is

CV9.E2 is the operational hardening epic. Mirror Mind already works across Pi,
Gemini CLI, Codex, and Claude Code, but 1.0 needs stronger behavior at the
edges: missing configuration, API instability, embedding failures, runtime hook
constraints, and partial writes.

The goal is not to hide errors. The goal is to make failure explicit, safe, and
recoverable.

---

## Stabilization Principles

1. **Never silently corrupt semantic state.** If an embedding cannot be created,
   the system should not pretend semantic search will work normally.
2. **Fail cleanly at the boundary.** Provider errors should become explicit
   domain-level failures with actionable messages.
3. **Prefer retry for transient provider instability.** Empty responses, rate
   limits, and temporary upstream failures should get bounded retries before the
   operation fails.
4. **No bad fallback vectors.** Zero vectors or fake embeddings are worse than a
   clean failure because they make future search behavior misleading.
5. **Runtime UX matters.** A failed memory operation should explain what happened
   and how to recover without exposing stack traces as the primary interface.

---

## Stories

| Code | Story | Status |
|------|-------|--------|
| [CV9.E2.S1](cv9-e2-s1-embedding-resilience/index.md) | Embedding Resilience | Planned |
| [CV9.E2.S2](cv9-e2-s2-external-extension-runtime-surface/index.md) | External Extension Runtime Surface Parity | Planned |
| [CV9.E2.S3](cv9-e2-s3-runtime-update-preflight-resilience/index.md) | Runtime Update Preflight Resilience | Done |
| [CV9.E2.S4](cv9-e2-s4-conversation-title-hardening/index.md) | Conversation Title Hardening | Done |

---

## Done Condition

CV9.E2 is done when:

- Embedding generation handles empty provider responses and transient failures
  with bounded retry and clear errors.
- Memory and attachment writes do not persist bad semantic state when embedding
  generation fails.
- Runtime-visible commands surface actionable error messages for common external
  failure modes.
- External extensions have a first-class skill discovery path across Pi, Claude
  Code, Gemini CLI, and Codex where the runtime supports project-local skills.
- The stabilization behavior is covered by focused unit tests and at least one
  CLI-level smoke/regression path where appropriate.

---

## See also

- [CV9 Mirror Mind 1.0](../index.md)
- [Development Guide](../../../../process/development-guide.md)
- [Runtime Interface Contract](../../../../product/specs/runtime-interface/index.md)
