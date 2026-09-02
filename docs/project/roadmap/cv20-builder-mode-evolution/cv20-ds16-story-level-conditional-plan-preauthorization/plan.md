# Delivery Story Plan — CV20.DS16

**Journey:** mirror-mind-development
**Method:** ariad
**Navigator Flow Unit:** delivery_story

## Delivery Story

Story-Level Conditional Plan Preauthorization

## Objective

Extend the bounded authority delivered by CV20.DS15 to implementable User Story
and Technical Story Plans so natural Navigator delegation or accelerated cadence
can survive Driver-owned Plan materialization, satisfy the Plan gate exactly once
without requiring policy-shaped wording, start local implementation without a
redundant Navigator turn, and stop at Navigator Validation.

## Child Work Packages

- CV20.DS16.TS1
- CV20.DS16.TS2
- CV20.DS16.TS3
- CV20.DS16.US1

## Scope

### TS1 — Flow-Aware Story Plan Authorization Receipt

- Generalize `PlanPreauthorizationReceipt` from an aggregate-only assumption into
  one bounded schema that distinguishes `delivery_story` and `story_by_story`
  authority without breaking persisted CV20.DS15 receipts.
- Bind story authority to Journey, method, cursor generation, exact active item,
  exact item level (`user_story` or `technical_story`), flow unit
  `story_by_story`, story Plan contract version, policy `exact_scope`, and fixed
  stop `navigator_validation`.
- Represent story scope structurally without inventing a child set or comparing
  prose. Aggregate receipts retain canonical child-set semantics.
- Keep receipt metadata private and payload-free: no prompt, Plan body, model
  output, reasoning, identity, conversation ID, secret, or absolute path.
- Centralize fingerprint construction, serialization, compatibility, and
  coordinate-change invalidation so the two flows cannot drift.

### TS2 — Atomic Story Plan Preauthorization Lifecycle

- Extend `plan-item` with explicit preauthorization inputs and preserve existing
  `index.md`, `plan.md`, and `test-guide.md` byte-for-byte when already authored.
- Require a complete Driver-owned story Plan before conditional approval.
- Extend story Plan approval with an explicit receipt-consumption route that
  revalidates every coordinate immediately before approval.
- Consume the single-use receipt in the same compare-and-swap cursor update that
  records `plan_approved`; concurrent retry returns the approved state without a
  second approval or implementation start.
- Add story-compatible cancellation while keeping the existing Delivery Story
  cancellation command and ordinary approval behavior backward-compatible.
- On missing, stale, malformed, cancelled, incomplete, mismatched, or unsupported
  authority, emit a bounded reason and retain the ordinary Plan approval gate.

### TS3 — Story Preauthorization Verification Matrix

- Add focused unit tests for User Story and Technical Story exact matches,
  item-level mismatch, Journey/method/generation/flow/contract/stop mismatch,
  incomplete Plan, cancellation, malformed receipt, missing receipt, and retry.
- Prove cursor metadata remains payload-free and old aggregate receipts continue
  to deserialize and behave unchanged.
- Add subprocess concurrency evidence showing exactly one story approval and one
  implementation start across competing consumers.
- Cover CLI surfaces and artifact preservation without relying on a production
  database, model, provider, persona, Pi subprocess, network service, or hidden
  synthesis.
- Keep known unrelated local subprocess timing failures separate from scoped
  behavioral evidence.

### US1 — One-Turn Conditional Story Orchestration

- Route natural explicit delegation such as `crie o plano e execute sem que eu
  precise autorizar` to bounded authority for the currently active US/TS; Ariad,
  not the Navigator's phrasing, supplies exact item, level, generation, sibling,
  mismatch, single-use, and Validation safeguards.
- Declare cadence Plan behavior in method data. Ariad's `accelerated` profile uses
  `bounded_story_authority`, so Plan records the same bounded receipt when it
  begins; lifecycle code must not infer authority from the profile name.
- In `stepwise` and `checkpoint`, preserve ordinary Plan approval unless the
  Navigator naturally delegates Plan creation and execution without another
  approval turn.
- In one assistant turn: record story authority, materialize the Plan, let the
  Driver complete it, consume the receipt, render Plan/artifact/approval/start
  surfaces in runtime order, implement locally, and stop at Validation.
- Vague requests such as `continue`, an isolated `faça tudo`, or `não me pergunte
  nada` do not create stepwise authority; explicit accelerated cadence selection
  does.
