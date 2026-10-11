[< CV9 Mirror Mind 1.0](../index.md)

# CV9.DS7 — Conversation Metadata Lifecycle

**Status:** ✅ Done  
**Source:** [ES-001 Conversation Metadata Lifecycle](../../../exploration/es-001-conversation-metadata-lifecycle.md)  
**Exploration summary:** [exploration-summary.md](exploration-summary.md)

---

## Delivery Story Seed

When a conversation begins and evolves, Mirror updates user-facing conversation
metadata through a lifecycle: title, summary, tags, and metadata state are
created, repaired, or refined according to per-field readiness rather than one
narrow retitle trigger.

---

## Why This Is a Delivery Story

This is not one implementable User Story. The Exploration handoff contains a
larger arc:

- lifecycle policy for title, summary, tags, provenance, confidence, readiness,
  and lock state;
- replayable validation over known conversation shapes;
- an observable dry-run or diagnostic path before mutation;
- later safe application in conversation metadata updates.

The Delivery Story expansion has been accepted. No implementation plan has been created yet; planning begins only after a child User Story or Technical Story is pulled.

---

## Accepted Child Stories

| Code | Type | Story | Status |
|------|------|-------|--------|
| [CV9.DS7.TS1](cv9-ds7-ts1-metadata-lifecycle-decision-policy/index.md) | Technical Story | Metadata Lifecycle Decision Policy | Done |
| [CV9.DS7.US1](cv9-ds7-us1-dry-run-metadata-lifecycle-decision-path/index.md) | User Story | Dry-run Metadata Lifecycle Decision Path | Done |
| [CV9.DS7.TS2](cv9-ds7-ts2-extract-metadata-lifecycle-policy-boundary/index.md) | Technical Story | Extract Metadata Lifecycle Policy Boundary | Done |
| [CV9.DS7.TS3](cv9-ds7-ts3-bounded-metadata-lifecycle-apply-service/index.md) | Technical Story | Bounded Metadata Lifecycle Apply Service | Done |
| [CV9.DS7.US2](cv9-ds7-us2-apply-metadata-lifecycle-decisions/index.md) | User Story | Apply Metadata Lifecycle Decisions Safely | Done |
| [CV9.DS7.US3](cv9-ds7-us3-metadata-lifecycle-operation-report/index.md) | User Story | Metadata Lifecycle Operation Report | Done |
| [CV9.DS7.US4](cv9-ds7-us4-contextual-conversation-metadata-maintenance/index.md) | User Story | Contextual Conversation Metadata Maintenance | Done |
| [CV9.DS7.TS4](cv9-ds7-ts4-metadata-update-execution-profiles/index.md) | Technical Story | Metadata Update Execution Profiles | Done |
| [CV9.DS7.US8](cv9-ds7-us8-historical-metadata-backfill-preview/index.md) | User Story | Historical Metadata Backfill Preview | Done |
| [CV9.DS7.US9](cv9-ds7-us9-historical-metadata-backfill-apply/index.md) | User Story | Historical Metadata Backfill Apply | Done |
| [CV9.DS7.US5](cv9-ds7-us5-close-time-metadata-update/index.md) | User Story | Close-time Metadata Update | Done |
| [CV9.DS7.US10](cv9-ds7-us10-web-historical-metadata-backfill-operation/index.md) | User Story | Web Historical Metadata Backfill Operation | Done |

---

## Validation Seed

Replay sample conversations with generic, meaningful, and scope-changing
openings. Verify title, summary, tags, metadata readiness/provenance, and
refinement behavior while preserving manual title locks.

---

## Boundaries

In scope for this Delivery Story:

- conversation title lifecycle;
- summary and tag readiness;
- metadata provenance, confidence, lock state, readiness, and update source;
- dry-run or diagnostic evidence before mutation;
- preservation of manual/user-edited title locks.

Out of scope for this Delivery Story unless explicitly expanded later:

- journey inference after conversation start;
- broad autonomous per-turn metadata intelligence before close-time and backfill profiles are proven.

---

## Execution Tracks

### Runtime Metadata Lifecycle

Goal: Mirror updates metadata intelligently as new conversations unfold.

Sequence:

1. [CV9.DS7.TS4](cv9-ds7-ts4-metadata-update-execution-profiles/index.md) — make execution profiles explicit.
2. [CV9.DS7.US5](cv9-ds7-us5-close-time-metadata-update/index.md) — finalize non-manual metadata at conversation close.
3. Later: first-exchange initialization and active refresh cadence.

### Historical Metadata Backfill

Goal: existing conversations become useful in the web surface.

Sequence:

1. [CV9.DS7.TS4](cv9-ds7-ts4-metadata-update-execution-profiles/index.md) — define safe/force semantics.
2. [CV9.DS7.US8](cv9-ds7-us8-historical-metadata-backfill-preview/index.md) — preview old conversations.
3. [CV9.DS7.US9](cv9-ds7-us9-historical-metadata-backfill-apply/index.md) — apply reviewed backfill with safe/force modes.
4. [CV9.DS7.US10](cv9-ds7-us10-web-historical-metadata-backfill-operation/index.md) — expose web preview/apply, resume scopes, production progress, and orphan cleanup.

---

## Closure

Closed on 2026-09-26 by the Navigator's decision, after
[CR002](../../../refinement/rs001-ariad-runtime-trust/cr002-cursor-sync-roadmap-selection.md)
showed this package's status reading as Active to every Builder journey on the project.
Ten children were Done. TS2 and TS3 had been validated and never formally closed:
TS2 paid the debt it existed for (D-001, below), and TS3 records its verification.
The lifecycle they built shipped, was ported to TypeScript by
[CV22.DS7.US10](../../cv22-typescript-core-port/cv22-ds7-command-burn-down/cv22-ds7-us10-extraction-lifecycle-session-composites/index.md)
(`ts/src/conversation/metadataLifecycle.ts`), and the Python both stories touched was
deleted in CV22.DS10.TS5. Nothing remained to deliver here; the evidence-ranking
improvement under Follow-up and Debt stays a possible future improvement.

---

## Follow-up and Debt

- Improve evidence term filtering/ranking for metadata lifecycle reports. Current
  `refine_candidate` evidence is useful enough for candidate signaling, but may
  include noisy tokens from paths, timestamps, or generic connective words.
- Debt ledger: [D-001 Metadata lifecycle policy and evidence filtering live inside ConversationService](../../../debt.md#d-001--metadata-lifecycle-policy-and-evidence-filtering-live-inside-conversationservice) was paid by TS2. Evidence term filtering/ranking remains a possible future improvement, but the policy boundary is no longer embedded directly in `ConversationService`.
