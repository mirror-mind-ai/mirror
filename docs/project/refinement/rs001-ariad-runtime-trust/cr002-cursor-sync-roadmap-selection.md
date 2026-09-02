[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR002 — Refuse Ambiguous Roadmap Selection During Cursor Sync

## Problem

After the Builder delivery cursor was intentionally cleared for the DS12 restart,
Builder load reported `cursor_sync_required` but presented `CV9.DS7 — Conversation
Metadata Lifecycle` as the roadmap position for the `builder-mode-evolution` journey.
The intended work was the explicitly authored `CV20.DS12.TS1` candidate.

The repository contains more than one historical or active-looking roadmap position.
A global scan can therefore produce a syntactically valid but contextually wrong
recommendation.

## Expected Behavior

Cursor synchronization must not silently choose between ambiguous active roadmap items.
It should use explicit journey/project scope or stop and request an item choice. An
explicit Pull of a named item may proceed after an empty cursor is synchronized.

## Impact

Trusting the inferred position can pull or resume unrelated Delivery Work.

## Plan Or Decision

Pending. Capture does not authorize a scanner change. First characterize why CV9.DS7 is
eligible and whether the defect belongs to roadmap metadata, journey scoping, or
candidate resolution.

## Evidence

Reproduced during the document-first DS12 restart:

```text
resumable: no
reason: cursor_sync_required
roadmap position: CV9.DS7 — Conversation Metadata Lifecycle
active item: none
```

The cursor was synchronized empty, then `CV20.DS12.TS1` was pulled explicitly. No
implicit CV9 work was executed.

## Outcome

Pending.
