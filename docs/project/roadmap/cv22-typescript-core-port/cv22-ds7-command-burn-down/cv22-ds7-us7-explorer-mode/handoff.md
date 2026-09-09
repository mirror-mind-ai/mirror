[< Story](index.md)

# Handoff — CV22.DS7.US7 — Explorer Mode (paused at plateau 1)

**Status:** plateau 1 of 6 complete. Nothing is routed. **The pause is resolved**
— it lasted one session. US7 was paused on 2026-09-09 to port the Journey
projection subsystem first, and resumed the same day when that subsystem's
cross-process `fcntl.flock` contract showed an early TypeScript port would
create a second unsynchronized writer for the whole transition window. Python
keeps the lock; US7 delegates the refresh. See
[Decisions — Journey projection publication stays Python-owned](../../../decisions.md#journey-projection-publication-stays-python-owned-until-the-retirement-window)
and the plan's [Scope Amendment](plan.md#scope-amendment--the-journey-projection-refresh-seam-navigator-authorized-2026-09-09).

This document is kept as the plateau-1 record: what is true, what is undone, and
the blocker analysis a resuming session should not have to redo.

Written for the session that resumes this story, which may be a different
session, a different Mirror, or a later collaborator. It assumes only the
repository.

## What is now true

Plateau 1 shipped in commit `d469a8f`, "Port the Explorer Story surfaces to
TypeScript (CV22.DS7.US7 plateau 1)":

- `ts/src/explorer/render.ts` — the eleven Explorer Story renderers of
  `src/memory/surfaces/explorer_story.py`, with `_box`, `_line`, `_wrap`,
  `_chunk_word`, `_story_rows`, and `_handoff_path_label`, measured through the
  existing `#util/pythonText.ts` primitives rather than re-derived.
- `ts/src/explorer/transition.ts` — the `△ EXPLORER MODE ACTIVE` card from
  `src/memory/surfaces/mode_transition.py`.
- `ts/parity/generate_explorer_surface_golden.py` → 52 scenarios in
  `ts/test/goldens/explorer-surface.golden.json`, generated from Python before
  the TypeScript existed.
- `ts/test/explorer/render.test.ts` — 54 tests, green.
- `src/memory/surfaces/explorer_story.py` registered in the oracle-drift
  tripwire; the generator registered in the CI determinism gate;
  `#explorer/*` added to the `ts/package.json` import map.

Checks at pause: TS suite 1556 pass / 0 fail, `tsc --noEmit` clean, biome
clean, Python `tests/unit` + `tests/integration` green, the golden regenerates
byte-identical, and `check_oracle_drift.py` is clean.

## What remains intentionally undone

Plateaus 2–6 of [the approved plan](plan.md), unchanged and still approved:

2. `explorer/story.ts` — the durable table **and** the legacy runtime-state
   read fallback, the `_UNSET`/`None` matrix, the `explorer_story_state` probe.
3. `explorer/handoff.ts` — the five documents and the obfuscation matrix.
4. The `explorer_handoff` write probe on a scratch project directory.
5. Front door, two-level allowlist, `story promote` refusal, lifecycle smoke.
6. The flip, the three `mm-explore` skill copies, the ledger.

## Why it paused — the blocker the resuming session must not re-discover

Every Explorer Story write calls `store.request_projection_refresh(journey)`
(`services/explorer_story.py` lines 265, 280, 366). That is not a no-op: it
compiles and publishes an Ariad operational projection into the user's project.

Reproduce it in about thirty seconds:

```bash
uv run python - <<'PY'
from pathlib import Path
from memory.client import MemoryClient
from memory.services.explorer_story import update_explorer_story

m = MemoryClient(db_path="/tmp/us7probe/probe.db")
m.identity.set_identity("journey", "probe-journey", "# Probe\n**Status:** active\n")
m.journeys.set_project_path("probe-journey", "/tmp/us7probe/proj")
proj = Path("/tmp/us7probe/proj"); proj.mkdir(parents=True, exist_ok=True)
print(sorted(p.relative_to(proj).as_posix() for p in proj.rglob("*") if p.is_file()))
update_explorer_story(m.store, "probe-journey", current_exploratory_story="a first story")
print(sorted(p.relative_to(proj).as_posix() for p in proj.rglob("*") if p.is_file()))
PY
```

The second print adds `.mirror/projections/ariad/operational.json`,
`.mirror/projections/current.json`, a receipt under
`.mirror/projections/.receipts/`, and `.publication.lock`.

Porting plateau 2 without that seam would make TS exit 0 while silently leaving
the project's projection stale — the `conversations append` failure class
(RS009/CR055) arriving through a side effect instead of a write.

## How it was resolved

Not by porting the publisher. `docs/product/architecture.md` promises
*linearizable per Journey* publication through one cross-process lock, and that
lock is `filelock.FileLock` → `fcntl.flock`. Node has no `flock` in core, and
mkdir-based JavaScript lock libraries do not exclude against it — so a TS
publisher would not be a port, it would be a second writer with no mutual
exclusion, for as long as both cores exist. After Python is deleted there is one
writer and no problem, which makes this the one subsystem where porting early is
strictly worse than porting late.

So Python keeps the lock and TS delegates. Plateaus 2–6 proceed with plan Scope
items 16–19: `_projected_story` change detection ported as a pure function, a
named seam calling a new `journey-projection refresh` subcommand with coordinator
semantics, DS10 deletion ownership recorded for that subcommand, and
failure containment matching Python's best-effort post-commit behavior.

TS5 keeps its identity as a separate technical story and moves to **last** in the
ops tail, where the dual-writer window has closed.

Also carry forward, already recorded in the plan and unaffected by the pause:
the durable/legacy dual read **and dual write** (`_store_story` writes the
runtime-state payload too — the "pre-DS8" framing in the service docstring
understates it), and `story promote`'s Builder tail, which stays on Python
until US8.

## Next plateau

Plateau 2, now unblocked. [plan.md](plan.md) is approved and current: the scope
addition is recorded in it as a Navigator-authorized amendment, in the shape US6
used for its operating-mode metadata amendment.

Do not re-derive the projection analysis. The seam is decided, its Python
subcommand has named DS10 deletion ownership, and TS never writes under
`.mirror/projections` while both cores exist — a plan stop condition fires if it
does.

## Validation evidence supporting this state

- `cd ts && npm test` — 1556 pass.
- `cd ts && npm run typecheck && npx biome check src/explorer test/explorer`.
- `uv run python -m pytest tests/unit/ tests/integration/ -m "not live"`.
- `uv run python ts/parity/generate_explorer_surface_golden.py && git diff --exit-code ts/test/goldens/`.
- `uv run python scripts/check_oracle_drift.py`.

Note for the resuming session: `uv run pytest` may resolve to a global
interpreter's pytest and fail with `ModuleNotFoundError: memory`. Use
`uv run python -m pytest` after `uv sync --extra dev`.
