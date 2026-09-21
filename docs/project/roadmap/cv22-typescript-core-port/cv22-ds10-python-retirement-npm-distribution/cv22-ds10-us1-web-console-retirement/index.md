[< Parent](../index.md)

# CV22.DS10.US1 — Web console retirement

**Status:** ✅ **Done — 2026-09-19.** `python -m memory web` no longer exists; the console,
its six web-only read models, and the scene surface it alone rendered are deleted — 5,480
lines across three layers, two of which the gate never named. Navigator validation accepted
**Type:** User Story
**Depends on:** the [2026-09-17 decision](../../../../decisions.md#the-web-console-is-retired-not-ported-and-ds7-closes-at-1414)
that retired the console rather than porting it, which closed DS7 at 14/14 and moved the
deletion here

---

## Outcome

`python -m memory web` no longer exists. The console's process, endpoints, static assets,
read models, and the LLM surface that only it rendered are deleted; user-facing
documentation stops advertising it; the cutoff names `mirror-gui` as the successor
surface; and web-only preferences state has a recorded disposition rather than being
orphaned. No TypeScript replacement is built.

## Story Statement

As a Mirror user on Pi, Gemini CLI, Codex, or Claude Code,
I want the local web console removed rather than carried,
so that the migration stops maintaining a surface the Navigator decided not to port, and
DS10's deletion and npm gates can open on a Python core with nothing graphical left in it.

## What The Inventory Found

Run at Pull, because gate item 2 *is* a check and its result shapes the story.

**Gate item 2 passes.** No runtime, skill, extension, hook, script, or CI workflow invokes
`python -m memory web`. The only non-web importers of `memory.web.*` are the
`__main__.py` entry and the console's own tests — both already in the gate's deletion
list — plus exactly one test to update, `tests/unit/memory/test_main.py:37`, which patches
`memory.web.server.main` to assert dispatch.

**The console is 39 files, 3,568 Python lines, 3 static assets.**

**The gate did not name `src/memory/surfaces/`, and most of it dies here.** 2,601 lines,
nine modules, split cleanly by consumer:

| Module | Non-web importers | Disposition |
|---|---|---|
| `atlas`, `workspace`, `evidence`, `search`, `objects`, `models` | none | deleted with the console |
| `mode_transition` | `cli/build`, `cli/soul`, `cli/explore`, `skills/mirror` | stays until TS5 |
| `soul` | `cli/soul` | stays until TS5 |
| `explorer_story` | `cli/explore` | stays until TS5 |

`client.py` composes `SurfaceService` from exactly the six web-only modules, so
`client.surfaces` would otherwise become a facade over deleted code.

**And a third layer the gate did not reach: the scene surface.**
`src/memory/intelligence/scene.py` (112 lines, `SCENE_SYNTHESIS_PROMPT` and
`generate_scene_synthesis`) has exactly one production caller — `web/server.py:18`. The
DS8.TS1 decision already recorded that `scene` "reaches users only through the web process
this Delivery Story cuts over". With the console gone the feature has no delivery path in
any runtime, so it is retired here rather than left as an unreachable prompt.

## The Decision This Story Takes

**D1 — the `scene` eval retires with the surface it grades.** `evals/scene.py` imports
`SCENE_SYNTHESIS_PROMPT` and `generate_scene_synthesis` directly and derives its golden
from `WorkspaceSurface._scene_model()`. Deleting the surface deletes its subject. The
alternative — keep `workspace.py` alive solely to feed an eval of a feature no user can
reach — preserves a measurement of nothing.

This resolves, rather than defers, what the DS10 eval gate listed as an open disposition
("`scene` follows this story's web cutover"). **TS3 inherits one fewer module and a
recorded reason.** Two consequences to carry, not to hide:

- **D-017's worked example was `scene`.** The debt is about injection probes being
  averaged into a module score, evidenced by `scene` reporting PASS while
  `scene-injection-resisted` printed OBEYED. Retiring the module does not close D-017 —
  the arithmetic is identical for `extraction`, `shadow`, `consolidate`, `title_tags`,
  and `conversation_summary` — but it removes the example. D-017's entry is updated so it
  does not cite a module that no longer exists.
- **AI-22's fence retires with its prompt.** The shared helpers `fence_untrusted` and
  `asserted_in_own_voice` live in `intelligence/prompts.py` and serve extraction, shadow,
  consolidate, and title_tags. They stay. Only scene's own fenced prompt goes.

## Acceptance Behavior

```text
Given any runtime — Pi, Gemini CLI, Codex, Claude Code
When  a user runs `python -m memory web`
Then  it is an unknown command, and no other command's behavior changed

Given the repository after this story
Then  src/memory/web/, the six web-only surface modules, intelligence/scene.py,
      evals/scene.py, and their tests are gone; `rg "memory.web|SurfaceService"`
      matches only roadmap, decisions, and release notes
And   mode_transition, soul, and explorer_story still serve the Python CLI, which
      remains compatibility-only until TS5

Given README, REFERENCE, and getting-started
Then  none advertises a console, and the cutoff names mirror-gui as the successor

Given a user with <mirror-home>/web/preferences.json
Then  the file is left in place, inert, with that disposition recorded — nothing
      deletes state under a user's home on their behalf

Given the packaged artifact
Then  it contains no web server, no endpoint inventory, and no static assets, and
      no TypeScript replacement was built
```

## Scope

- Delete `src/memory/web/` (39 files), the `web` entry and usage lines in
  `src/memory/__main__.py`, and `tests/unit/memory/web/`.
- Delete `src/memory/surfaces/{atlas,workspace,evidence,objects,models,search}.py` and
  their tests; narrow `SurfaceService` in `src/memory/surfaces/__init__.py` and
  `client.py` to what survives, or remove the facade if nothing does.
- Delete `src/memory/intelligence/scene.py`, `tests/unit/memory/intelligence/test_scene.py`,
  `evals/scene.py`, and its fixture-contract test; drop `scene` from the eval runner's
  discovery.
- Update `tests/unit/memory/test_main.py` (the dispatch patch).
- `README.md`, `REFERENCE.md`, `docs/getting-started.md`: remove the console.
  `docs/product/architecture.md`: the `web/` and `surfaces/` package-map lines and the
  web read-model paragraphs.
- `docs/releases/pending-cutoffs.md`: the cutoff, naming `mirror-gui` and the
  preferences-state disposition.
- `docs/project/debt.md`: D-017's example updated.
- The DS10 parent's retirement gate: its six items checked off.

## Out Of Scope

- Any TypeScript web surface, endpoint, or static asset. `mirror-gui` owns a future
  graphical surface; building one here would pre-empt that journey's design.
- `mode_transition`, `soul`, `explorer_story` — live Python CLI surfaces until TS5.
- The shared fencing helpers in `intelligence/prompts.py`.
- Deleting `<mirror-home>/web/` from any user's home.
- D-017 itself, which survives the loss of its example.
- The recursive-hierarchy semantics the retired DS7.US9 would have ported: they live in
  TypeScript already (`listJourneyOptions`, `resolveParentJourney`,
  `validateParentJourney`, `createJourney`, `setParentJourney`) and are untouched by this
  deletion.

## Validation

Navigator-visible route plus automated checks:

1. `python -m memory web` is an unknown command on both engines; `--help` no longer lists
   it.
2. `uv run pytest` and `npm test` green; `uv run python -m memory eval --all` runs with
   `scene` absent from the denominator rather than failing.
3. A residue check finds `memory.web`, `SurfaceService`, and `scene` only in roadmap,
   decisions, debt, and release notes.
4. A Mirror session on Pi behaves identically — the console was never in that path, and
   this proves it.

## Outcome

Done 2026-09-19. Four commits: `5e9b9d2a` (the process, and the check that proves it stays
gone), `48101788` (the read models and the scene surface), `8013db74` (docs and cutoff),
plus closure.

**The check found a defect before it was committed.** `check_retired_surfaces.py` was
written first and run against the tree as it stood; besides failing on the console as
intended, it reported that TS1 had left `journey_projections/schema_documents/*.json` in
`pyproject.toml`'s package-data — a packaging reference to a directory deleted the day
before. Harmless and invisible, and exactly the residue a large deletion leaves. It is now
in CI beside the oracle-drift tripwire, with a row per retired surface, so TS2, TS3, and
TS4 inherit the mechanism rather than writing three more scripts.

**Validation:** 2467 Python and 2372 TypeScript tests green; `web` exits 1 with no help
row; a real Pi session unchanged; `preferences.json` untouched. `eval --all` ran with the
denominator at eleven, `scene` absent, no import error — and every surviving module scored
**identically to the 2026-09-13 baseline, probe for probe**. The suite's one failure is
`routing`, which is D-005 and reproduced its recorded failures by name.

**Debt:** deferred to TS3, which owns the eval harness — the disposition of
`eval-history/scene.jsonl` (six runs of a retired module, including D-017's evidence) and
the fact that `routing` is now the sole red. Neither is a defect this story introduced.
**CR090** was captured during the story's own Debt Review: the `DEBT_REVIEW_STARTED`
surface mixes Portuguese into an English sentence, in both engines, faithfully ported.

**What the deletion taught.** Two eval lists behaved differently and the difference was
the point: capability-based discovery dropped `scene` for free, while the contract test
whose docstring says adding an eval "must consciously join the release gate" forced the
*shrinking* denominator to be a decision someone wrote down. A gate that only notices
growth is half a gate.
