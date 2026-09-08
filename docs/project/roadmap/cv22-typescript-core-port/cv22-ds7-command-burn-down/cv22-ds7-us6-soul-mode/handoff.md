[< Story](index.md)

# Handoff — CV22.DS7.US6 — Soul Mode

Written for the next session, per the single-owner plateau discipline in
[collaboration-strategy.md](../../collaboration-strategy.md).

---

## Plateau 1 — Soul surfaces (2026-09-08)

**What is now true.**

The eight renderers of `src/memory/surfaces/soul.py` are ported to
`ts/src/soul/render.ts` and graded by `ts/test/goldens/soul-surface.golden.json`
— 76 scenarios, 57 rendered and 19 refused, generated from Python by
`ts/parity/generate_soul_surface_golden.py`. 78 TS tests green; full TS suite
1377 green; Python suite 2747 green; typecheck, biome, and ruff clean.

The golden is byte-identical under Python 3.10, 3.12, and 3.14. The generator
is in the determinism gate and `surfaces/soul.py` is in the oracle-drift
tripwire.

Two Python string primitives were missing from `ts/src/util/pythonText.ts` and
were added there rather than inside the Soul module, because US7 and US8 wrap
text through the same helpers: `pySplitWhitespace` (Python's `str.split()`
separator set) and `pySplitLines` (the eleven `str.splitlines()` boundaries),
plus `pyRStrip`.

**Evidence that the golden discriminates.** Three deliberate mutations of the
implementation were run against it:

| Mutation | Scenarios failed |
|---|---:|
| pad by UTF-16 units instead of code points | 5 |
| `split("\n")` instead of Python `splitlines()` | 4 |
| JavaScript `\s` instead of Python's whitespace set | 2 |

A green run alone would not have distinguished a correct port from a corpus
too weak to notice.

**What remains intentionally undone.**

Nothing is routed. `routeMemoryCommand(["soul", …])` still returns Python, and
no gate exists yet — `MIRROR_TS_SOUL` arrives in plateau 6. The renderers have
no caller inside TS; plateaus 2–5 supply them.

**Next plateau.** Plateau 2 — `ts/src/soul/state.ts`: session-id precedence
(explicit → operating-mode session → `MIRROR_SESSION_ID` →
`__global_soul_mode__`) and the fruit/harvest metadata rules on
`runtime_sessions.metadata`, including the `NULL`-vs-`{}` empty-metadata
contract and the move-and-pop behavior of `harvest set`. Golden plus the
`soul_state` write probe on a redacted copy.

**Blocking check owed before plateau 4.** Confirm `identity_integrations` is in
the TS-owned schema (`ts/src/db/schema.ts`). The plan's database-architect
review makes a Python-only table a stop condition, not something to work
around.

**Found on the way, not fixed.**

- `render_active_rite` accepts `listening_for` and never uses it, and
  `ACTIVE_RITE_DEFAULTS[voice]["listening_for"]` is likewise dead. The CLI
  exposes it as `--listening-for`, so a user can pass a value that changes
  nothing. Reproduced faithfully (scenario `rite_listening_for_is_inert`) and
  recorded as a Debt Review candidate — a port is not the place to decide
  whether the parameter should render or disappear.
- `uv run pytest` on this machine resolves to a mise-installed interpreter's
  pytest outside the project venv, which cannot import `memory`; the venv had
  no pytest until `uv sync --extra dev`. Portable validation says a future
  session must be able to run the checks without reconstructing intent, so the
  working command is `uv run python -m pytest` after `uv sync --extra dev`.
- One pre-existing flake reproduced during the full Python run:
  `test_operations_run_api_executes_runtime_diagnose_through_controlled_command`
  failed once on a wall-clock budget and passed on re-run. Already captured as
  **CR058** under RS010; no new record needed.
