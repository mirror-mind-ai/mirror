# Delivery Story Plan — CV23.DS4

**Journey:** mirror-mind-development
**Method:** ariad
**Cadence:** accelerated
**Navigator Flow Unit:** delivery_story
**Validation owner:** Driver, delegated by Navigator
**Contract:** `mirror.journey-projections@1.0`

## Delivery Story

Ariad Operational Compiler

## Objective

Compile the registered Journey's durable public Ariad roadmap, active work,
exploration, refinement, Change Request, and artifact state into a deterministic
schema-valid `ariad:operational` projection, hash exactly represented content,
reject unsafe or ambiguous sources before publication, and publish only through
the DS2 kernel without models, network, private narrative leakage, or
caller-supplied roots.

## Child Work Packages

- CV23.DS4.US1 — Rebuild a deterministic Ariad Operational projection

## Scope

1. Add a pure compiler in `memory.journey_projections.operational`.
2. Reuse shared roadmap heading/status/link grammar and resolve authored links.
3. Normalize both Capability→Delivery→User/Technical and legacy
   Capability→Epic→Story grammars into v1 node types.
4. Preserve authored root/child table order recursively.
5. Project only ID, heading title, normalized status, Outcome, confined relative
   index path, allowlisted existing artifact paths, and children.
6. Project active work only from explicit durable state; absent state is `null`.
7. Project document-first exploration summary, attractors, experiment, and public
   handoff metadata while excluding narrative evidence and bodies.
8. Project canonical Refinement Stories and nested Change Requests in index order,
   never compatibility SQLite state when documents exist.
9. Derive `sourceRevision` from canonical projected content so only represented
   state changes it.
10. Add internal fixed clock/snapshot/revision seams for synthetic contract tests;
    production defaults use UTC and a unique valid snapshot identifier.
11. Add a rebuild service that resolves the root through
    `JourneyProjectionService`, validates Operational schema, and publishes via
    DS2. Callers supply only Journey ID and explicit active state.
12. Return an immutable result containing publication and compiled document.

## Explicit Source Policies

- Missing optional exploration/refinement roots yield empty arrays.
- Missing roadmap index yields `roots: []`; no work is invented.
- Missing, malformed, duplicate, cyclic, or escaping linked packages fail closed
  with bounded payload-free diagnostics before publication.
- Existing symlinks may resolve only inside the registered Journey root.
- Unsupported/unlinked prose is ignored rather than interpreted.
- Artifact keys are allowlisted (`plan`, `test_guide`, `validation`, `review`,
  `coherence`, `done`, `handoff`) and emitted only for confined existing files.
- Status normalization is deterministic: complete→`done`, validation→
  `in_validation`, paused/blocked→`blocked`, active/progress→`in_progress`, and
  all other represented states→`planned`.

## Non-Goals

- Automatic lifecycle refresh and mutation inventory (DS5).
- Public CLI rebuild/inspect or test-only probe preparation (DS6).
- Repair, write-back, staleness interpretation, Tactical/Strategic semantics.
- Database migrations or compatibility-state projection.
- Model, prompt, persona, provider, Pi process, or network calls.
- Release, installation, return record, TypeScript parity, or Nautilus changes.

## Acceptance Behavior

```text
Given the immutable synthetic contract Journey and fixed build inputs
When Ariad rebuilds the Operational projection
Then the compiled document equals expected/operational.json exactly
And DS2 publishes the matching canonical manifest entry

Given equivalent represented state and fixed inputs
When compilation repeats
Then canonical bytes and sourceRevision are identical

Given represented state changes or excluded private body text changes
When compilation repeats
Then represented changes alter sourceRevision
But excluded text changes neither projected content nor revision

Given unsafe, cyclic, duplicate, missing, or malformed authored references
When rebuild is requested
Then compilation fails before publication with bounded diagnostics
And previous consumer authority remains valid
```

## Validation Route

- Red-first contract golden against a copied immutable synthetic fixture.
- Native tests for both roadmap grammars, authored order, status normalization,
  artifacts, exploration/refinement privacy, malformed sources, revision, and
  model/network purity.
- Real DS2 publication/inspection and failure-preservation integration.
- Focused pytest/ruff/format/mypy, full non-live regression, docs/diff checks,
  unchanged contract hashes, and all 16 external self-tests.
- Driver records acceptance from specs and automated evidence; no separate
  Navigator validation occurs.

## Implementation Contract

- TDD for every behavior and failure policy.
- Production code has no acceptance-kit path or probe dependency.
- Production callers never provide project roots or fixed identity/time values.
- No private body, transcript, prompt, raw reasoning, environment value, absolute
  path, or database content appears in projection or diagnostics.
- All publication, receipt, lock, rollback, and inspection behavior remains DS2
  authority; the compiler creates no alternate write path.
- Scope ends at explicit rebuild; DS5 owns automatic refresh.

## Delivery Sequence

1. Add failing contract-golden and native source-policy tests.
2. Implement confined Markdown source extraction and grammar normalization.
3. Implement roadmap, active work, exploration, and refinement compilation.
4. Implement canonical revision and immutable result DTO.
5. Wire registered-root rebuild and DS2 publication.
6. Update architecture/reference documentation.
7. Run Driver-owned validation and close DS4.
8. Create one DS4-scoped commit before DS5; push/release remain separate gates.

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
