[< Story](index.md)

# Coherence — CV20.DS2.US2 Adoption Template Generation

## Process

The story followed the approved Ariad flow:

- Pull selected `CV20.DS2.US2` after Ariad adoption command was completed.
- Prepare identified that template content must be method data rather than helper constants.
- Plan was revised and approved to add `TemplateDefinition` to the method DSL model.
- Implement added method-declared templates, a contained preparation command, and Pi skill routing.
- Validation included automated tests and Pi/Mirror natural-language validation.
- Review recorded debt and confirmed no pay-now action.

## Project

Roadmap state matches the active delivery arc:

- `CV20` remains `In Progress`.
- `CV20.DS2` remains `Active` because runtime delivery cursor sync is still pending for the full DS2 done condition.
- `CV20.DS2.TS1` is `Done`.
- `CV20.DS2.US1` is `Done`.
- `CV20.DS2.US2` is ready to close as `Done`.

## Product

The implemented behavior matches the User Story boundary. A Navigator can ask Mirror in natural language to prepare Ariad templates for an adopted journey. Mirror runs a contained Builder command, uses templates declared by the Ariad method definition, creates missing files, preserves existing files, and reports pending items.

No delivery cursor, active roadmap item resolution, lifecycle execution, story status transition, commit, push, or release behavior was introduced.

## Validation Alignment

Automated evidence in `test-guide.md` matches the validation route. Pi/Mirror validation passed using the `sandbox-pet-store` journey and confirmed the expected report and lifecycle boundary.

## Follow-Up

DS2 still needs a later slice for initial runtime delivery cursor sync if the DS2 done condition is to be fully satisfied. That work should remain separate from template preparation.

## Result

Coherent. The story can be marked Done.
