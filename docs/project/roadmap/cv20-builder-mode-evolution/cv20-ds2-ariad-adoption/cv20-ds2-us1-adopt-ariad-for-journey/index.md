[< CV20.DS2](../index.md)

# CV20.DS2.US1 — Adopt Ariad For A Journey

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Navigator can ask Mirror in natural language to adopt Ariad for the active Builder journey and receive an adoption report.

This story uses the runtime method state introduced by `CV20.DS2.TS1`. It does not generate roadmap/story templates yet and does not execute lifecycle work.

---

## Acceptance Behavior

```text
Given Builder Mode is active for a journey
And the journey has not adopted a Builder method yet
When the Navigator says "adote Ariad como método builder desta jornada"
Then Mirror runs the contained adoption operation
And the response shows an Ariad adoption report
And future method inspection says the adopted method is ariad
And no story lifecycle work is executed
```

```text
Given Builder Mode is active for a journey that already adopted Ariad
When the Navigator asks to adopt Ariad again
Then Mirror reports that Ariad is already adopted
And does not duplicate adoption state
```

---

## Scope

- Add a read/write contained operation for Ariad adoption under `memory build`.
- Use existing runtime method adoption state.
- Update method inspection to show adopted Ariad for adopted journeys.
- Update the Pi Builder skill so natural-language adoption requests route to the contained command.
- Add focused tests for adoption, idempotency, unknown journey, and inspection after adoption.

---

## Out Of Scope

- No roadmap template generation.
- No documentation inventory beyond reporting that template generation is pending.
- No active roadmap item resolution.
- No delivery cursor with checkpoint state.
- No lifecycle execution.
- No override merge implementation.
- No release or push policy behavior.

---

## Validation

Navigator validation through Pi/Mirror natural language:

```text
adote Ariad como método builder desta jornada
qual método builder governa esta jornada?
```

Expected observation: Mirror adopts Ariad for the active Builder journey, reports adoption, and later inspection reports `adopted method: ariad`.

---

## References

- [CV20.DS2.TS1 — Runtime Method State Sync](../cv20-ds2-ts1-runtime-method-state-sync/index.md)
- [CV20.DS1.US1 — Inspect Effective Method](../../cv20-ds1-method-dsl-foundation/cv20-ds1-us1-inspect-effective-method/index.md)
