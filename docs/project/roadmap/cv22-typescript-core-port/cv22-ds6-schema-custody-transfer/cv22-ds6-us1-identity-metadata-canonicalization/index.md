[< Parent](../index.md)

# CV22.DS6.US1 — `identity.metadata` Canonicalization

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

TS stops reproducing Python's `json.dumps` bytes for journey metadata and writes
a single **canonical** JSON form instead. The transition-only byte-mimicry
(`ts/src/util/pyJson.ts`) is deleted. Existing rows written in the historical
Python dialects keep working unchanged (every reader already `JSON.parse`s), so
there is no data migration and no user-visible change — this is the first
custody-gated schema decision from CR023, now unblocked because DS6.TS1–TS4
transferred schema custody to TS.

## Story Statement

In order to retire the transition-only byte-mimicry now that TS owns schema
custody,
As the TS core,
I want journey metadata serialized in one canonical JSON form with a
read-tolerant policy for existing rows,
So that `pyJson.ts` can be deleted without rewriting or breaking any existing
`memory.db`.

## Context

`identity.metadata` is the `metadata` JSON column of the `identity` table.
Journeys are identity rows (`layer=journey`); their metadata (`project_path`,
`sync_file`, `icon`, `color`, `parent_journey`) is the **only** thing serialized
through `pyJsonDumps`, in two Python byte-dialects (`create_journey`:
`sort_keys=True, ensure_ascii=False`; `set_project_path`: `json.dumps` defaults).
Regular `identity set` passes metadata verbatim and is out of scope. Every
consumer (`setProjectPath`, `journeyOptions.parentJourney`) reads the column via
`JSON.parse`, so the on-disk byte form is semantically invisible.

## Acceptance Behavior

```text
Given a journey is created or its project_path is set through the TS front door
When TS serializes the journey metadata
Then it writes one canonical JSON form (JSON.stringify), not the two Python
  json.dumps byte-dialects, and pyJson.ts no longer exists in the tree

Given a database with journey rows in the historical Python byte-dialects
When journeys are listed and the parent hierarchy is resolved
Then every row parses and renders identically to before; no row is rewritten
  and no data migration runs

Given a journey whose metadata was written in the old dialect
When its project_path is next updated
Then it is re-serialized in the canonical form (converges on next write)

And parent_journey integrity stays in-JSON (US2 graduates it to a column)
And out-of-scope sibling roadmap items remain untouched
```

## Scope

- Replace both `pyJsonDumps(...)` calls in `ts/src/journey/journeyWrite.ts`
  (`createJourney`, `setProjectPath`) with canonical `JSON.stringify`.
- Delete `ts/src/util/pyJson.ts`, its test, and the `index.ts` re-export.
- Update the write-parity fixtures/goldens that assert Python-byte journey
  metadata to assert the canonical form — the intentional, recorded divergence
  point from the Python oracle for this column.
- Add mixed-dialect read-tolerance and create→set→read round-trip coverage.

## Out Of Scope

- No one-time data-rewrite migration (read-tolerant policy chosen — see
  [Plan](plan.md) rationale).
- `parent_journey` first-class column — sibling **US2**.
- Non-journey identity metadata (passed verbatim; never byte-mimicked).

## Validation

Behavior-preserving: journeys list/hierarchy/round-trip unchanged across old and
new dialects; `pyJson.ts` gone; determinism/write-parity gates regenerated for
the canonical form. E2E offered as a Navigator smoke (create a journey +
set-path on a copied real DB, list it back). See [Plan](plan.md) and
[Test Guide](test-guide.md).

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
