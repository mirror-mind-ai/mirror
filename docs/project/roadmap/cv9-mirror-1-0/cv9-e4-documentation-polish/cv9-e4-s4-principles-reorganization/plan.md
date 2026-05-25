[< S4 index](index.md)

# CV9.E4.S4 — Plan: Principles Reorganization

---

## What This Story Does

Splits `docs/product/principles.md` into two files with distinct audiences
and responsibilities. The split is mechanical — the content exists; it just
lives in the wrong place. The only genuine design work is the overlap audit
between the new `engineering-principles.md` and `development-guide.md`.

---

## The Split

**`docs/product/principles.md` — keeps the Product section only.**

Six principles stay:
- First-person voice
- Memory as intelligence
- Journeys as continuity
- Interfaces are thin
- One voice, many lenses
- Doing as entry, being as discovery

Everything else — Code, Testing, Process — moves out.

**`docs/process/engineering-principles.md` — new file.**

Receives the Code, Testing, and Process sections moved from `principles.md`.
One adjustment to the Code section (see below). Everything else moves verbatim.

---

## Sequencing Dependency

S3 must run before S4. S3 moves the import direction substance out of the
"Service layer is the architecture" principle and into `docs/product/architecture.md`.
S4 must not re-document that content — it inherits the already-moved state.

---

## Code Section — "Service layer is the architecture"

After S3, the four-layer rule, import direction constraint, and `MemoryClient`
façade model live in `docs/product/architecture.md`. The principle itself is worth
keeping — it is a design philosophy, not just an implementation detail.

In `engineering-principles.md`, this principle becomes a one-liner with a
pointer:

> **Service layer is the architecture.**  
> `MemoryClient` is a façade. Services are the implementation. Storage handles
> persistence. The import direction rule and full layer model are in
> [docs/product/architecture.md](../../architecture.md).

Do not reproduce the layer detail here. The pointer is sufficient.

---

## Overlap Audit — `development-guide.md`

The Process section in `principles.md` and `development-guide.md` cover
overlapping ground. The resolution rule: **principles states the rule,
development-guide.md operationalizes it.**

In practice, most entries in the guide have enough operational content to
justify staying — the 4-step design procedure, the verification checklist
commands, the commit message format examples. The threshold for removal from
the guide is: does removing this line leave the guide reader without something
actionable?

**One item to remove from `development-guide.md`:**

- **"Push only when asked"** — appears in both files as a bare rule statement
  with no operational content in the guide. Remove it from the guide; it lives
  in `engineering-principles.md`.

**Everything else stays in `development-guide.md`:**

| Rule | Reason to keep in guide |
|---|---|
| Design before code | 4-step procedure with operational sequence |
| TDD by default | Part of the During Implementation list with directional context |
| Small stories | "Split it before starting implementation" is directional |
| Docs updated in the same cycle | Specific guidance on when to mark ✅ and add worklog entry |
| Refactoring evaluated in-cycle | "Ask at the end of every story" is operational |
| Commits stay small and English | Format examples and rules |

---

## Index Updates (in S4, not deferred to S6)

The file that creates something owns the first documentation of it. S4 creates
`engineering-principles.md`, so S4 makes these two index updates immediately.
S6 verifies them later.

**`docs/index.md` — Process section:**

Add `engineering-principles.md` to the Process section:

```
- [Engineering Principles](process/engineering-principles.md) — code, testing,
  and process guidelines
```

**`docs/product/index.md`:**

Update the `principles.md` description to reflect its reduced scope, and add a
pointer to `engineering-principles.md`:

```
- [Principles](principles.md) — product behavior principles
- [Engineering Principles](../process/engineering-principles.md) — code,
  testing, and process principles
```

---

## Done Condition

- `docs/product/principles.md` contains only the six product principles.
- `docs/process/engineering-principles.md` exists with Code, Testing, and
  Process sections. "Service layer is the architecture" is a one-liner with a
  pointer to `docs/product/architecture.md`.
- "Push only when asked" is removed from `development-guide.md`.
- No other content is removed from `development-guide.md`.
- `docs/index.md` Process section includes `engineering-principles.md`.
- `docs/product/index.md` describes `principles.md` as product behavior
  principles only and points to `engineering-principles.md`.
- CI remains green.

---

## See also

- [S4 index](index.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
- [S6 — Cross-Reference Audit](../cv9-e4-s6-cross-reference-audit/index.md)
- [Development Guide](../../../../../process/development-guide.md)
- [Current Principles](../../../../../product/principles.md)
