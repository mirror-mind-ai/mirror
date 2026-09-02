# Delivery Story Plan — CV20.DS15

**Journey:** builder-mode-evolution
**Method:** ariad
**Navigator Flow Unit:** delivery_story

## Delivery Story

Driver-Owned Conditional Plan Authorization

## Objective

Preserve and complete the Driver-owned Delivery Story Plan, then carry an explicit exact-scope single-use Navigator receipt across materialization so matching plans start local implementation without a redundant turn and every mismatch preserves the hard gate.

## Child Work Packages

- CV20.DS15.TS1
- CV20.DS15.TS2
- CV20.DS15.TS3
- CV20.DS15.US1

## Scope

### TS1 — Driver-Owned Plan Fidelity And Completion

- Make Plan materialization create a scaffold only when `plan.md` is absent.
- Preserve an existing non-empty Driver-authored Plan rather than regenerating it.
- Move required-section inspection before conditional approval can transition the
  cursor; incomplete sections remain visible and block only the preauthorized
  route.
- Keep ordinary explicit Navigator approval backward-compatible: it may retain
  the current warning behavior unless this story proves that broader blocking is
  required.

### TS2 — Cursor-Bound Exact-Scope Authorization Receipt

- Add a typed, bounded `PlanPreauthorizationReceipt` to the persisted Delivery
  cursor metadata, plus an active-item generation that changes on each new Pull.
- Bind one pending receipt to Journey, method, cursor generation, active item code
  and level, `delivery_story` flow, canonical exact child-code set, Plan contract
  version, policy `exact_scope`, and stop boundary `navigator_validation`.
- Store no raw prompt, Plan prose, model output, reasoning, secret, absolute path,
  conversation ID, or user identity.
- Treat child order as presentation only: compare a normalized set while
  preserving authored order separately for surfaces and artifacts.

### TS3 — Verification, Invalidation, And Idempotency

- Extend `plan-delivery-story` with explicit preauthorization inputs and extend
  `approve-delivery-story-plan` with an explicit receipt-consumption route.
- Revalidate every structural coordinate and Plan completeness immediately before
  approval.
- Consume the single-use receipt in the same persisted cursor update that records
  Plan approval; retry after success returns the approved state without approving
  or starting implementation twice.
- Invalidate or refuse on Journey, item, generation, flow-unit, child-set, Plan
  contract, stop-boundary, completeness, or Navigator-cancellation mismatch.
- Emit bounded reason codes without source or Plan payloads and preserve ordinary
  approval as the fallback.

### US1 — One-Turn Conditional Plan Orchestration

- Route only explicit natural language that names or unambiguously binds the
  active Delivery Story, exact child set, invalidation condition, and next hard
  stop.
- In one assistant turn: record preauthorization, materialize the Plan, let the
  Driver complete it, consume the receipt, render Plan/artifact/approval/start
  surfaces in runtime order, implement child work, and stop at Navigator
  Validation.
- Vague requests such as “continue”, “faça tudo”, cadence selection, or “não me
  pergunte nada” never create authority.

## Non-Goals

- Story-by-story User/Technical Story preauthorization in the first slice.
- Semantic equivalence or LLM review of Plan prose.
- A generalized delegation, policy, or approval language.
- Default hard-gate bypass for accelerated or autonomous cadence.
- Skipping Plan artifacts, implementation checks, Navigator Validation, Debt
  Review, Done/history, push, release, deploy, purchase, or irreversible gates.
- Persisting raw user language as authorization evidence.
- Allowing the Driver to expand the child set or its own approval policy.

## Acceptance Behavior

```text
Given CV20.DS15-like Delivery work with an exact child-code set
And the Navigator explicitly preauthorizes exact-scope approval until Validation
When Ariad materializes and the Driver completes a Plan with matching coordinates
Then the receipt is consumed once with Plan approval
And implementation starts without another Navigator turn
And surfaces remain deterministic and ordered
And the next hard stop is Navigator Validation
```

```text
Given no receipt or a changed Journey, item, generation, flow unit, child set,
Plan contract, stop boundary, or incomplete Plan
When conditional approval is attempted
Then Plan approval and implementation do not occur
And a bounded mismatch reason is visible
And ordinary Navigator approval remains available
```

```text
Given a consumed receipt
When the command is retried
Then it does not approve twice, start implementation twice, or recreate authority
```

## Validation Route

E2E is required because the capability is conversational and crosses runtime
persistence, Plan artifacts, deterministic surfaces, Pi routing, and lifecycle
continuation. Validate through a synthetic Ariad-adopted journey with a Delivery
Story and four child packages:

1. issue explicit exact-scope preauthorization in natural language;
2. observe Plan materialization without authored-content loss;
3. complete the Plan and consume the receipt without another Navigator message;
4. observe ordered Plan, approval, artifacts, and implementation-start surfaces;
5. confirm implementation stops at Navigator Validation;
6. repeat with child addition/removal/reorder, changed item/Journey/flow/generation,
   incomplete sections, cancellation, unsupported stop, retry, and vague language;
7. inspect cursor metadata and prove that no raw authorization or Plan body was
   persisted.

Run focused cursor, Delivery Story Plan, lifecycle, CLI, Pi skill contract, and
integration tests; then run the full non-live suite, Ruff, format, mypy for
changed modules, docs links, and diff checks.

## Implementation Contract

- Use TDD for every behavior change and failure path.
- Python remains the sole product authority while CV22 is paused.
- Keep Plan approval a hard gate; a valid receipt is explicit Navigator authority,
  not autonomous approval.
- Keep the receipt and approval transition atomic in the single Delivery cursor
  persistence update; do not introduce another independently committed authority
  row in the initial slice.
- Centralize cursor preservation/invalidation so existing lifecycle setters cannot
  silently drop or retain authority by omission.
- Use one canonical scope fingerprint built only from bounded structural fields.
- No model, provider, persona, Pi subprocess, network service, or semantic Plan
  classification participates in authority verification.
- No push, release, production installation, or external consumer mutation is
  authorized by Plan approval or by this implementation story.

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
