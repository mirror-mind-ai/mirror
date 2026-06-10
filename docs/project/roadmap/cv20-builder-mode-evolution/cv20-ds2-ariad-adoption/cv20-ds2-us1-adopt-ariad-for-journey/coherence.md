[< Story](index.md)

# Coherence — CV20.DS2.US1 Adopt Ariad For A Journey

## Process

The story followed the dogfooded Ariad flow with the current checkpoint policy:

- Pull selected `CV20.DS2.US1` after runtime method state sync was completed.
- Prepare read the adoption state helper, Builder CLI, method inspection renderer, and Pi Builder skill.
- Plan was approved before implementation.
- Implement added adoption behavior and skill routing.
- Validation included automated tests, CLI smoke, and Pi/Mirror natural-language validation.
- Review recorded debt assessment in `review.md`.

## Project

Roadmap state matches the active work:

- `CV20` remains `In Progress`.
- `CV20.DS1` is `Done`.
- `CV20.DS2` remains `Active`.
- `CV20.DS2.TS1` is `Done`.
- `CV20.DS2.US1` is `Active` until Done records closure.
- `CV20.DS2.US2` remains Planned.

## Product

The implemented behavior matches the User Story boundary. A Navigator can ask in natural language to adopt Ariad for the active Builder journey. Mirror runs the contained adoption operation, reports Ariad as adopted, and follow-up method inspection reports `adopted method: ariad`.

No roadmap templates, delivery cursor, story lifecycle work, release, push, or override merge behavior was introduced.

## Validation Alignment

Automated evidence and CLI smoke in `test-guide.md` match the validation route. Navigator validation passed through Pi/Mirror natural language using the `sandbox-pet-store` journey.

## Debt And Follow-Up

Review found no new debt requiring pay-now or defer action.

Follow-up remains in `CV20.DS2.US2 — Adoption Template Generation`, where adoption can prepare required docs/templates and report what was created, preserved, or left pending.

## Result

Coherent. The change can proceed to Done.
