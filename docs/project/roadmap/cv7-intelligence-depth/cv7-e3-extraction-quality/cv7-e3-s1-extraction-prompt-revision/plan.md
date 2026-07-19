[< CV7.E3 Extraction Quality](../index.md)

# CV7.E3.S1 — Extraction prompt revision (single-pass, eval-driven)

**Status:** Done
**Epic:** CV7.E3 — Extraction Quality
**Requires:** CV7.E1 (eval harness), CV7.E2 (reception now in place)
**Goal:** Rewrite `EXTRACTION_PROMPT` with explicit quality rules, shadow discipline,
and negative examples; tighten the extraction eval to measure the improvements.

---

## What the current prompt gets wrong

The current `EXTRACTION_PROMPT` has three structural weaknesses:

1. **"0 to 5 memories"** — the upper bound invites the model to fill quota with
   trivia. A 5-memory extraction of a substantive conversation often includes 2–3
   observations that would not survive a quality filter.

2. **No negative examples.** The model has no guidance on what NOT to extract.
   Small talk, immediately-answered questions, and technical details without insight
   get extracted alongside genuine memories.

3. **Weak shadow discipline.** The prompt lists `shadow` as "tensions, avoided themes,
   blind spots" but gives no decision rule for when to use it vs `ego`. In practice,
   emotional content defaults to `ego` because the bar for shadow is unclear.

---

## New prompt design

**Core shift:** quality over quantity. Prefer 0–3 memories of real signal over
5 mediocre ones. The model should feel pressure to raise the bar, not fill slots.

**Four structural additions:**

**1. Explicit "what to extract" criteria**
A memory earns its place when: a meaningful decision was made with reasoning that
matters; a genuine shift in understanding occurred; a pattern or tension was named;
a commitment was made; something was learned that will change future behavior.

**2. Explicit negative examples ("what NOT to extract")**
- Small talk, greetings, logistics, scheduling
- Questions that were immediately answered (the answer is the insight, if any)
- Technical details without accompanying insight or decision
- Statements of obvious fact
- Anything the user would not want to find in a search six months from now

**3. Shadow discipline rule**
`layer=shadow` requires positive evidence — not just emotional content, but evidence
of something being avoided, denied, or circled around. When in doubt between `ego`
and `shadow`, use `ego`. Only use `shadow` when: the user names an avoidance, describes
circling the same issue repeatedly, or the assistant surfaces a contradiction the
user acknowledges.

**4. Standalone content rule**
Each memory's `content` must make sense without the conversation. No pronouns without
antecedents, no references to "the conversation" or "we discussed." A reader six months
from now must understand the memory from the `content` field alone.

---

## Eval changes

The current extraction eval passes 5/5 at baseline. After the prompt revision:

- **Tighten `tension-shadow`**: currently accepts `layer in {shadow, ego}`.
  After the revision, the shadow discipline rule should make this reliably `shadow`.
  Tighten the check to require `layer == shadow`.

- **Add `mixed-conversation` probe**: a transcript that contains both substantive
  content (a real decision) and small talk. The new prompt should suppress the
  small talk and produce only memories for the substantive part.

- **Add `shadow-layer-discipline` probe**: a conversation where the user
  explicitly names avoidance around a difficult situation. Should produce
  `memory_type=tension` or `pattern` with `layer=shadow`.

Threshold remains 0.80. With 7 probes, 6/7 must pass.

---

## Implementation sequence

```
1. Rewrite EXTRACTION_PROMPT in src/memory/intelligence/prompts.py
2. Update evals/extraction.py:
   - Tighten tension-shadow probe (require layer=shadow)
   - Add mixed-conversation probe
   - Add shadow-layer-discipline probe
3. Run evals/extraction to verify improvement
4. Update worklog with new baseline
```

No unit test changes needed: unit tests mock `send_to_model` and don't
test prompt content. The eval fixtures are the quality gate.

---

## Files changed

| File | Change |
|------|--------|
| `src/memory/intelligence/prompts.py` | Rewrite `EXTRACTION_PROMPT` |
| `evals/extraction.py` | Tighten `tension-shadow`; add 2 new probes |
| `docs/process/worklog.md` | Record new extraction eval baseline |

---

## Done condition

- `uv run python -m memory eval extraction` passes with ≥ 6/7 (new threshold)
- `tension-shadow` probe passes with `layer=shadow` (tighter check)
- `mixed-conversation` probe passes (small talk suppressed)
- `shadow-layer-discipline` probe passes (shadow layer used for explicit avoidance)
- No unit tests broken (prompt change is transparent to mocked tests)

---

**See also:** [CV7.E3 index](../index.md) · [draft-analysis §5.1](../../draft-analysis.md) · [E1 baseline](../../../../../process/worklog.md)
