[< CV20](../index.md)

# CV20.DS1 — Method DSL Foundation

**Status:** ✅ Done

---

## Outcome

Builder can load Ariad as a declarative method definition rather than hard-coding Ariad behavior into the Builder runtime.

The method definition represents taxonomy, state semantics, lifecycle events, checkpoints, artifacts, policies, surfaces, and open questions as data that can be validated and inspected.

---

## Scope

- Add a method-definition model for Builder delivery methods.
- Add the inaugural Ariad method definition from the exploration DSL.
- Validate the method definition against a schema or equivalent contract.
- Resolve method defaults with project, journey, and Navigator override layers.
- Make the effective method inspectable from the CLI or runtime surface.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV20.DS1.TS1](cv20-ds1-ts1-method-definition-model/index.md) | Method definition model | Technical Story | Runtime has typed structures for method DSL concepts | ✅ Done |
| [CV20.DS1.TS2](cv20-ds1-ts2-ariad-method-fixture/index.md) | Ariad method fixture | Technical Story | Ariad lifecycle, taxonomy, checkpoints, and policies are represented as data | ✅ Done |
| [CV20.DS1.US1](cv20-ds1-us1-inspect-effective-method/index.md) | Inspect effective method | User Story | Navigator can inspect the effective Ariad method configuration and active overrides | ✅ Done |

---

## Done Condition

DS1 is done. Builder can load, validate, and inspect the Ariad method definition without executing delivery work. Full project/journey override resolution remains deferred to later delivery stories where adoption and effective method state are introduced.

---

## References

- [Ariad Builder Method DSL](../../../explorations/ariad-builder-dsl/method-dsl.md)
