[< CV9 Mirror Mind 1.0](../index.md)

# CV9.DS10 — The 1.0 Done Condition Describes the System That Exists

**Status:** ✅ Done — 2026-11-07, validated by the Navigator
**Type:** Delivery Story
**Source:** the Navigator's request in a Builder session on 2026-11-07, from the ranking
of 2026-10-28 and a journey-reorganization handoff; reviewed by a persona panel
([evidence](evidence/2026-11-07-plan-review.md)).
**User-visible outcome:** A reader can tell from CV9 alone when 1.0 is done. Every claim
in its done condition is true of the TypeScript core today or is owned by a named
Delivery Story, and each says how it is checked. No CV9 document presents a retired
surface as live.

---

## What This Is

On 2026-10-28 the Navigator asked for the ten most important items on the way to 1.0.
The first was this one. CV9's done condition was written on 2026-04-30, and four things
in it no longer describe Mirror:

- Its first two bullets (no `store.conn` calls in `src/memory/cli`, no raw SQL in
  `RuntimeSessionService`) named the Python core. CV22.DS10.TS5 deleted it, and `src/`
  no longer exists, so the bullets were true by default.
- It named Gemini CLI as a runtime, which is retired and succeeded by Antigravity, and a
  `uv`-based distribution path, where the package installs with
  `npm install -g mirror-mind`.
- It required a local read-only web surface. The console was retired on 2026-09-17,
  `mirror web` answers `Unknown command: web`, and E6 stayed ✅.
- It rested "documentation audited" on E4, marked done on 2026-05-15, five months before
  the rewrite changed the CLI, the install, and the runtimes. Its CI bullet asked for
  "high coverage", and nothing measures coverage.

Ticking every bullet would still have left known ways to lose data. Ariad's pull
candidates for CV9 showed the same staleness: before this story, `mirror build
pull-candidates` recommended `CV9.E2.S2`, a story written for Gemini CLI and a Python
command.

This story rewrites the CV9 index so that it describes the TypeScript core and what 1.0
promises, states the earlier epics as they are today, and replaces the stale list with
Delivery Stories DS10 to DS19. A persona panel reviewed the plan, found three errors in
the Driver's first draft, and the Navigator decided the questions it left open (see the
[plan review](evidence/2026-11-07-plan-review.md) and the
[decision](../../../decisions.md#cv9-is-re-baselined-on-the-typescript-core)).

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV9.DS10.TS1 | The CV9 index names what 1.0 is, and how each claim is checked | Technical Story | The goal, the five parts of the promise, the scope of the claim (runtimes, platforms, channel, homes), the done condition as a table of claims (claim, story, check, evidence), what lies outside the gate, and the sequencing. The CI row names the gates instead of a coverage number | ✅ Done |
| CV9.DS10.TS2 | Every earlier CV9 epic says what is true of it today | Technical Story | E1 superseded, E2 closed as a container with its remainder carried, E4's audit to be re-run, E6's surface retired; E2.S2 superseded by CV21.DS5; the roadmap index and the worklog's pointer say the same. Ariad's pull candidates stop recommending the two stale ones | ✅ Done |
| CV9.DS10.US3 | The re-baseline is on the record | User Story | A decision entry; the AI audit's open findings settled (AI-18 and AI-19 closed by CV22, AI-08 carried past 1.0, AI-17 carried by DS14); CR202 captured for the extension bindings a journey deletion leaves behind; the panel's review kept as evidence | ✅ Done |

## Non-goals

- Code. This story changes documents.
- Authoring DS11 to DS19. They are named in the CV9 index with their outcomes and what
  they carry. Each gets its package when it is pulled, with the candidate stories its
  own planning decides.
- A release. CR197 ships as a patch beside this story, through the Refinement route.
- CV10 and later.

## Validation Route

1. Read the [CV9 index](../index.md) from the top. Pick any row of the done condition,
   follow its story link, and read how it is checked. Say whether you can tell when 1.0
   is done.
2. Read the "Earlier Epics" table and confirm each row matches what you know of that
   epic.
3. Run `node ts/scripts/checkDocLinks.ts`: it passes.
4. Run `mirror build pull-candidates --journey mirror --method ariad`: CV9 no longer
   lists `CV9.E2.S2` or `CV9.E2` as candidates.

## Closed 2026-11-07

Written, checked, and validated the same day. The docs link check, the retired-surface
tripwire, and the skill-parity check pass, and so do the 159 tests in `ts/test/scripts`.
`mirror build pull-candidates` no longer lists `CV9.E2.S2` or `CV9.E2` in CV9: it lists no
candidate there, because DS11 to DS19 are rows of the CV9 index until each is authored as a
package, DS11 first. The Navigator read CV9 and accepted it ("It's fine"). No release:
the story changes documents only. Handled without an Ariad pull, since it was written by
hand and holds no code; its record is this package and its
[plan review](evidence/2026-11-07-plan-review.md).

## Done Condition

DS10 is done when:

- every row of CV9's done condition is true today or is owned by a named Delivery
  Story, and says how it is checked;
- no CV9 document presents the Python core, `store.conn`, Gemini CLI, a `uv` path, or
  the web surface as live;
- the decision, the audit's status banner, and CR202 exist;
- the Navigator has read CV9 and says they can tell when 1.0 is done;
- the docs link check passes.
