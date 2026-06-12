[< CV20.DS3](../index.md)

# CV20.DS3.TS2 — Roadmap Position Resolver

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Builder can resolve a compact active roadmap position from project roadmap files for use in the Builder Resume Surface.

---

## Scope

- Add a read-only roadmap position resolver.
- Scan `docs/project/roadmap/**/index.md` under the journey project path.
- Return the first active roadmap file with code, title, status, and relative path.
- Do not mutate roadmap files.
- Do not infer lifecycle checkpoints.

---

## Validation

Implemented in `/Users/alissonvale/Code/mirror-dev/src/memory/builder/roadmap_position.py` with tests in `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_roadmap_position.py`.

Validation passed as part of the DS3 focused suite:

```text
51 passed
ruff ok
format ok
mypy ok
```
