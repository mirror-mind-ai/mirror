[< Story](index.md)

# Review — CV20.DS2.US2 Adoption Template Generation

## Changed Surface

- Extended `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_definition.py` with `TemplateDefinition` and template validation.
- Extended `/Users/alissonvale/Code/mirror-dev/src/memory/builder/ariad_method.py` with Ariad adoption templates as method data.
- Added `/Users/alissonvale/Code/mirror-dev/src/memory/builder/template_generation.py` to create missing method templates and preserve existing files.
- Extended `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py` with `memory build prepare-templates --method ariad`.
- Updated `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_inspection.py` so method inspection shows declared templates.
- Updated `/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md` with natural-language routing for Ariad template preparation.
- Added and extended focused tests under `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/` and `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/cli/test_build.py`.

## Refactoring Done

- Avoided hardcoded template paths/content in CLI behavior by making templates part of the method definition.
- Kept writing behavior in a dedicated helper module rather than embedding filesystem logic in the CLI.
- Preserved the adoption/lifecycle boundary: template preparation reports pending delivery cursor and lifecycle work but does not perform them.

## Refactoring Considered But Not Done

- A richer artifact model with lifecycle requirements, required/optional classifications, and template source provenance. Deferred until DS3/DS4 create pressure for runtime cursor and lifecycle integration.
- A persisted template inventory table. Deferred because roadmap files remain the human/versioned source for this stage.
- Rendering descriptions alongside every created/preserved file. Deferred because the current report is intentionally compact.

## Debt Paid

- Paid the risk identified during planning that template paths/content might be hidden helper constants. They are now declared on `MethodDefinition` through `TemplateDefinition`.

## New Debt Introduced

None requiring immediate action.

## Debt Carried Forward

- Template definitions are method-level only; project/journey override merge is still pending by design.
- Runtime delivery cursor sync remains pending by design.

## Review Decision

No debt action required before closure.
