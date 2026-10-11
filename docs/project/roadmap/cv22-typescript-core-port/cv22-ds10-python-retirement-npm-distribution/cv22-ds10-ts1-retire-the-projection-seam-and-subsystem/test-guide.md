[< Story](index.md)

# Test Guide — CV22.DS10.TS1

## Automated Validation

| Area | What it proves |
|------|----------------|
| No-spawn guard (new, TDD) | An Explorer write and a Builder cursor write under a `node:child_process` spy spawn zero processes. Written first; fails against the seam; passes without it |
| Explorer and Builder surface goldens (existing) | The rendered output of every write is byte-identical before and after — the refresh was a side effect that never reached stdout, and removing it must stay invisible |
| `npm test` | Green with the narrower `CursorWriteDeps` and Explorer deps; no test skipped that used to exercise the seam |
| `uv run pytest` | Green after the subsystem, its tests, its fixture, and the three outside tests are updated; no `journey_projections` import survives |
| Extension API refusal | A Python extension calling `api.journey_projections` receives a refusal naming the removal, not an `AttributeError` |
| Residue check | `rg -l "journey_projection\|journey-projection\|projectionRefresh\|filelock"` matches only `docs/project/` and `docs/releases/` |

## E2E Decision

**Required.** The story's claim is "no process is spawned." A unit spy proves it for the
code path; only a real front-door invocation proves it for the process a user runs.

## Navigator Validation

1. **Builder write, traced.** With `MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS=1` in the
   environment (so any residual spawn fails loudly rather than silently) and `ps` or
   `fs_usage` watching for `uv`/`python`, run a Builder lifecycle transition on this
   repository — for example `build check-implementation`, or the next real transition of
   this story.
   Expected: the surface renders exactly as it did before the change; no `uv` or
   `python` process; `.mirror/projections/current.json` mtime unchanged.
   Pass: all three. Fail: any spawn, any visible difference, the mtime moving.
2. **Explorer write, traced.** Same setup; save an Exploratory Story on a scratch
   journey. Same expectations.
3. **The cutoff is real.** `uv run python -m memory journey-projection capabilities`
   answers unknown command; the TypeScript front door refuses `journey-projection` with
   the cutoff message; `REFERENCE.md` no longer lists it.
4. **The last Python-bearing tag is untouched.** Check out the last tag before this
   change and confirm `journey-projection capabilities` still answers there. The cutoff
   is for the next version, not the previous one.

## Validation Evidence

Pending implementation and validation.
