[< CV9 Mirror Mind 1.0](../index.md)

# CV9.E2 — Stabilization & Robustness

**Epic:** Harden failure modes so Mirror Mind degrades safely instead of breaking or corrupting runtime state  
**Status:** Planned, with CV9.E2.S1 embedding resilience done, CV9.E2.S3 production updater fix, CV9.E2.S4 conversation title hardening, CV9.E2.S5 backup destination resolution, and CV9.E2.S6 runtime state home containment done; CV9.E2.S7 extraction failure isolation and CV9.E2.S8 mirror-state connection lifecycle done, CV9.E2.S9 extraction idempotency done, CV9.E2.S10 search offline degradation done, CV9.E2.S11 reinforcement signal integrity done, CV9.E2.S12 model-pin overrides & probe done, CV9.E2.S13 LLM cost authority & metadata-default logging done, CV9.E2.S14 LLM spend summary & consult ledger done, CV9.E2.S15 extraction boundary hardening done, CV9.E2.S16 extraction status legibility done, CV9.E2.S17 embedding provenance done, CV9.E2.S18 embedding call observability done, CV9.E2.S19 eval run persistence done, CV9.E2.S20 scene-synthesis eval probe done, CV9.E2.S21 scene read-model fencing done, CV9.E2.S22 shadow-scan eval probe + proactive fence done (10/10 clean), CV9.E2.S23 consolidation probe + fence + identity-write allowlist done (10/10 clean, AI-23 closed), CV9.E2.S24 aggregate `eval --all` runner + model-upgrade playbook + release gate done (AI-11 item 3, with a silently-broken `.gitignore` pattern fixed in-cycle), CV9.E2.S25 journal + conversation-metadata eval probes done (closes AI-11 fully and AI-24), CV9.E2.S26 budgeted maintenance extraction done (closes AI-05), CV9.E2.S27 search access-count N+1 collapse done (closes AI-13), CV9.E2.S28 retrieval relevance instrument done (addresses AI-14, registered new finding AI-25), CV9.E2.S29 fenced the title/tags/summary injection family done (closes AI-25, registered new debt D-009), and CV9.E2.S30 widened `DISTANCING_MARKERS`'s reported-speech recognition done (closes D-009 — summary residual improved 8/10 → 9/10 pre-registered, no regression on scene/shadow/consolidate, title_tags confirmed structurally unaffected — and registered new debt D-010, a pre-existing whole-text/non-proximity matching limitation found via adversarial stress-testing); conversation metadata lifecycle identified as [CV9.DS7](../cv9-ds7-conversation-metadata-lifecycle/index.md). The [AI Engineering Audit](../../../ai-engineering-audit.md) supplies the model-in-the-loop stabilization backlog (AI-01 timeouts landed on `main`; AI-02 is S7; AI-09 observability & cost delivered across CV9.E2.S13 and CV9.E2.S14 (both done, AI-09 closed); AI-15/AI-16 extraction boundary hardening is CV9.E2.S15 (done, AI-15/AI-16 closed); AI-10 extraction status legibility is CV9.E2.S16 (done, AI-10 closed); AI-07 embedding provenance is CV9.E2.S1 (shape guard) + CV9.E2.S17 (provenance, done, AI-07 closed); AI-11 eval coverage is CV9.E2.S19 (persistence, done) and CV9.E2.S20 (scene-synthesis probe, done — its injection probe found a live grounding gap on the first run, spun off as new finding AI-22); AI-22 scene fencing is CV9.E2.S21 (done — fence + corrected obedience-measuring probe, 9/10 resisted with residual documented, AI-22 closed); AI-11 item 2's shadow surface is CV9.E2.S22 (done — proactively fenced, shared fence_untrusted/asserted_in_own_voice helpers extracted, 10/10 clean pre-registered measurement); AI-11 item 2's consolidation surface is CV9.E2.S23 (done — probe + proactive fence + a new identity-write layer allowlist, 10/10 clean pre-registered measurement, AI-23 closed — the thread's first CI-enforced behavioral guard); AI-11 item 3 (aggregate `eval --all` runner, model-upgrade playbook, and release gate) is CV9.E2.S24 (done); AI-11 item 2's last surfaces (journal classification, conversation title/tags) are CV9.E2.S25 (done) — **AI-11 is now fully closed** (item 1 S19, item 2 S20/S22/S23/S25, item 3 S24). AI-24 (journal layer bypassed allowlist) found and closed in S25; **AI-05** (unbounded maintenance extraction spend) is CV9.E2.S26 (done — capped, oldest-first, carried-over count visible in the maintenance report); **AI-13** (search N+1) is CV9.E2.S27 (done — collapsed to one batched `GROUP BY` query, a deterministic call-count invariant gates it in CI, and an opt-in 10k benchmark reports actual latency without gating); **AI-14** (retrieval relevance never measured) is CV9.E2.S28 (done — a frozen, deterministic 30-memory/18-query hit@k+MRR instrument, baseline 18/18 hit@5, MRR 0.9074, proven to detect a real weight regression). CV9.E2.S28 also found, while verifying with a real `eval --all` run, that S25's `title_tags`/`journal` structural contracts were never actually checked and that `title_tags`'s injection probe had never executed due to a call-signature bug — both fixed, and the now-executable probe surfaced a genuine new finding, **AI-25** (unfenced `CONVERSATION_TITLE_PROMPT`, same family as AI-16/AI-22), registered but deliberately not fixed in that story. **AI-25** is CV9.E2.S29 (done — fenced title/tags/summary; the standard fence+sandwich template alone was insufficient (0/15 live), closed only after a concrete worked counter-example for title/tags (10/10) and a Tag-Rules-level fix for a second, tags-specific leak (10/10); summary measured 8/10, a documented residual traced to an incomplete probe heuristic, registered as **D-009**, not a confirmed model failure).
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
| [CV9.E2.S1](cv9-e2-s1-embedding-resilience/index.md) | Embedding Resilience | Done |
| [CV9.E2.S2](cv9-e2-s2-external-extension-runtime-surface/index.md) | External Extension Runtime Surface Parity | Planned |
| [CV9.E2.S3](cv9-e2-s3-runtime-update-preflight-resilience/index.md) | Runtime Update Preflight Resilience | Done |
| [CV9.E2.S4](cv9-e2-s4-conversation-title-hardening/index.md) | Conversation Title Hardening | Done |
| [CV9.E2.S5](cv9-e2-s5-backup-destination-resolution/index.md) | Backup Destination Resolution & `BACKUP_DIR` Demotion | Done |
| [CV9.E2.S6](cv9-e2-s6-runtime-state-home-containment/index.md) | Runtime State Home Containment | Done |
| [CV9.E2.S7](cv9-e2-s7-extraction-failure-isolation/index.md) | Extraction Failure Isolation & Quarantine (AI-02) | Done |
| [CV9.E2.S8](cv9-e2-s8-mirror-state-connection-lifecycle/index.md) | Mirror Mode State Hook Connection Lifecycle | Done |
| [CV9.E2.S9](cv9-e2-s9-extraction-idempotency/index.md) | Extraction Idempotency Across Partial Failure (AI-03) | Done |
| [CV9.E2.S10](cv9-e2-s10-search-offline-degradation/index.md) | Search Offline / No-Key Degradation (AI-04) | Done |
| [CV9.E2.S11](cv9-e2-s11-reinforcement-signal-integrity/index.md) | Reinforcement Signal Integrity (AI-12) | Done |
| [CV9.E2.S12](cv9-e2-s12-model-pin-overrides-probe/index.md) | Model-Pin Overrides & Reachability Probe (AI-06) | Done |
| [CV9.E2.S13](cv9-e2-s13-llm-cost-authority-metadata-logging/index.md) | LLM Call Cost Authority & Metadata-Default Logging (AI-09) | Done |
| [CV9.E2.S14](cv9-e2-s14-llm-spend-summary-consult-ledger/index.md) | LLM Spend Summary & Consult Ledger (AI-09) | Done |
| [CV9.E2.S15](cv9-e2-s15-extraction-boundary-hardening/index.md) | Extraction Boundary Hardening (AI-15, AI-16) | Done |
| [CV9.E2.S16](cv9-e2-s16-extraction-status-legibility/index.md) | Extraction Status Legibility (AI-10) | Done |
| [CV9.E2.S17](cv9-e2-s17-embedding-provenance/index.md) | Embedding Provenance (AI-07) | Done |
| [CV9.E2.S18](cv9-e2-s18-embedding-call-observability/index.md) | Embedding Call Observability (D-003, AI-09 tail) | Done |
| [CV9.E2.S19](cv9-e2-s19-eval-run-persistence/index.md) | Eval Run Persistence & Trend (AI-11) | Done |
| [CV9.E2.S20](cv9-e2-s20-scene-synthesis-eval-probe/index.md) | Scene-Synthesis Eval Probe (AI-11; found AI-22) | Done |
| [CV9.E2.S21](cv9-e2-s21-fence-scene-read-model/index.md) | Fence the Scene Read Model (AI-22) | Done |
| [CV9.E2.S22](cv9-e2-s22-shadow-scan-eval-probe/index.md) | Shadow-Scan Eval Probe + Proactive Fence (AI-11) | Done |
| [CV9.E2.S23](cv9-e2-s23-consolidation-eval-probe-identity-allowlist/index.md) | Consolidation Probe + Fence + Identity-Write Allowlist (AI-11, AI-23) | Done |
| [CV9.E2.S24](cv9-e2-s24-model-upgrade-playbook-release-eval-gate/index.md) | Model-Upgrade Playbook & Release Eval Gate (AI-11) | Done |
| [CV9.E2.S25](cv9-e2-s25-journal-metadata-eval-probes/index.md) | Journal & Conversation-Metadata Eval Probes (closes AI-11, AI-24) | Done |
| [CV9.E2.S26](cv9-e2-s26-budgeted-maintenance-extraction/index.md) | Budgeted Maintenance Extraction (closes AI-05) | Done |
| [CV9.E2.S27](cv9-e2-s27-search-access-count-n1/index.md) | Search Access-Count N+1 Collapse (closes AI-13) | Done |
| [CV9.E2.S28](cv9-e2-s28-retrieval-relevance-instrument/index.md) | Retrieval Relevance Instrument (addresses AI-14, found AI-25) | Done |
| [CV9.E2.S29](cv9-e2-s29-fence-title-tags-summary/index.md) | Fence Title/Tags/Summary Injection Family (closes AI-25) | Done |
| [CV9.E2.S30](cv9-e2-s30-widen-distancing-markers/index.md) | Recognize Reported-Speech Framing In DISTANCING_MARKERS (closes D-009, registers D-010) | Done |

---

## Done Condition

CV9.E2 is done when:

- Embedding generation handles empty provider responses and transient failures
  with bounded retry and clear errors.
- Memory and attachment writes do not persist bad semantic state when embedding
  generation fails.
- Runtime-visible commands surface actionable error messages for common external
  failure modes.
- [Conversation metadata lifecycle](../cv9-ds7-conversation-metadata-lifecycle/index.md)
  behavior prevents weak title/summary state from becoming durable user-facing
  metadata while preserving manual edits.
- External extensions have a first-class skill discovery path across Pi, Claude
  Code, Gemini CLI, and Codex where the runtime supports project-local skills.
- The stabilization behavior is covered by focused unit tests and at least one
  CLI-level smoke/regression path where appropriate.

---

## See also

- [CV9 Mirror Mind 1.0](../index.md)
- [AI Engineering Audit — model-in-the-loop stabilization backlog (AI-01 done; AI-02…AI-21 open)](../../../ai-engineering-audit.md)
- [Development Guide](../../../../process/development-guide.md)
- [Runtime Interface Contract](../../../../product/specs/runtime-interface/index.md)
