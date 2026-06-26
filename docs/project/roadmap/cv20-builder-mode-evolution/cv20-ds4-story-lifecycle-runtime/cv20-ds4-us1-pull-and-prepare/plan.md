[< Story](index.md)

# Plan — CV20.DS4.US1 Pull And Prepare

## Pull

Pulled item: `CV20.DS4.US1 — Pull And Prepare`.

Why this level now: DS3 made Builder load resume an Ariad journey from runtime state. DS4 should begin with the first lifecycle movement only: Pull chooses active work and Prepare reads the terrain. This is the smallest user-visible lifecycle slice before Plan checkpoint gating.

## Prepare

Context read:

- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds4-story-lifecycle-runtime/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/explorations/ariad-builder-dsl/method-dsl.md`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/ariad_method.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/delivery_cursor.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/resume_state.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`

Story shape assessment: User Story. It exposes the first Ariad lifecycle operations to the Navigator through natural language and visible reports.

Risks:

- Pull might mutate roadmap files too early. This first slice should only update runtime cursor.
- Prepare might drift into Plan generation. It must stop before Plan.
- Natural-language item parsing could become fragile. The contained command should accept explicit metadata; Pi can route natural text into those arguments conservatively.
- Story shape assessment might overclaim because no full roadmap parser exists yet. It should be explicit and conservative.

Applicable rules:

- Use TDD.
- Keep lifecycle operations contained under `memory build`.
- Require Ariad adoption and cursor.
- Pull may update cursor; Prepare may update last event. Neither may execute Plan or later lifecycle events.
- External validation must be Pi/Mirror natural language.

## Scope

Add lifecycle helper:

`/Users/alissonvale/Code/mirror-dev/src/memory/builder/lifecycle.py`

Likely models:

```python
BuilderLifecycleItem(
    code: str,
    title: str,
    level: str,
    why_now: str,
)

BuilderPullReport(...)
BuilderPrepareReport(...)
```

Add contained CLI operations:

```bash
uv run python -m memory build pull-item \
  --method ariad \
  --item-code CHECKOUT-FLOW \
  --item-title "Checkout Flow" \
  --item-level user_story \
  --why-now "next candidate capability"
```

```bash
uv run python -m memory build prepare-item --method ariad
```

Both should support explicit `--journey <slug>` or active Builder journey resolution.

Pull behavior:

- validate method is Ariad;
- resolve journey;
- require journey exists;
- require Ariad adopted;
- require delivery cursor exists;
- validate item level is one of `delivery_story`, `user_story`, `technical_story`;
- update cursor:
  - `active_item`: item code;
  - `active_checkpoint`: none;
  - `pending_confirmation`: none;
  - `last_delivery_event`: `pull`;
- render report with selected item, level, why now, next event `prepare`, and boundary.

Prepare behavior:

- validate method/journey/adoption/cursor;
- require cursor has `active_item`;
- read minimal project context when project path exists:
  - README.md present/missing;
  - docs/project/roadmap/index.md present/missing;
  - docs/process/development-guide.md present/missing;
- update cursor `last_delivery_event`: `prepare`;
- render report with:
  - context summary;
  - story shape assessment;
  - risks;
  - applicable rules;
  - next event: `plan`;
  - boundary: Plan not created, implementation blocked.

## Non-Goals

- No Plan artifact generation.
- No checkpoint approval persistence.
- No implementation commands.
- No roadmap file mutation.
- No automatic recommendation of roadmap item.
- No full roadmap parser.
- No Validation/Review/Coherence/Done.

## Implementation Approach

TDD first:

1. Add `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_lifecycle.py` for lifecycle helper behavior.
2. Extend `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/cli/test_build.py` for CLI Pull/Prepare routing.
3. Implement lifecycle helper that uses existing delivery cursor helpers.
4. Add CLI commands in `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`.
5. Update `/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md` with natural-language Pull/Prepare routing and boundaries.
6. Validate automated checks.
7. Stop for Navigator validation of US1 in Pi/Mirror.

## Test Strategy

Automated:

```bash
uv run pytest tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

Navigator validation through Pi/Mirror:

```text
puxe o item Checkout Flow como user story para esta jornada porque é a próxima capacidade candidata
prepare o item puxado
```

Expected observation:

- Pull report shows selected item, level, why now, next event Prepare, and boundary.
- Prepare report shows context summary, story shape assessment, risks, applicable rules, next event Plan, and boundary.
- Cursor state has active item after Pull and `last_delivery_event=prepare` after Prepare.
- No Plan, Implement, Validation, Review, Coherence, or Done is executed.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
