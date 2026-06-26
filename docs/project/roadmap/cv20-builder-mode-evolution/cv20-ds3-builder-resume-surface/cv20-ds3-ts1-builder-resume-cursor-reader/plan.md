[< Story](index.md)

# Plan — CV20.DS3.TS1 Builder Resume Cursor Reader

## Pull

Pulled item: `CV20.DS3.TS1 — Builder Resume Cursor Reader`.

Why this level now: DS2 closed with adoption, template preparation, and initial cursor sync. Before rendering a Navigator-facing resume surface, Builder needs a small internal reader that composes adopted method state and runtime cursor state into one resume object.

## Prepare

Context read:

- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds3-builder-resume-surface/index.md`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/delivery_cursor.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_adoption.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`

Story shape assessment: Technical Story. It creates an internal query/model used by the later User Story that changes Builder load output.

Risks:

- Accidentally implementing the visible DS3 resume surface too early.
- Overdesigning roadmap position resolution before `CV20.DS3.TS2`.
- Duplicating cursor/adoption persistence logic instead of composing existing helpers.
- Inferring next lifecycle transitions too strongly before lifecycle runtime exists.

Applicable rules:

- Use TDD.
- Keep this as a read-only helper.
- Do not mutate runtime state.
- Do not change `build load` behavior yet.
- Keep next-action hints conservative.

## Scope

Add helper:

`/Users/alissonvale/Code/mirror-dev/src/memory/builder/resume_state.py`

Likely model:

```python
BuilderResumeState(
    journey: str,
    adopted_method: str | None,
    cursor: BuilderDeliveryCursor | None,
    resumable: bool,
    reason: str | None,
    allowed_next_actions: tuple[str, ...],
)
```

Likely function:

```python
read_builder_resume_state(store, journey) -> BuilderResumeState
```

Rules:

- If no adopted method: `resumable=False`, reason `adoption_required`.
- If adopted method exists but no cursor: `resumable=False`, reason `cursor_sync_required`.
- If adopted method and cursor exist: `resumable=True`, reason `None`.
- Initial allowed next actions for a synced null cursor:
  - `inspect_method`
  - `prepare_templates`
  - `sync_cursor`
  - `pull_next_story` (future lifecycle action; hint only)
- If cursor has `pending_confirmation`, allowed next actions should include `answer_pending_confirmation` and avoid implying free progression.

## Non-Goals

- No visual resume surface.
- No CLI command required unless implementation pressure suggests a debug-only command.
- No roadmap parser.
- No active item resolution.
- No checkpoint inference.
- No lifecycle execution.
- No docs template changes.

## Implementation Approach

TDD first:

1. Add `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_resume_state.py`.
2. Test non-adopted journey -> adoption required.
3. Test adopted/no cursor -> cursor sync required.
4. Test adopted/cursor -> resumable state includes cursor fields and next actions.
5. Test pending confirmation cursor constrains next actions.
6. Implement `/Users/alissonvale/Code/mirror-dev/src/memory/builder/resume_state.py` using `get_adopted_method` and `get_delivery_cursor`.
7. Run focused validation.

## Test Strategy

Automated:

```bash
uv run pytest tests/unit/memory/builder/test_resume_state.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
uv run ruff check src/memory/builder tests/unit/memory/builder
uv run ruff format --check src/memory/builder tests/unit/memory/builder
uv run mypy src/memory/builder
```

No Navigator validation required because this is a Technical Story.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
