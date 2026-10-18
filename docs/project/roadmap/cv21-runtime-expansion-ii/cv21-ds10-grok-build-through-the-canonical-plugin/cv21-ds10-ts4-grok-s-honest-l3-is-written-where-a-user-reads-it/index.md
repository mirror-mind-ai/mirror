[< CV21.DS10 Grok Build Through The Canonical Plugin](../index.md)

# CV21.DS10.TS4 — Grok's honest L3 is written where a user reads it

**Status:** ✅ Done
**Type:** Technical Story
**Delivery Story:** CV21.DS10 — Grok Build Through The Canonical Plugin

---

## Technical Story

In order to let a Grok Build user and a Mirror maintainer read what Grok does with
the mirror without opening a story package,
As the Driver of DS10,
I want the runtime interface contract, README, Getting Started, REFERENCE, and the
Operating Instructions to name Grok Build as the fifth runtime with US1's two steps,
TS2's MCP route, and US3's L3 — and the one hook that spends seconds on Grok for a
context Grok discards to stop doing so,
So that the parity claim CV21's Done condition asks for is in the product's own
words, with the version it was measured on.

## Outcome

The contract has a `### Grok Build` reference implementation beside the other four,
Grok rows in its session-id, extraction, and injection tables, and an opening that
counts five runtimes. README counts five. Getting Started has a `### Grok Build` run
section with the honest line: Mirror Mode on request, nothing injected per turn, the
Operating Instructions as the home rule step 2 links, the MCP tools through
`search_tool`/`use_tool`, every turn logged as `grok_build`, the close at exit and the
memory at the next start. REFERENCE names Grok's `/mm-` prefix and the three
`diagnose` findings with their repairs. AGENTS.md names Grok Build beside Pi. CR143 is
paid: the inject hook returns at once on a runtime that discards prompt context,
decided by one predicate beside its siblings in `runtimePolicy.ts`, tested, and timed.
With TS4 Done, DS10 reads Done against its Done Condition.

## Acceptance Behavior

```text
Given the documents after this story
When route.sh docs runs
Then every sentence the plan names is found where it belongs, with 1.0.62 where a
     measurement is claimed, and checkDocLinks and buildClaudePlugin --check are clean

Given a Grok-shaped UserPromptSubmit payload
When mirror-inject.sh runs
Then it exits 0 with no stdout, no front-door call, and nothing marked injected, in
     tens of milliseconds; a Claude-shaped payload behaves exactly as before

Given the story closes
Then TS4 and DS10 read Done, CR143 reads done with Driver and Delivery, and
     decisions.md holds its rule
```

## Scope

- The contract, README, Getting Started, REFERENCE, AGENTS.md (and the plugin's
  regenerated rules copy) — the sentences in [plan.md](plan.md).
- `ts/src/conversation/runtimePolicy.ts`, `ts/src/hooks/claude.ts`, their tests.
- CR143 to `done`; the DS10 package and the CV21 index; a worklog entry; decisions.md.
- The story `route.sh`: `docs`, `hook`, `untouched`.

## Out Of Scope

- The parity matrix (DS11); raising Grok above L3; any hook change beyond CR143's
  early return; `review-copy` on Grok (DS5); a troubleshooting entry.

## Validation

Driver: the suite, lint, typecheck, `checkDocLinks`, `buildClaudePlugin --check`, the
plugin smoke. Navigator: `route.sh docs` and a read of the two Grok sections,
`route.sh hook`, `route.sh untouched` — details in [test-guide.md](test-guide.md).