- Keep surface transport verbatim and make the authority boundary explicit:
  preauthorization cannot cross Validation, Debt Review, Done/history, commit,
  push, tag, release, deploy, purchase, or another irreversible gate.

## Non-Goals

- Semantic equivalence or LLM review of Plan prose.
- Delegation across multiple story Plans or sibling work items.
- A generalized approval-language parser in Python Core.
- Changing the default cadence or treating accelerated cadence as consent beyond
  the active story's Plan-to-Navigator-Validation interval.
- Removing Plan artifacts, Plan completeness, or ordinary explicit approval.
- Reauthorizing after a Pull, Journey, item, level, flow, generation, contract, or
  stop-boundary change.
- Redesigning Delivery Story preauthorization or changing its observable contract.
- Crossing Navigator Validation or authorizing commit, push, tag, stable
  promotion, release publication, production installation, or remote mutation.

## Acceptance Behavior

```text
Given an active User Story or Technical Story in story_by_story flow
And the Navigator naturally delegates Plan creation and execution without another approval
When Ariad materializes and the Driver completes the matching authored Plan
Then Ariad derives exact bounded authority from active structural state
And the receipt is consumed once with Plan approval
And local implementation starts without another Navigator turn
And deterministic surfaces remain ordered
And the next hard stop is Navigator Validation
```

```text
Given accelerated cadence and an active implementable story in story_by_story flow
When Plan begins without an explicit preauthorization flag
Then bounded story authority is recorded automatically
And a complete matching Plan continues into local implementation
And the next hard stop is Navigator Validation
```

```text
Given stepwise or checkpoint cadence without natural explicit delegation
When the Driver completes the Plan
Then ordinary Navigator Plan approval remains required
And implementation does not begin
```

```text
Given no receipt or a changed Journey, method, item, level, generation, flow,
Plan contract, stop boundary, incomplete Plan, malformed state, or cancellation
When conditional approval is attempted
Then Plan approval and implementation do not occur
And a bounded mismatch reason is visible
And ordinary Navigator approval remains available
```

```text
Given concurrent consumers or a retry after successful consumption
When story approval is attempted again
Then approval and implementation start are not duplicated
And the persisted receipt remains consumed
```

```text
Given an existing CV20.DS15 aggregate receipt or Delivery Story Plan flow
When the generalized implementation is exercised
Then aggregate child-set matching and all existing surfaces remain unchanged
```

## Validation Route

E2E is required because this capability spans runtime persistence, Driver-owned
Plan artifacts, CLI commands, Pi routing, deterministic surfaces, atomic
consumption, and lifecycle continuation.

1. Create a synthetic Ariad journey containing one User Story and one Technical
   Story with complete authored Plan packages.
2. For each level, issue natural delegation without policy-shaped coordinates and
   observe Plan, artifact, approval, and implementation-start surfaces without
   another Navigator message.
3. Repeat in accelerated cadence without an explicit preauthorization flag and
   confirm the same bounded continuation.
4. Confirm local implementation stops at Navigator Validation.
5. Repeat with changed item, item level, Journey, method, generation, flow,
   contract, stop, incomplete Plan, cancellation, malformed/missing receipt, and
   vague stepwise language; confirm no conditional approval.
6. Race two subprocess consumers and prove exactly one approval/start transition.
7. Re-run the Delivery Story preauthorization suite unchanged.
8. Inspect serialized cursor metadata and prove no raw request or Plan body is
   stored.

Run focused cursor, lifecycle, story package, CLI, Pi skill contract, and
subprocess-concurrency tests; then run the broad non-live suite, Ruff, format,
mypy for changed modules, documentation links, plugin drift, and diff checks.

## Implementation Contract

- Use TDD for every behavior change and failure path.
- Python remains the sole product authority while CV22 is paused.
- Preserve Plan completeness and structural approval as a gate. In stepwise and
  checkpoint it stops for Navigator approval by default; natural delegation or
  accelerated cadence may satisfy it through bounded single-use authority.
- Preserve authored story packages before authority verification.
- Keep receipt consumption and `plan_approved` in one compare-and-swap cursor
  update.
- Use structural coordinates only; no model, provider, persona, network service,
  semantic prose comparison, or hidden synthesis participates in authorization.
- Keep bounded reason codes payload-free and ordinary approval available after
  every conditional failure.
- Do not push, release, publish, install, or mutate external consumers.

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
