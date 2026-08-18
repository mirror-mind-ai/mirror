[< Exploration index](index.md)

# Handoff Info: Journey Working Agreements

## Handoff Summary

Preserve Journey Context Contracts as a deferred, future-ready product capability while
CV22 advances. Do not create CV23 or implementation stories from this handoff without
fresh grounding and explicit Navigator priority.

## Completeness

- [x] frozen source evidence and checksums
- [x] continuous exploratory narrative
- [x] product intent and examples
- [x] provisional delivery sequence
- [x] transition and mode boundaries
- [x] safety and trust concerns
- [x] risks and conscious exclusions
- [x] re-entry triggers and checklist
- [x] Builder preservation and non-assumption guidance
- [x] raw conversation explicitly excluded

This is complete as a deferred exploration package. It is intentionally not complete as
an implementation plan.

## What Future Builder Should Preserve

- The capability is general, journey-owned, and profile-based—not a writing-specific
  `default_persona` shortcut.
- Contract resolution and contract learning are separate operations.
- Durable mutation always requires explicit confirmation.
- Required context fails closed; optional context degrades visibly.
- Every routing decision is explainable from typed resolution data.
- A contract coordinates context and lens but cannot weaken modes, safety, or hard gates.
- No profile, persona, or sticky state crosses a journey or active contract revision.
- Runtime adapters remain thin and never parse contract policy themselves.
- The database is runtime authority; a project file may later be import/export material,
  not an accidental second authority.
- The implementation should be TS-native when the relevant CV22 seams are ready.

## What Future Builder Must Reopen

The following recommendations are not final decisions:

- dedicated revision/proposal tables and their exact foreign-key behavior;
- contract JSON v1 shape and schema evolution;
- exact profile, example, source, token, and instruction budgets;
- explicit profile versus explicit persona conflict semantics;
- session state in `runtime_sessions.metadata` versus a later first-class schema;
- whether profile classification extends reception or uses another bounded seam;
- the initial supported modes;
- which runtime surfaces are mandatory for the first release;
- when web management belongs in delivery; and
- whether the provisional CV number and story decomposition still fit the live roadmap.

## Risks

- Treating the detailed source package as current architecture after CV22 has moved.
- Expanding CV22 parity work with a substantial new behavior and schema.
- Building Python-first and creating immediate parity debt.
- Letting profile instructions become a shadow system prompt.
- Adding a second model call to every turn without cost evidence.
- Loading excessive context or unsafe project paths.
- Combining explicit profile and persona choices inconsistently.
- Allowing quoted or generated content to confirm proposals.
- Leaving journey removal able to orphan future contract records.
- Claiming runtime parity while adapters implement policy differently.

## Explicit Boundaries

- No active CV23, Delivery Story, Refinement Story, Change Request, migration, task, plan,
  test guide, or implementation is created by this package.
- No production database or experimental metadata is inspected or changed.
- The local prototype remains in place until the official feature is released and
  user-visible replacement behavior is proven.
- No raw conversation transcript is stored.
- The frozen source package is historical evidence and must not be silently edited.

## Re-entry Boundary

Future Builder work begins only after the Navigator explicitly chooses this capability
and the [Re-entry Checklist](re-entry-checklist.md) is executed. Builder should create
fresh roadmap and plan artifacts from the live repository. It must not mechanically
promote the provisional story codes.

## Suggested First Future Question

Is CV22's TS Mirror Mode and live-provider surface now stable enough that Journey Working
Agreements can be implemented once, in TypeScript, without a Python compatibility
implementation becoming a second product authority?
