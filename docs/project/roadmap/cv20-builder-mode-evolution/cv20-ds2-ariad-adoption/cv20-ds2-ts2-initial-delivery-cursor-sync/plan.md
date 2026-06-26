[< Story](index.md)

# Plan — CV20.DS2.TS2 Initial Delivery Cursor Sync

## Pull

Pulled item: `CV20.DS2.TS2 — Initial Delivery Cursor Sync`.

Why this level now: DS2 already has method adoption state and template preparation. Its remaining done-condition gap is runtime sync. A small Technical Story can persist the initial delivery cursor without implementing Builder Resume or story lifecycle execution.

## Prepare

Context:

- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/cv20-ds2-ts1-runtime-method-state-sync/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/cv20-ds2-us1-adopt-ariad-for-journey/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/cv20-ds2-us2-adoption-template-generation/index.md`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_adoption.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/template_generation.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`

Story shape assessment: Technical Story. It creates internal runtime substrate needed by DS3 Builder Resume Surface, but does not add a Navigator-facing lifecycle behavior beyond a contained sync report.

Risks:

- Over-infer active roadmap items before a roadmap parser exists.
- Accidentally execute Pull/Prepare lifecycle semantics.
- Store historical truth in SQLite instead of files.
- Create a table prematurely when the existing runtime state mechanism is enough.

Applicable rules:

- Use TDD.
- Persist runtime cursor in SQLite, not roadmap files.
- Keep roadmap files as historical/versioned truth.
- Store only operational resume state.
- Do not execute lifecycle work.

## Scope

Add helper:

`/Users/alissonvale/Code/mirror-dev/src/memory/builder/delivery_cursor.py`

Likely model:

```python
BuilderDeliveryCursor(
    journey: str,
    method: str,
    active_item: str | None,
    active_checkpoint: str | None,
    pending_confirmation: str | None,
    last_delivery_event: str | None,
)
```

Persist in `runtime_sessions` using stable session id:

```text
__builder_delivery_cursor__:<journey>
```

Metadata shape:

```json
{
  "method": "ariad",
  "active_item": null,
  "active_checkpoint": null,
  "pending_confirmation": null,
  "last_delivery_event": "template_preparation"
}
```

Add contained CLI command:

```bash
uv run python -m memory build sync-cursor --method ariad --journey <slug>
```

Also support active Builder journey:

```bash
uv run python -m memory build sync-cursor --method ariad
```

when Builder Mode is active.

## Non-Goals

- No roadmap parser.
- No active item resolution.
- No checkpoint inference.
- No lifecycle transition.
- No Builder Resume Surface.
- No release/push behavior.

## Implementation Approach

TDD first:

1. Add `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_delivery_cursor.py`.
2. Test empty state, set/read, idempotency, clear, invalid journey/method, and independent journeys.
3. Add CLI tests in `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/cli/test_build.py` for:
   - explicit adopted journey sync;
   - active Builder journey sync;
   - refusal without Ariad adoption;
   - unknown method;
   - missing journey context.
4. Implement cursor helper using `Store.upsert_runtime_session` and `Store.get_runtime_session`.
5. Add render function for cursor sync report.
6. Wire CLI command in `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`.
7. Optionally update method inspection or template preparation report only if needed by tests; avoid DS3 resume behavior.

## Test Strategy

Automated:

```bash
uv run pytest tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

No Navigator validation is required because this is a Technical Story. A CLI smoke may be run for confidence:

```bash
uv run python -m memory build sync-cursor --journey sandbox-pet-store --method ariad
```

Expected observation: report says cursor synced, active item/checkpoint/confirmation are `none`, last delivery event is `template_preparation`, and no lifecycle work was executed.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
