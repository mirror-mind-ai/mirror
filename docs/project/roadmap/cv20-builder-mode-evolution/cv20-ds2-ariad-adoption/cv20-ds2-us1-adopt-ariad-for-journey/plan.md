[< Story](index.md)

# Plan — CV20.DS2.US1 Adopt Ariad For A Journey

## Pull

Pulled item: `CV20.DS2.US1 — Adopt Ariad For A Journey`.

Why this level now: `CV20.DS2.TS1` created runtime method adoption state. The next coherent slice is the Navigator-visible adoption moment: Mirror receives a natural-language request, runs a contained adoption operation, records Ariad as the adopted method for the active journey, and later inspection reports `adopted method: ariad`.

## Prepare

Context read:

- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/cv20-ds2-us1-adopt-ariad-for-journey/index.md`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_adoption.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_inspection.py`
- `/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md`

Story shape assessment: User Story. It adds Navigator-visible behavior through Pi/Mirror natural-language adoption and follow-up method inspection.

Risks:

- Adoption might silently run lifecycle work. It must not.
- Adoption might behave as template generation. That belongs to `CV20.DS2.US2`.
- Adoption might require explicit journey slug even when Builder Mode is active. Natural-language validation should work with the active Builder journey.
- Re-adoption might duplicate or corrupt state. It must be idempotent.

Applicable rules:

- Use TDD.
- Keep adoption explicit and idempotent.
- Use the state helper from `CV20.DS2.TS1`.
- Validate externally through Pi/Mirror natural language.
- Do not add template generation, delivery cursor, active checkpoint, or lifecycle execution.

## Scope

Add a contained adoption operation:

```bash
uv run python -m memory build adopt --journey builder-mode-evolution --method ariad
```

Also support active Builder journey resolution for natural-language skill use:

```bash
uv run python -m memory build adopt --method ariad
```

when a Builder journey is active in operating-mode state.

Update method inspection so an adopted journey renders:

```text
■ Builder Method

journey
builder-mode-evolution

adopted method
ariad

available methods
ariad

status
Ariad is adopted for this journey.
```

Update the Pi Builder skill so these natural-language requests call the contained adoption operation:

```text
adote Ariad como método builder desta jornada
configure esta jornada para usar Ariad
```

The adoption report should name what did not happen yet:

```text
not performed yet
roadmap template generation
runtime delivery cursor sync
story lifecycle execution
```

## Non-Goals

- No roadmap/story template generation.
- No documentation inventory beyond reporting that template generation remains pending.
- No active roadmap item resolution.
- No delivery cursor with checkpoint state.
- No lifecycle execution.
- No override merge implementation.
- No release or push behavior.

## Implementation Approach

Write tests first in `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/cli/test_build.py`.

Likely implementation pieces:

- Add adoption renderers and/or command helpers, probably in `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_inspection.py` or a small new adoption rendering module.
- Add `cmd_adopt_method` to `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`.
- Wire `memory build adopt --method ariad [--journey SLUG] [--session-id SESSION]`.
- Use `resolve_operating_session_id` and `get_active_mode` when `--journey` is omitted.
- Use `set_adopted_method` and `get_adopted_method` from `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_adoption.py`.
- Update `cmd_inspect_method` so it reads adopted method state before rendering journey inspection.
- Update `/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md` with natural-language adoption routing.

Unknown method should fail with available methods. Unknown journey should fail without writing state. No active Builder journey should report that adoption needs a journey.

## Test Strategy

Automated tests should prove:

- `build adopt --journey <existing> --method ariad` records adoption and renders an adoption report;
- `build adopt --method ariad` uses the active Builder journey when one exists;
- adopting Ariad twice is idempotent and reports already adopted;
- unknown journey exits with an error and writes nothing;
- unknown method exits with an error and writes nothing;
- missing journey with no active Builder journey exits with guidance;
- `build inspect-method --journey <existing>` reports `adopted method: ariad` after adoption;
- no-active-journey inspection behavior remains unchanged.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py
uv run ruff check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
uv run ruff format --check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
uv run mypy src/memory/builder src/memory/cli/build.py
```

CLI smoke support:

```bash
uv run python -m memory build adopt --journey builder-mode-evolution --method ariad
uv run python -m memory build inspect-method --journey builder-mode-evolution
```

Navigator validation through Pi/Mirror natural language:

```text
adote Ariad como método builder desta jornada
qual método builder governa esta jornada?
```

Expected observation:

- Mirror routes adoption to the contained Builder command;
- the adoption report says Ariad is adopted for the active journey;
- the follow-up inspection says `adopted method` is `ariad`;
- no story lifecycle work is executed.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
