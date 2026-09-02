[< Story](index.md)

# Test Guide — CV20.DS16

## Aggregate Validation

### Story authority schema

- User Story and Technical Story receipts bind Journey, method, generation, exact
  item, exact level, `story_by_story` flow, story Plan contract, exact-scope
  policy, and Navigator Validation stop;
- story authority does not fabricate aggregate child scope;
- existing Delivery Story receipts and canonical child-set matching remain
  backward-compatible;
- raw request text, Plan prose, model output, reasoning, secrets, identities,
  conversation IDs, and absolute paths never enter persisted metadata.

### Plan lifecycle

- `plan-item --preauthorize-approval` records natural explicit delegation while
  preserving existing authored `index.md`, `plan.md`, and `test-guide.md` bytes;
- `plan-item` in a cadence whose method data declares
  `plan_approval_policy=bounded_story_authority` records the same bounded story
  authority without an explicit flag; Ariad assigns that policy to accelerated,
  while stepwise/checkpoint retain `navigator_approval`;
- complete story Plans can consume authority; missing, empty, generic, or
  placeholder sections cannot;
- matching approval and receipt consumption share one compare-and-swap update;
- retry is idempotent and cannot emit a duplicate implementation start;
- ordinary `approve-plan` remains available when no valid receipt exists;
- cancellation invalidates only pending authority and preserves the Plan gate.

### Mismatch and privacy

- Journey, method, generation, item, item level, flow, Plan contract, policy, stop,
  completeness, cancellation, malformed state, and unsupported action paths fail
  conservatively with bounded payload-free reasons;
- pulling the same code again changes generation and invalidates stale authority;
- switching between US and TS invalidates authority even when other coordinates
  are unchanged;
- aggregate DS and implementable-story behavior cannot consume one another's
  receipts.

### Concurrency and orchestration

- two subprocess consumers produce one approval/start and one idempotent
  already-approved result;
- natural language such as `crie o plano e execute sem que eu precise autorizar`
  can route receipt → Plan → Driver completion → approval → implementation start
  in one assistant turn without policy-shaped wording;
- accelerated cadence automatically continues through a complete matching story
  Plan; vague continuation cannot create stepwise authority;
- marked surfaces remain verbatim and ordered;
- execution stops at Navigator Validation and cannot cross Debt Review, Done,
  commit, push, tag, release, deploy, purchase, or remote mutation.

## Child Work Packages

- CV20.DS16.TS1
- CV20.DS16.TS2
- CV20.DS16.TS3
- CV20.DS16.US1

## Navigator Validation

Use a synthetic Ariad journey with one User Story and one Technical Story. For
each, naturally ask in one message to create the Plan and execute it without
another approval turn. Do not recite exact-scope policy; Ariad must derive that
boundary. Repeat one story in accelerated cadence without an explicit
preauthorization flag. Every route must stop at Navigator Validation.

Expected observation:

1. Story Plan and artifact surfaces appear first.
2. Existing authored package bytes remain unchanged.
3. Natural delegation and accelerated cadence each produce approval and one
   implementation-start surface without a second Navigator message.
4. Stepwise/checkpoint without delegation stop at ordinary Plan approval.
5. Builder stops at Navigator Validation.
6. A changed-item and incomplete-Plan route shows a bounded mismatch and no
   approval.
7. Concurrent consumption records one transition.
8. Cursor inspection contains bounded structural fields and no request or Plan
   payload.
9. Existing Delivery Story preauthorization tests remain unchanged and green.

Pass condition: naturally delegated US and TS cases and the accelerated case each
advance once to implementation, non-delegated conservative cadences stop at Plan,
all mismatches retain ordinary approval, and aggregate DS behavior does not drift.

Fail condition: authority is inferred, prose is treated as scope identity,
authored artifacts are replaced, a stale or cross-flow receipt is consumed,
approval/start is duplicated, payload leaks, a later hard gate is crossed, or
Delivery Story behavior regresses.

## Implementation Evidence

Prepared for Navigator Validation:

- shared `plan_preauthorization.py` centralizes flow-aware structural receipts,
  canonical fingerprints, mismatch reasons, payload-free completeness checks,
  and compare-and-swap invalidation;
- User Story and Technical Story receipts carry no fabricated child scope and
  use `story_plan@1`, while existing `delivery_story_plan@1` child-set behavior
  remains unchanged;
- `plan-item --preauthorize-approval --stop-after navigator_validation`,
  automatic accelerated-cadence authority, `approve-plan --use-preauthorization`,
  and `cancel-plan-preauthorization` are available and documented in Pi routing;
- natural phrases such as `crie o plano e execute sem que eu precise autorizar`
  route to bounded authority without requiring policy-shaped wording;
- exact approval atomically consumes once, retry emits no duplicate start,
  cancellation and ordinary stepwise/checkpoint approval preserve the gate, and
  mismatches remain bounded;
- two-process story consumption produced one `approved` start and one
  `already_approved` result;
- focused cursor, lifecycle, Ariad method, Delivery Story regression, story
  authority, CLI, skill contract, and concurrency tests passed;
- sandbox dogfood proved both revised human routes: natural stepwise delegation
  and a plain `crie o plano` under accelerated cadence each emitted one bounded
  receipt, one approval/start sequence, implemented locally, and stopped at
  Navigator Validation;
- Debt Review found and paid the hard-coded `accelerated` profile-name check:
  `CadenceProfileDefinition.plan_approval_policy` now owns the policy, method
  inspection exposes it, and regression tests prove profile labels grant no
  authority by themselves;
- sandbox dogfood also exposed and closed a false `plan_incomplete` result where
  legitimate product vocabulary such as `Payment placeholder` was mistaken for
  an unfilled Plan marker; real `Placeholder — ...` markers remain blocked;
- the complete unit/integration non-live suite passed without exclusions after
  the cadence revision;
- Ruff, format, scoped mypy for all changed Python modules, documentation links,
  roadmap headings, CLI help, and diff checks passed;
- full-repository mypy still reports the pre-existing baseline (131 errors in 29
  unrelated files); changed modules remain clean;
- no model, provider, network service, production database, push, release,
  installation, or external consumer mutation participated.
