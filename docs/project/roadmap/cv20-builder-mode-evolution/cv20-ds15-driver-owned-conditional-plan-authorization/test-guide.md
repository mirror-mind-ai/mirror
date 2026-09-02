[< Story](index.md)

# Test Guide — CV20.DS15

## Aggregate Validation

### Driver-owned Plan

- missing `plan.md` creates the method scaffold;
- existing non-empty Plan survives planning byte-for-byte;
- approval never regenerates an authored Plan;
- complete required sections satisfy the conditional route;
- missing, empty, or placeholder sections block conditional approval before any
  cursor transition;
- ordinary explicit approval retains its documented compatibility behavior.

### Receipt authority

- exact Journey, method, item, level, cursor generation, `delivery_story` flow,
  child-code set, Plan contract, exact-scope policy, and Validation stop are
  persisted and inspectable;
- child reorder preserves authorization while addition/removal invalidates;
- new Pull generation invalidates old authority even when the same item code is
  selected again;
- raw user text, Plan prose, reasoning, secrets, identities, conversation IDs,
  and absolute paths never enter cursor metadata.

### Consumption and failure

- matching complete Plan consumes once and records approval atomically;
- retry is idempotent and emits no duplicate implementation start;
- Journey, item, generation, level, flow, child set, contract, stop, completeness,
  cancellation, and malformed-receipt mismatches remain blocked;
- each failure uses one bounded reason code and leaks no payload;
- missing receipt preserves the current hard-gate behavior;
- ordinary approval remains available after mismatch or invalidation.

### Orchestration and surfaces

- explicit natural language produces receipt → Plan → Driver completion → approval
  → implementation start without another Navigator message;
- vague continuation or cadence language cannot create authority;
- marked surfaces remain verbatim and ordered across the multi-command same-turn
  orchestration;
- accelerated/autonomous cadence still stops at every hard gate not named by the
  receipt;
- the flow stops at Navigator Validation and cannot cross Debt Review, Done,
  commit, push, release, deploy, purchase, or another irreversible boundary.

## Child Work Packages

- CV20.DS15.TS1
- CV20.DS15.TS2
- CV20.DS15.TS3
- CV20.DS15.US1

## Navigator Validation

Use a sandbox Ariad journey with one Delivery Story and four known child packages.
Ask in one message to plan, approve, and implement only if the exact child scope is
preserved, with a mandatory stop at Navigator Validation.

Expected observation:

1. Plan and artifact surfaces appear first.
2. The completed Plan contains Driver-authored scope and no unresolved placeholders.
3. Approval and implementation-start surfaces follow without a second Navigator
   message.
4. Builder performs only local implementation work and stops at Validation.
5. Adding one child and repeating the route shows a bounded mismatch and no
   approval.
6. Cursor inspection shows bounded structural receipt fields and no raw request or
   Plan body.

Pass condition: the exact case advances once to implementation and the mismatch
case remains at Plan approval with an ordinary fallback.

Fail condition: generic Plan content is approved, authored content is replaced,
receipt scope drifts, authority is reused, payload leaks, surfaces are hidden or
reordered, vague language preauthorizes, or any later hard gate is crossed.

## Validation Evidence

Implementation evidence prepared for Navigator validation:

- focused cursor, aggregate/implementable Plan, lifecycle, CLI, storage, and
  process-concurrency suite: passed;
- `plan-item` insert-only regression verified existing `index.md`, `plan.md`, and
  `test-guide.md` remain byte-identical and artifact surfaces report `existing`;
- two-process receipt consumption: exactly one `approved` / implementation start
  and one idempotent `already_approved` result;
- changed child set, presentational reorder, incomplete Plan, cancellation, retry,
  privacy, unsupported stop, and malformed/missing authority paths: covered;
- focused Ruff and format checks: passed;
- mypy for all changed source modules: passed;
- documentation links and roadmap heading checks: passed;
- Claude plugin drift check: passed (Claude natural-language parity remains out of
  scope; its existing plugin source is unchanged);
- broad non-live suite excluding six unrelated timing-sensitive tests: passed;
- full local suite: all behavior assertions passed except five Journey Projection
  subprocess barrier tests and one web operation subprocess test timing out while
  Python import startup took 6–8 seconds against their approximately five-second
  local waits. The same tests fail individually before reaching their assertions;
  no projection or web source was changed by this Delivery Story.

Navigator accepted aggregate Validation. Debt Review recorded `no_action`; no scoped debt blocks closure.
