[< Story](index.md)

# Coherence — CV20.DS1.TS2 Ariad Method Fixture

## Process

The story followed the dogfooded Ariad flow:

- Pull selected `CV20.DS1.TS2` as the next Technical Story after the method-definition model.
- Prepare read DS1, the exploration DSL, the existing method-definition model, and TS1 tests.
- Plan created `plan.md` and waited for Navigator approval.
- Implement added the Ariad method fixture and focused tests.
- Validation ran focused tests, lint, format check, and scoped mypy for the Builder package.
- Review recorded debt assessment in `review.md`.

## Project

Roadmap state matches the active work:

- `CV20` remains `In Progress`.
- `CV20.DS1` remains `Active`.
- `CV20.DS1.TS1` is `Done`.
- `CV20.DS1.TS2` is `Active` until Done records closure.
- Story artifacts exist: `index.md`, `plan.md`, `test-guide.md`, `review.md`, and this `coherence.md`.

## Product

The implemented change matches the story boundary. Ariad is now represented as a built-in `MethodDefinition` fixture with resolution layers, taxonomy, lifecycle, checkpoints, policies, surfaces, and open questions.

No adoption, resume, persistence, override resolution, CLI inspection, parser, or lifecycle execution behavior was introduced.

## Validation Alignment

Automated evidence in `test-guide.md` matches the Technical Story validation route:

- focused Ariad fixture and method-definition tests passed;
- focused ruff passed;
- format check passed;
- scoped mypy for `src/memory/builder` passed.

## Debt And Follow-Up

Review found no new debt requiring pay-now or defer action.

Follow-up remains in the next planned DS1 story:

- `CV20.DS1.US1` will make the effective method inspectable.

## Result

Coherent. The change can proceed to Done after recording history according to policy.
