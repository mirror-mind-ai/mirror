[< RS010](index.md)

# CR087 — `journey_status` without a slug returns every journey's full document

**Status:** captured
**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Driver:** —
**Delivery:** —

---

## Problem

`journey_status` describes itself to the model as *"Get status for one journey, or overall
status when no slug is given."* Called with no slug, it does not return overall status: it
returns every active journey's complete document.

Measured on the owner's database (21 journeys, 2026-09-18):

```text
total 226,573 bytes (~57K tokens)
per journey:  identity 12,911  journey_path 13,210  recent_memories 6,740
              recent_conversations 4,160
```

Two document-sized fields per journey carry the bulk. This is already the *fixed* shape —
before CV22.DS9.US2's D1 the same call returned 3.2 MB, including raw embedding bytes
rendered through Pydantic's `__str__`. US2 removed the garbage; it did not revisit the
shape.

The consequence is not a leak — the caller is entitled to this data — but a context
problem: one unslugged call can consume most of an agent's usable window, and the tool
invites exactly that by advertising "overall status". An agent reaching for orientation
gets a wall of documents instead of an index, and whatever it was doing is now competing
for room with 57K tokens it did not ask for.

CV22.DS9.TS1 considered capping it and deliberately did not:

- there is no count argument to bound, so a cap would have to be a byte limit with a
  truncation marker — a third response shape nobody designed, invented inside a wallet-guard
  story;
- the call is a deterministic read. It crosses no provider and costs nothing, so a wallet
  guard has no business refusing it;
- the honest fix is a *summary* shape, which is a product decision about what a model should
  receive from a tool whose description says "status".

## Expected Behavior

Called with no slug, `journey_status` returns a per-journey summary — the fields an agent
needs to choose where to look next (slug, status, stage, counts, last activity) — and the
full document remains available by asking for one journey by slug.

Two decisions belong to whoever takes this:

1. **Which fields survive the summary.** `journey_path` and `identity` are the expensive
   ones and also the most informative; a truncation of each may serve better than removing
   them.
2. **Whether Python moves too.** The TS port is byte-identical to Python here by test. If
   only TypeScript changes, that is a recorded divergence from the oracle; if both change,
   it is a Python-side edit in a surface DS10 will delete anyway. Doing it in TypeScript
   alone is probably right, and it needs to be decided rather than assumed.

## Impact

Medium, and rising with journey count. It degrades the usefulness of the MCP surface for
the exact call an agent makes first when orienting, and the cost scales linearly with how
many journeys the user has — this database has 21 and gains them steadily.

No data-safety impact: read-only, no spend, no leak beyond what the caller may already read.

## Plan Or Decision

Pending. Raised by CV22.DS9.TS1's decision D9 (2026-09-18), where the Navigator accepted
the recommendation to leave the payload alone and capture the shape question here rather
than bound it with a byte cap inside a guard story.

## Evidence

Measured through the TS tool against the production database, read-only, 2026-09-18:

```text
total bytes 226573 | top-level type object | keys ['admin', 'automation', 'campos-houses', …]
  field identity 12911 bytes
  field journey_path 13210 bytes
  field recent_memories 6740 bytes
  field recent_conversations 4160 bytes
```

Prior state, before US2's D1 fix: 3,205,993 bytes carrying 126 embedding blobs.

## Outcome

Pending.

## Provenance

Raised at CV22.DS9.TS1 Debt Review, 2026-09-18, from decision D9. First recorded as a
carried debt at CV22.DS9.US2's Debt Review, where it was named a TS1 input; TS1 decided it
is not a guard question.
