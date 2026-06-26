[< CV20.DS2](../index.md)

# CV20.DS2.TS2 — Initial Delivery Cursor Sync

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Builder can persist and read an initial Ariad delivery cursor for a journey, using SQLite runtime state, without executing lifecycle work.

This completes the DS2 adoption substrate: adopted method, prepared templates, and synced initial runtime cursor.

---

## Acceptance Behavior

```text
Given a journey has adopted Ariad
And the journey has prepared Ariad templates
When Builder syncs the initial delivery cursor
Then runtime state records the journey, method, active item, active checkpoint, pending confirmation, and last delivery event
And the cursor can be read back for Builder resume
And no story lifecycle work is executed
```

```text
Given a journey has not adopted Ariad
When Builder tries to sync the initial delivery cursor
Then sync is refused
And no cursor state is written
```

---

## Scope

- Add runtime delivery cursor model and persistence helper.
- Store cursor state in SQLite runtime state, initially through `runtime_sessions`.
- Add contained CLI operation for initial cursor sync.
- Require Ariad adoption before cursor sync.
- Keep active item/checkpoint inference minimal: start with no active item/checkpoint unless already known from later stories.
- Render a cursor sync report.
- Add focused unit tests for write/read/clear, validation, CLI sync, refusal without adoption, and idempotency.

---

## Out Of Scope

- No full roadmap parser.
- No active roadmap item resolution beyond null initial state.
- No checkpoint inference.
- No Pull/Prepare/Plan lifecycle execution.
- No Builder resume surface yet.
- No release/push behavior.

---

## Validation

Technical validation:

```bash
uv run pytest tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/cli/test_build.py
```

Expected observation: cursor state is persisted and readable for an Ariad-adopted journey, and sync refuses journeys without Ariad adoption.

---

## References

- [CV20.DS2.TS1 — Runtime Method State Sync](../cv20-ds2-ts1-runtime-method-state-sync/index.md)
- [CV20.DS2.US1 — Adopt Ariad For A Journey](../cv20-ds2-us1-adopt-ariad-for-journey/index.md)
- [CV20.DS2.US2 — Adoption Template Generation](../cv20-ds2-us2-adoption-template-generation/index.md)
