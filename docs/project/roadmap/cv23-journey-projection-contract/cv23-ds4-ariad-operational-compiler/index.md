[< Parent](../index.md)

# CV23.DS4 — Ariad Operational Compiler

**Status:** ✅ Done
**Type:** Delivery Story

---

## Outcome

The registered Journey's durable public Ariad state compiles deterministically
into the normative Operational projection and publishes only through the shared
linearizable kernel, without private narrative leakage, inference, or write-back.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV23.DS4.US1](cv23-ds4-us1-ariad-operational-compiler/index.md) | Rebuild a deterministic Ariad Operational projection | User Story | Durable roadmap, active work, exploration, and refinement state become one schema-valid read model | ✅ Done |

## Done Condition

- The immutable synthetic contract fixture compiles byte-for-byte with fixed
  test inputs and publishes through DS2.
- Both represented roadmap grammars normalize into ordered v1 nodes.
- Active work is explicit, explorations/refinements expose only public fields,
  and all references remain Journey-relative and confined.
- `sourceRevision` changes exactly with represented state.
- Malformed, cyclic, duplicate, or escaping sources fail before publication.
- Compilation invokes no model, provider, Pi process, network, or hidden
  synthesis.
- Driver-owned automated/spec validation passes; Navigator validation is
  delegated.

## Planning Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
