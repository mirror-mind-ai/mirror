[< Project roadmap](../../roadmap/index.md)

# Exploration Handoff: Journey Working Agreements

**Exploration status:** Deferred, future-ready
**Implementation status:** Not planned or authorized
**Provisional placement:** A future capability value after the relevant CV22 seams mature
**Durable Story:** `a3f002c5` (`mirror-ts-core`)
**Source baseline:** Mirror Mind `v0.31.9`, commit `62f372531ec791895ccef0af6e9363a0beb5e2f1`

## Editorial Synthesis

Journey Context Contracts would let each journey carry a versioned working agreement:
task profiles, persona or ego lens, mode compatibility, required and optional
references, explainable resolution, and confirmed-only durable learning. The capability
is general: books, software, research, teaching, financial reflection, and
extension-backed work can each define their own profiles without moving policy into
runtime-specific instructions.

The capability is strong, but implementation is consciously deferred. Mirror Mode
orchestration and reception remain Python-owned on the captured CV22 branch, TS live
provider cutover is pending, and final web-process convergence remains later work.
Implementing the feature now would either grow Python and create immediate parity debt or
mix substantial product change into CV22's migration scope.

The future hypothesis is a separate capability, provisionally called **CV23 — Journey
Working Agreements**. This is not a current roadmap commitment. The provisional sequence
is preserved only so future Builder work can start from product understanding rather
than reconstructing it from scratch.

## Preservation Layers

1. **Frozen source evidence.** [`source/`](source/SNAPSHOT.md) contains the original
   ten-document package copied verbatim from the Desktop, plus SHA-256 checksums. It is
   historical evidence, not live architecture authority.
2. **Explorer synthesis.** [Exploratory Story](exploratory-story.md) preserves the
   product reasoning, tensions, and decision to defer.
3. **Product shape.** [Product Design Proposal](product-design-proposal.md) describes
   the intended user experience without treating captured implementation paths as
   current.
4. **Future delivery hypothesis.** [Provisional Roadmap](provisional-roadmap.md)
   preserves a dependency-ordered story sequence that must be re-grounded before use.
5. **Re-entry contract.** [Re-entry Checklist](re-entry-checklist.md) names the evidence
   required before this becomes active work.
6. **Builder boundary.** [Handoff Info](handoff-info.md) records risks, open decisions,
   non-assumptions, and the future promotion boundary.

No raw conversation transcript is included. The original package and editorial
synthesis are the intentionally selected source evidence.

## What Was Decided

- The capability is worth preserving and is deferred rather than rejected.
- The user-facing idea is a journey's **working agreement**; Journey Context Contract is
  the technical model.
- Resolution may be automatic; durable learning is never silently applied.
- Journey contracts coordinate profile, persona, and context but cannot grant
  operational authority or weaken mode boundaries.
- Profiles and sticky state never cross journeys or contract revisions.
- The initial implementation should be TS-native rather than Python-first.
- The idea should remain in Radar, not become an active CV, Refinement Story, Change
  Request, migration, plan, or implementation task now.

## Re-entry Triggers

Reconsider active delivery only when:

- CV22.DS7.US4 has established a stable TS Mirror Mode orchestration seam;
- CV22.DS8 is complete or sufficiently mature to plan live classification and proposal
  generation against its real interface;
- TS schema authority remains settled;
- the live runtime and web ownership boundaries are understood; and
- the Navigator makes this capability a current priority.

## Builder Reading Order

Read this file, then `exploratory-story.md`, `product-design-proposal.md`,
`provisional-roadmap.md`, `re-entry-checklist.md`, and `handoff-info.md`. Read
`source/README.md` and the remaining source snapshot as historical evidence. Re-ground
all code paths, migration numbers, runtime adapters, and story dependencies against the
live repository before creating roadmap work.
