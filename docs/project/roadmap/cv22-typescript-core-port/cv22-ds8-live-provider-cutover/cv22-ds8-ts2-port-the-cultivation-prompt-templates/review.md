[< Story](index.md)

# Debt Review — CV22.DS8.TS2

**Date:** 2026-09-13 · **Decision:** defer, with triggers · runtime checkpoint
`DEBT_REVIEW_CHECKPOINT` status `reviewed`, missing decision `none`.

## Findings

Five items, none blocking. Two became Change Requests at closure, one is a
DS10 note, two are observations with no action.

1. **`CONSOLIDATION_PROMPT`'s identity-context block** (oracle, not port —
   **CR080**). Two observations from the plateau-4½ reading, one block: the
   600-code-point truncation shows the model a fragment of each identity
   layer and then asks it to "propose the exact paragraph or sentence to
   insert or replace" — a `replace` against text it never saw cannot be made
   well; and the seeded layers open with `# Behavior`, `# Identity`,
   `# Soul`, H1s that outrank the prompt's own `##` sections, so the
   untrusted-input guard, the fenced cluster, and the output contract nest
   under the user's soul heading when read as Markdown. Byte-identical to
   Python by this story's contract. Since the command is ported, a prompt
   change would land in TS first — which is exactly why it needs its own
   decision and a probe, not a line here.

2. **`ts/parity/` is outside `tsconfig` include** (**CR081**). The live smoke
   and the route matrix are never typechecked; `npm run typecheck` is green
   while `route_matrix.ts` carries a pre-existing `TS2353` (the retired-gate
   check passes `MIRROR_TS_EXTERNAL_ROUTES`, which `RouteEnvironment` no
   longer declares). Node's type stripping runs it anyway, so nobody sees it.
   Found while typechecking this story's smoke edits by hand. The fix is a
   tsconfig line plus whatever it reveals; the reveal is the unknown.

3. **Ported renders name the Python entry point** (DS10 note). `consolidate
   scan` and `shadow scan` end with `Accept: python -m memory consolidate
   apply <proposal_id>` — Python's exact bytes, rendered by TypeScript for a
   command that no longer runs in Python. Parity-faithful and shared by every
   ported render that carries review instructions. The entry-point rename is
   DS10's (npm distribution); recorded in the handoff so the burn-down ledger
   can point at it.

4. **First live run: two transport failures, class unknown** (no action;
   tooling fixed in-story). `calls=3 answered=1 transport_failed=2` beside a
   28-second answer, cleared on re-run seventeen minutes later with sub-6 s
   latencies. Consistent with the 60 s extraction bound — Python's own
   `MEMORY_LLM_TIMEOUT_EXTRACTION` — firing in a slow-provider window; the
   class was not captured because the smoke dropped the `kind`, which
   `fa6d2925` fixed. Watch item only: if consolidation regularly nears the
   bound, the tier is a decision for both engines, not a TS patch.

5. **Python's `propose_consolidation` does not guard a JSON-array response**
   (observation, no action). `data.get("action")` on a list raises an
   uncaught `AttributeError`; found when the golden generator's stub returned
   `[]`. TypeScript's `isRecord` check reports `parse_failed` instead. Python
   is compatibility-only for this ported command and DS10 deletes it.

Found during closure, after the checkpoint, and belonging to an existing CR
rather than a new one: `validate-item` and `review-item` each **overwrote the
authored artifact** they name (`validation.md`, then this file) with a
scaffold of the command's flag values. Both were restored — validation from
its commit, this file from the Driver's draft. That is CR079 (RS001),
captured two days earlier from US3's identical experience; this story is its
second data point.

## Decision

**Defer.** Nothing here is load-bearing for the two leaves this story
flipped: the prompt findings are about output quality on a prompt that
provably produces valid, applicable proposals; the typecheck gap is
pre-existing and orthogonal; the entry-point strings have a named owner.
Paying (1) now would mean changing a prompt inside the story that proved it
byte-identical; paying (2) now would widen scope by whatever the tsconfig
line reveals.

**Revisit triggers.**
- (1): CR080, with a prompt-engineer probe before any rewrite — a live
  comparison of `identity_update` proposals with the full layer versus the
  600-character fragment.
- (2): CR081, the next story that edits anything under `ts/parity/`.
- (3): DS10, when the front door becomes the npm entry point.
- (4): a second run showing `timeout=N` on `consolidation`.
