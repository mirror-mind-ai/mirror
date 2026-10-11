[< Exploration index](index.md)

# Re-entry Checklist: Journey Working Agreements

Use this checklist before converting the exploration into active roadmap or Builder work.
A checked box must refer to current repository evidence, not the captured `v0.31.9`
source package.

## Priority And Authority

- [ ] The Navigator has made Journey Working Agreements a current product priority.
- [ ] The intended journey and delivery branch are explicit.
- [ ] The canonical Refinement Workbench has been inspected; no unrelated active work is
      being silently absorbed.
- [ ] The decision to create a new CV, extend an existing CV, or keep the work deferred
      has been reconsidered against the live roadmap.

## CV22 Readiness

- [ ] CV22.DS7.US4 has a stable TS Mirror Mode orchestration contract or its replacement
      is clearly identified.
- [ ] The active authority for journey/persona resolution, reception, context assembly,
      runtime session state, attachments, and extension context is known per entry point.
- [ ] CV22.DS8's live provider interface is implemented or sufficiently concrete for
      profile-classification and proposal-generation planning.
- [ ] TS remains schema and migration authority.
- [ ] The current Python compatibility boundary is documented.
- [ ] Web process and asset ownership are known before planning any web surface.

## Live Repository Grounding

- [ ] Read the current architecture, decisions, engineering principles, development
      guide, CV22 roadmap, and collaboration strategy completely.
- [ ] Inspect the live Mirror Mode, reception, provider, runtime-session, identity,
      attachment, extension, front-door, schema, migration, and journey-removal code.
- [ ] Rediscover the next migration id; do not assume `018`.
- [ ] Verify current table names, constraints, schema-inventory checks, and legacy
      migration fixtures.
- [ ] Verify current Pi, Claude Code, Gemini CLI, Codex, plugin, MCP, and web integration
      shapes.
- [ ] Compare the source package's likely-file list against the live tree and record
      every stale path or replaced seam.

## Product Decisions To Confirm

- [ ] Dedicated contract/proposal tables versus another current persistence design.
- [ ] Language-neutral contract schema and versioning policy.
- [ ] Explicit profile versus explicit persona conflict semantics.
- [ ] Initial supported modes; Mirror-only remains the default hypothesis.
- [ ] Initial context source types; `project_file`-only remains the default hypothesis.
- [ ] Profile, source, instruction, example, and token budgets.
- [ ] Ambiguity/confidence behavior and whether reception remains one call.
- [ ] Proposal source retention and foreign-key deletion behavior.
- [ ] Session continuity storage and invalidation contract.
- [ ] Runtime parity required for the first public release.
- [ ] Web-management timing.

## Safety And Migration

- [ ] No production database or local experimental metadata has been inspected merely to
      plan the feature.
- [ ] Schema work has a fresh, legacy, production-shaped-copy, and restore rehearsal.
- [ ] Journey removal counts contracts/proposals before any contract can be created.
- [ ] Required/optional source failure behavior and path trust policy are approved.
- [ ] Proposal confirmation is attributable to a real user turn and cannot come from
      quoted/model/tool/file content.
- [ ] Prompt, token, privacy, observability, concurrency, and cost boundaries are in the
      first plans rather than deferred to review findings.
- [ ] Legacy import is explicit and previewable; unknown metadata is never interpreted
      automatically.

## Delivery Preparation

- [ ] Reassess the [Provisional Roadmap](provisional-roadmap.md); preserve product intent
      but replace stale codes and dependencies.
- [ ] Create the actual CV/DS/story artifacts only after placement approval.
- [ ] Write the first slice plan and test guide from live code.
- [ ] Run the required multi-persona plan review before implementation.
- [ ] Present the plan and stop for Navigator approval before code.

## Re-entry Result

Record the date, branch, commit, active authorities, accepted placement, first slice, and
remaining unresolved decisions in a new Builder handoff or roadmap artifact. Do not edit
the frozen [`source/`](source/SNAPSHOT.md) snapshot.
