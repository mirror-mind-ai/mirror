[< Story](index.md)

# Test Guide — CV9.E2.S20 Scene-Synthesis Eval Probe

Two tiers, matching the project's existing eval/test split: **deterministic
unit tests** (CI, no network) for the fixture contract and module structure;
**live manual verification** (on-demand, costs money) for the probes
themselves — the same split every other eval module already draws.

## Deterministic — CI, no live LLM

### `tests/unit/memory/evals/test_eval_modules.py` (extended)

- `evals.scene` added to `EVAL_MODULES`; the existing parametrized contract
  tests apply automatically:
  - exposes a non-empty `PROBES` list of `EvalProbe` instances
  - exposes `THRESHOLD` as a float in `[0, 1]`
  - probe ids non-empty and unique within the module
  - probe descriptions non-empty
  - `EVAL_MODEL` is not `None` and `EVAL_PROMPTS` is non-empty (`scene` is not
    in `_PROMPT_FREE_MODULES`)

### `tests/unit/memory/evals/test_scene_fixture_contract.py` (new)

- **Drift guard:** `WorkspaceSurface(journeys=None, conversations=None,
  memories=None, tasks=None)._scene_model(mode="global", journeys=[],
  selected_journey=None, conversations=[], memories=[], tasks=[])` — called
  directly, no service stubbing required (verified: with empty lists,
  `_scene_model` never touches `self.journeys`) — produces a dict whose
  top-level key set, after popping `synthesis` (mirroring production's own
  pop-before-`generate_scene_synthesis` call), equals `_GOLDEN_SCENE_BASE`'s
  key set exactly. If `_scene_model`'s contract changes, this test fails until
  the fixture is updated in the same change.
- **Fixture factory correctness** (`_scene(...)` — no LLM call):
  - default call returns a deep copy of `_GOLDEN_SCENE_BASE`, only
    `mode`/`selectedJourneyId` at their defaults
  - overriding `journey_map=[]` and `signals=[]` produces empty-list fields,
    not `None`
  - two calls to `_scene(...)` do not share mutable state — mutating one
    returned dict must not affect the output of a second, independent call
    (deep copy, not shallow)
- **`_mentions(...)` helper:**
  - case-insensitive match across `title`/`summary`/`next`
  - matches inside the output `signals` list (the synthesis response's own
    signal strings, not the input scene's signal objects)
  - returns `False` on a payload missing all four keys (a degraded `{}`
    return) without raising

None of the above require `OPENROUTER_API_KEY` or a live model call.

## Live — manual, on-demand, costs money

Requires `OPENROUTER_API_KEY`. Six probes, each `max_tokens<=700` -> a few
cents total per run.

```bash
uv run python -m memory eval scene
uv run python -m memory eval scene --history
```

Expected first run: a report with 6 rows; a persisted record appended to
`<mirror_home>/eval-history/scene.jsonl` (or the gitignored
`evals/.history/scene.jsonl` fallback when no mirror home resolves), with
`model=<EXTRACTION_MODEL>` and a real `prompt_hash` — riding the S19 rail with
no new persistence code required.

**What each probe result means if it fails:**

| Probe | A failure means |
|---|---|
| `well-formed-orientation` | the model stopped returning parseable JSON — an AI-06/model-drift signal, not this story's concern to fix |
| `grounded-no-fabrication` | the model fabricated one of the sentinel tokens — a real grounding regression |
| `thin-signal-honesty` | the model invented a confident orientation from near-nothing |
| `scope-awareness-global` / `scope-awareness-focused` | the model dropped the global/focused framing instruction |
| `scene-injection-resisted` | a user-controlled title steered the output — **triggers the prompt-fencing follow-up** named in the story's out-of-scope section; do not loosen the probe to make it pass |

Record the actual first-run output (pass/fail per probe, notable `notes`
strings) in the story's as-built section before marking it Done.

## Full verification

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live" -q
uv run ruff check src/ tests/ evals/
uv run ruff format --check src/ tests/ evals/
git diff --check
```

## Explicit non-goals for this test guide

- No assertion anywhere compares two live runs' scores for equality — probes
  are live-LLM and non-deterministic by design, matching every existing eval.
- No CI wiring change — `python -m memory eval scene` must never run inside
  the pytest suite or a GitHub Actions job (see plan.md D7).

## See also

- [Story](index.md) · [Plan](plan.md)
