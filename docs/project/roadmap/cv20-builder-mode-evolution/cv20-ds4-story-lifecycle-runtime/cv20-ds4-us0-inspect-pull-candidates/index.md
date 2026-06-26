[< CV20.DS4](../index.md)

# CV20.DS4.US0 — Inspect Pull Candidates

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Navigator can ask to see the roadmap or what can be pulled next and receive an Ariad Pull Candidates surface before selecting active work.

---

## Acceptance Behavior

```text
Given Builder Mode is active for an Ariad-adopted journey
When the Navigator asks to see the roadmap
Then Mirror renders Ariad Pull Candidates
And shows available roadmap items with code, title, level, status, and path
And recommends a pull candidate when possible
And does not pull an item or execute lifecycle work
```

---

## Validation

Navigator validation through Pi/Mirror natural language:

```text
mostre o roadmap desta jornada
```

Expected observation: Mirror renders `■ Ariad Pull Candidates` and does not pull an item.
