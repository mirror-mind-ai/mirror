[< Story](index.md)

# Test Guide — CV22.DS10.US1

## The Shape Of Testing A Deletion

There is nothing to drive with TDD: no behavior is added, and the acceptance is that a
surface stops existing while everything else stays identical. So the evidence is three
kinds of check, not one:

- **the suites**, proving nothing that survives depended on what went;
- **a residue sweep**, proving the deletion was complete rather than partial;
- **a gate sweep**, re-running the dependency check that authorized the deletion, so that
  "nothing depends on the console" is asserted at the moment of removal and not only
  remembered from Pull.

## Automated Validation

| Area | What it proves |
|------|----------------|
| Gate item 2 sweep | No runtime, skill, extension, hook, script, or workflow invokes `python -m memory web`, and no non-web module imports `memory.web.*`. Re-run at deletion time; a find is reported to the Navigator, never silently ported |
| `uv run pytest` | Green after each plateau. The console's tests go with the console; `tests/unit/memory/test_main.py`'s dispatch patch is updated; the surviving surface tests (`mode_transition`, `soul`, `explorer_story`) still pass untouched |
| `npm test` | Green and unchanged — TypeScript never touched the console, and this proves the deletion did not reach it |
| Residue sweep | `rg "memory\.web\|SurfaceService\|intelligence\.scene"` matches only `docs/project/` and `docs/releases/` |
| Eval discovery | `eval --all` runs with `scene` absent from the denominator. A traceback means the runner's discovery is not capability-driven; a module reported as passing while absent means the denominator lies |
| `check_oracle_drift` | Advanced with its reason: every drifted oracle is a module this story deletes or narrows |
| `check_doc_links`, `check_skill_command_parity` | Clean — the docs stop pointing at a removed command |

## E2E Decision

**Required.** The suites prove the code is consistent; only a real invocation proves the
command is gone from the shipped surface, and only a real Mirror turn proves the deletion
stayed inside its blast radius.

## Navigator Validation

1. **The command is gone.**
   ```bash
   uv run python -m memory web; echo "exit=$?"
   uv run python -m memory --help | grep -c web
   ```
   Pass: unknown command, nonzero exit, `0` matches in help.
   Fail: it serves, or help still lists it.

2. **The eval gate survives the loss of a module.**
   ```bash
   uv run python -m memory eval --all
   ```
   Pass: the run completes, `scene` is absent from the denominator, no import error.
   Fail: a traceback, or `scene` reported at all.

3. **The blast radius held.** Run one real Mirror turn on Pi — a `mirror load`, or the
   next Builder command of this story.
   Pass: identical behavior; the console was never in this path.
   Fail: any changed surface or new error.

4. **Nothing was deleted from a user's home.**
   ```bash
   ls -la ~/.mirror-minds/*/web/
   ```
   Pass: `preferences.json` still present, untouched, unread.
   Fail: missing, or modified.

5. **The docs stopped advertising it.** `README.md`, `REFERENCE.md`, and
   `docs/getting-started.md` mention no console; `docs/releases/pending-cutoffs.md`
   carries the cutoff naming `mirror-gui` as the successor surface.

## Validation Evidence

Pending implementation and validation.
