[< Story](index.md)

# Plan — CV13.E5.S7 Operations surface polish and release coherence

## Implementation plan

1. Replace the primary raw JSON result block with operation-specific result cards:
   - runtime health: status, version, database, git, migrations/extensions,
   - database backup: backup path, verification status, archive entries, recovery route,
   - conversation repair: candidate count, applied count, backup path, candidate list.
2. Keep raw JSON in a collapsed `<details>` element labeled as raw evidence.
3. Improve recent audit history cards to show operation, status/outcome, timestamp, key parameters, and summary without requiring JSON reading.
4. Add safety boundary copy near the Operations hero.
5. Update E5 roadmap wording to describe v0.15 as synchronous-first and move job/streaming/cancellation to explicit future stories or backlog notes.
6. Run automated checks.
7. Stop for manual browser validation.

## Design boundaries

- This is polish and coherence, not a new operation architecture.
- The page remains catalog-driven.
- Raw evidence stays available for trust and debugging.
- No new endpoint should be needed.
- No broad theme redesign.

## Risks and mitigations

- Risk: polish hides evidence. Mitigation: keep raw JSON collapsible.
- Risk: polish implies background execution. Mitigation: explicit synchronous-first copy.
- Risk: release language promises future streaming too strongly. Mitigation: update roadmap to separate current release from future job/streaming work.

## Verification approach

- Automated checks remain focused on existing web/API/service coverage and JS syntax.
- Manual validation confirms operation results are understandable without opening raw JSON.
