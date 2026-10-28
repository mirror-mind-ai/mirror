[< Story](index.md)

# Test Guide — CV9.DS9.TS2

## Automated Validation

TS2 changes no product code; its checks guard the measurement.

| Check | Where it runs |
|---|---|
| The draw is deterministic, and only ended conversations with at least four messages are drawn: 16 with a journey (at most 5 per journey), 8 without, 1 pilot | `sample.mjs --check` |
| The transcripts are copied to scratch and the database is closed before any model call | `sample.mjs` (it opens the database read-only and closes it before returning) |
| Each arm ran in its own process, and every traced call carries the arm's model and reasoning setting | `replay.mjs --assert-arms` |
| Every label maps back to its model, per conversation and surface | `judge.mjs --check` |
| Every verdict validates against the schema; an invalid one is re-asked once, then counted as a failure | `judge.mjs` |
| The prompt used for every sample call has the SHA-256 recorded after the pilot | `judge.mjs` |
| The content check: no 40-character run of a sampled message and no output string of 12 characters or more appears in the files to be committed | `score.mjs --check-content`, before every commit |
| Nothing written: no `llm_calls` row since the run began, in either home, names `gpt-6-luna`, `claude-haiku-5.5`, or `kimi-k3.1-pro` | `score.mjs --check-no-rows` |

Repository checks, all green:

```bash
node ts/scripts/checkDocLinks.ts
git add <story files> && node ts/scripts/checkRetiredSurfaces.ts   # the sweep reads git ls-files
```

## E2E Decision

required. The replay runs the product's own functions against the live providers on
24 production-home conversations: Flash Lite as it ships, and Luna and Haiku at
`MEMORY_EXTRACTION_REASONING=none`, one process per arm. Kimi K3.1 Pro ranks blind
with `data_collection: "deny"`. The evidence, content-free, is in
`evidence/<date>-replay/`.

Thresholds, from the plan:

- **Complete triples after retries:** memories and tasks at least 13 of 16; title,
  summary, and tags at least 20 of 24.
- **The judge's self-consistency:** at least 70% of pairwise orderings agree.
- **The Navigator's calibration:** more than 60% of pairwise orderings agree with the
  judge. Chance is 50%.

## Navigator Validation

1. **Before seeing any result,** open `~/mirror-ts2-replay/calibration.md`. Rank each
   surface of its six conversations, best first, and give me your rankings.
   - **Expected:** about 25 to 30 minutes. The labels are those the judge saw, and
     the models stay hidden.
2. Read `evidence/<date>-replay/README.md`.
   - **Expected:**
     - per-surface pairwise wins, scores, flags, and the length correlation;
     - the judge's self-consistency and your agreement with it;
     - operations and cost;
     - the recommendation, with the rule applied step by step.
3. Open `~/mirror-ts2-replay/review.md` on your machine.
   - **Expected:** every conversation's surfaces, with the three outputs and their
     models revealed, and the judge's ranks and reasons. Skim a few and see whether
     the ranks match your sense of them.
4. In the evidence, find the content check and the no-candidate-rows query.

- **Pass:**
  - the minimums met;
  - the judge consistent, and agreeing with you on more than 60% of orderings;
  - the evidence content-free;
  - no row written to either home.
- **Fail:**
  - a surface below its minimum;
  - an arm calling a model that is not its own;
  - the judge inconsistent, or no better than chance against you;
  - content in committed evidence;
  - a row written to a home.

## Validation Evidence

**Automated:**

- `sample.mjs --check`: the same draw; all 25 ended, with at least four messages; the
  16/8 shape with the cap of 5.
- `replay.mjs --assert-arms`: 117, 109, and 109 traced calls (Flash Lite, Luna,
  Haiku), none on another model or setting.
- `judge.mjs --check`: every label mapping inverts.
- All 30 verdicts were valid against the schema, with the prompt hash frozen after
  the pilot.
- `score.mjs --check-no-rows`: 0 rows in production, 0 in development.
- `score.mjs --check-content`: passed on every file of the evidence. It ignores
  whitespace-only runs and single common words, and prints any other hit, which can
  only be the kit's own text.

**E2E:**

- the replay of 24 production-home conversations, with no surface failed after
  retries;
- the judge's self-consistency at 0.83;
- the Navigator's calibration of 26 surfaces: agreement 0.55, below the plan's 0.60.

The stop condition is met; see the [evidence](evidence/2026-10-26-replay/README.md).

**Navigator validation: accepted on 2026-10-28.** Step 1, the blind calibration of 26
surfaces, was done before any result was computed. Steps 2 to 4 followed: the evidence
read, the local review page, and the content and no-row checks. The stop was decided:
accepted as measured, and US3 decides with the Navigator's rankings as its main
evidence.
