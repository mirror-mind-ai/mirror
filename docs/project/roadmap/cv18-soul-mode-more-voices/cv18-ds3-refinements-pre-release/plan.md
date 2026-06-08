[< Story](index.md)

# Plan — CV18.DS3 Refinements Pre-Release

## Boundary

This story is for release tuning after Wisdom Voice and Beauty Voice are usable. It is not a bucket for new product scope. Any change must improve the experience of the expanded voice constellation before `v0.25.0` ships.

## Design

Run the Soul Mode flow in Pi as a user would:

```text
enter Soul Mode for soul-mode
[answer with real living matter]
hear Wisdom Voice
continue
hear Beauty Voice
mature or harvest a fruit if relevant
```

Collect friction in three categories:

1. **Ritual grammar:** labels, icons, card layout, bridge wording.
2. **Voice coherence:** whether Wisdom advises too much or Beauty bypasses difficulty.
3. **Flow ergonomics:** whether Possible Listenings and natural-language voice selection remain clear.

Only implement corrections that are small, testable, and necessary for release quality.

## Implementation Notes

Possible touch points:

- `.pi/skills/mm-soul/SKILL.md`
- Soul surfaces and prompt files
- focused tests that encode corrected behavior
- roadmap docs and test guides

## Risks

### Scope creep

Pre-release refinements can become a stealth feature phase. Keep a strict boundary: no new voice, no integration, no web buildout.

### Overfitting to one session

Do not rewrite core behavior based on a single awkward phrase unless it exposes a structural problem.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/services/test_soul.py tests/unit/memory/services/test_soul_prompt.py tests/unit/memory/surfaces/test_soul.py -q
uv run ruff check src tests
uv run ruff format --check src tests
```

Manual Pi validation:

- Enter Soul Mode.
- Answer with living matter.
- Ask for Wisdom Voice.
- Ask for Beauty Voice.
- Confirm the voices feel like lenses, not agents.
- Confirm the responses do not mutate journal or identity automatically.
