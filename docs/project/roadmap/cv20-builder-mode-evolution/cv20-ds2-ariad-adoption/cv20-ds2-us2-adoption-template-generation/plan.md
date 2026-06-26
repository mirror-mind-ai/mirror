[< Story](index.md)

# Plan — CV20.DS2.US2 Adoption Template Generation

## Pull

Pulled item: `CV20.DS2.US2 — Adoption Template Generation`.

Why this level now: `CV20.DS2.US1` made Ariad adoption visible and persistent for a journey. The next coherent user-visible increment is to let an adopted journey prepare its Ariad documentation structure safely, without entering the story lifecycle or syncing a delivery cursor.

## Prepare

Context read:

- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/cv20-ds2-us1-adopt-ariad-for-journey/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/explorations/ariad-builder-dsl/method-dsl.md`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/ariad_method.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_definition.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_adoption.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`
- `/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md`

Story shape assessment: User Story. The observable behavior is a natural-language request through Pi/Mirror that prepares templates and renders a report.

Risks:

- Template generation might overwrite human-authored docs. It must only create missing files.
- Template generation might expand into complete roadmap planning. This story should prepare adoption readiness templates only.
- Template generation might execute lifecycle work. It must not change active stories, statuses, commits, release state, or runtime cursor.
- Projects may have different documentation layouts. The first slice should choose a small, explicit Ariad readiness structure rather than infer everything.

Applicable rules:

- Use TDD.
- Keep the operation contained under `memory build`.
- Require Ariad adoption before template generation.
- Require a journey project path before writing files.
- Preserve existing files.
- Validate externally through Pi/Mirror natural language.

## Proposed Template Source

Template generation must be driven by method data, not hidden CLI/helper constants.

Extend the Builder method definition model with an adoption template/artifact concept, then declare Ariad's default template set in:

`/Users/alissonvale/Code/mirror-dev/src/memory/builder/ariad_method.py`

The concrete files and contents should come from those method definitions.

Target root at runtime: the journey project path.

Initial Ariad adoption templates:

```text
docs/project/roadmap/ariad-adoption.md
docs/project/roadmap/technical-debt-ledger.md
docs/project/roadmap/templates/delivery-story-index.md
docs/project/roadmap/templates/user-story-index.md
docs/project/roadmap/templates/technical-story-index.md
docs/project/roadmap/templates/plan.md
docs/project/roadmap/templates/test-guide.md
docs/project/roadmap/templates/review.md
docs/project/roadmap/templates/coherence.md
```

Rationale:

- `ariad-adoption.md` records that the project has been prepared for Ariad Builder governance.
- `technical-debt-ledger.md` prepares the Review/Refactor loop artifact required by the method.
- `templates/*` provides safe reusable skeletons without inventing an actual roadmap hierarchy or active story.

Existing files are preserved and reported as preserved.

Pending items reported but not created in this story:

```text
runtime delivery cursor sync
active roadmap item resolution
story lifecycle execution
project/journey override merge
release and push policy enforcement
```

## Scope

Add a contained operation:

```bash
uv run python -m memory build prepare-templates --method ariad --journey <slug>
```

Also support active Builder journey resolution:

```bash
uv run python -m memory build prepare-templates --method ariad
```

when Builder Mode is active for a journey.

Extend the method definition model in:

`/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_definition.py`

Likely public type:

- `TemplateDefinition`

Fields should be minimal for this story:

- `id`
- `path`
- `content`
- optional `description`

Then populate Ariad defaults in:

`/Users/alissonvale/Code/mirror-dev/src/memory/builder/ariad_method.py`

Implement template writing in a small helper module:

`/Users/alissonvale/Code/mirror-dev/src/memory/builder/template_generation.py`

Likely public functions/classes:

- `BuilderTemplatePreparation`
- `TemplateWriteResult`
- `prepare_method_templates(project_path: Path, journey: str, method: MethodDefinition) -> BuilderTemplatePreparation`
- `render_template_preparation_report(report) -> str`

Wire CLI in:

`/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`

Update natural-language routing in:

`/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md`

## Non-Goals

- No delivery cursor sync.
- No active roadmap item resolution.
- No story status transitions.
- No lifecycle execution.
- No complete CV/DS/US tree generation for a product idea.
- No override merge implementation.
- No release or push behavior.

## Implementation Approach

TDD first:

- Extend method definition tests in `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_method_definition.py`.
- Extend Ariad fixture tests in `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_ariad_method.py`.
- Add unit tests for template helper in `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_template_generation.py`.
- Add CLI tests in `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/cli/test_build.py`.

Implementation details:

1. Add `TemplateDefinition` to the method model and validation.
2. Add Ariad's default adoption templates and their content to the Ariad method fixture.
3. Add template helper that accepts a project root, journey slug, and method definition.
4. Read deterministic template paths and content from the method definition.
5. Create parent directories as needed.
6. Write missing files with UTF-8 text.
7. Never overwrite existing files.
8. Return structured report with `checked`, `created`, `preserved`, and `pending`.
9. Add CLI command `prepare-templates` that:
   - validates method is `ariad`;
   - resolves journey explicitly or from active Builder Mode;
   - verifies journey exists;
   - verifies Ariad is adopted for the journey;
   - verifies the journey has a project path;
   - calls the helper;
   - renders the report.
10. Update Pi Builder skill to route natural-language template preparation requests.

## Test Strategy

Automated tests should prove:

- helper creates the missing Ariad template files under a temporary project root;
- helper preserves existing files and does not overwrite content;
- CLI prepares templates for an explicit adopted journey with project path;
- CLI prepares templates for the active Builder journey;
- CLI refuses when Ariad is not adopted;
- CLI refuses when the journey has no project path;
- CLI refuses unknown method;
- report includes created, preserved, and pending sections;
- command does not alter lifecycle state or story files beyond the explicit template set.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/builder/test_template_generation.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

CLI smoke support, ideally against a temporary/sandbox journey:

```bash
uv run python -m memory build prepare-templates --journey sandbox-pet-store --method ariad
```

Navigator validation through Pi/Mirror natural language:

```text
prepare os templates Ariad desta jornada
```

Expected observation:

- Mirror routes to the contained Builder command;
- the report shows checked, created/preserved, and pending items;
- existing files are preserved;
- no story lifecycle work is executed.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
