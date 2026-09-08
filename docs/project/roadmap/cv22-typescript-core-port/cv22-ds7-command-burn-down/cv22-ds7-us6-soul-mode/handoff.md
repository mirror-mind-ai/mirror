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

**Next plateau.** Plateau 2 — `ts/src/soul/state.ts` (now complete; see below).

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

---

## Plateau 2 — Soul session state (2026-09-08)

**What is now true.**

`ts/src/soul/state.ts` ports the ritual's provisional state on
`runtime_sessions.metadata`: session-id resolution, fruit maturation, harvest
promotion, and both clears. Graded by `soul-state.golden.json` — 33 state
scenarios (3 refused) and 6 session-id scenarios — plus a new `soul_state`
write probe replaying the ritual on a copy of the real demo database. 119 Soul
tests green; TS suite 1418 green; typecheck, biome, ruff clean; golden
byte-identical under 3.10, 3.12, and 3.14.

`services/soul.py` and `cli/soul.py` joined the oracle tripwire; the state
generator joined the determinism gate and `soul_state` joined the CI write-probe
loop.

**Mutation evidence.** Four deliberate mutations, all caught by the unit
golden:

| Mutation | Scenarios failed |
|---|---:|
| `JSON.stringify` instead of Python's `", "`/`": "` separators | 14 |
| write `"{}"` instead of SQL NULL when the metadata empties | 2 |
| let `clear` create a session row Python never touches | 2 |
| harvest promotes without popping the maturation key | 4 |

The probe was checked the same way: the harvest mutation flips it to
`match: false`, so it is not a vacuous pass.

**What the probe does and does not prove.** `writeParityFixture.ts`
canonicalizes every `metadata` cell (parse, then key-sorted re-stringify) so
write parity grades the VALUE rather than the serialization dialect — a
deliberate DS6.US1 decision. Byte parity of the column is therefore pinned by
the unit golden, which reads the raw column; the probe proves the state a real
database ends in, step by step. Both statements are needed; neither implies the
other.

**Next plateau.** Plateau 3 — `ts/src/soul/prompts.ts`: the three voice
templates read from `src/memory/prompts/*.md` by resolved path (no vendored
copy) and the Self-identity placeholder replacement, which must be a literal
replacement rather than a regex substitution.

**Found on the way, not fixed — needs a Navigator decision.**

US4 writes `runtime_sessions.metadata` in a different JSON dialect than Python.
Proven on two temporary homes running the same command:

```text
python: '{"operating_mode": {"active_mode": "Soul Mode", "active_journey": "mirror-ts-core"}}'
ts:     '{"operating_mode":{"active_mode":"Soul Mode","active_journey":"mirror-ts-core"}}'
```

`activateOperatingMode` uses `JSON.stringify`; Python uses
`json.dumps(..., ensure_ascii=False)`. Nothing breaks — both cores parse either
form, and the write-parity harness canonicalizes metadata precisely so a
dialect difference does not fail. But the column is co-written by both cores
until every command that touches it is flipped, and `ts/src/util/pyGenerators.ts`
exists because this project treats a byte divergence in a shared column as a
defect elsewhere.

Soul writes the Python dialect (`pythonJsonDumps`), so US6 was coherent on its
own; the open question was whether `activateOperatingMode` should be corrected
too. **Navigator decided on 2026-09-08: fix it now, inside US6.** Recorded as a
scope amendment in [plan.md](plan.md#scope-amendment--operating-mode-metadata-dialect-navigator-authorized-2026-09-08)
and resolved below.

---

## Plateau 2b — operating-mode metadata dialect (2026-09-08)

**What is now true.**

All three write paths in `ts/src/mode/operatingMode.ts` — session activate,
global activate, session deactivate — serialize through `pythonJsonDumps`. Both
cores now store identical bytes, proven end to end on two temporary homes
running the same command through each engine:

```text
python: '{"operating_mode": {"active_mode": "Soul Mode", "active_journey": "mirror-ts-core"}}'
ts:     '{"operating_mode": {"active_mode": "Soul Mode", "active_journey": "mirror-ts-core"}}'
```

**Why a new golden was necessary.** Reverting the fix fails 7 scenarios of the
new `operating-mode-metadata.golden.json` and **nothing else in the 1420-test
suite**. That is the measurement of the blind spot: `mirror-state.golden.json`
stores metadata as a parsed object and the write-parity harness canonicalizes
the cell before hashing — both correct for what they grade, and between them
blind to a dialect divergence for as long as it existed. The new golden asserts
the raw column string and nothing else.

**Evidence.** TS suite 1427 green; all nine write probes `overall_match: true`;
the conversation-logger lifecycle smoke green; golden byte-identical under 3.10,
3.12, and 3.14; typecheck, biome, ruff clean.

**Not touched.** The sticky-defaults and conversation writers already use
`pythonJsonDumps`; no mode surface rendering changed. `mode` stays routed to TS
exactly as before — this changes the bytes it writes, not where it runs.
