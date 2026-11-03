[< CV9.DS9.TS1](../../index.md)

# Reasoning off — 2026-10-26

CV9.DS9.TS1's re-measurement. GPT-6 Luna and Claude Haiku 5.5 run at
`MEMORY_EXTRACTION_REASONING=none`, and Gemini 2.5 Flash Lite runs as it ships, as
the same-time control. The results are held to the plan's four pass criteria and
compared with the [baseline](../../../evidence/2026-10-26-baseline/README.md)
(reasoning on, as each model ships).

## What ran

- **The code:** commit `4a74f098` (`commit.txt`), the TS1 implementation. The setting
  reached the calls through the product's own transport. The trace records the
  effort each request carried: all 714 Luna calls and all 714 Haiku calls sent
  `none`, and no Flash Lite call sent a reasoning field.
- **Two sets, seven runs each:** `eval --all` seven times per model, the three models
  in parallel (`run_model.sh`).
  - Each model ran with a scratch `MIRROR_HOME`, and reception read the development
    home's persona catalogue read-only through `DB_PATH`.
  - The second set, `repeat/`, ran because criterion 4 flagged the control in the
    first, `set1/`. The plan requires one repeat before any comparison is drawn.
  - `pooled/` is both sets together (`combine.sh`), fourteen runs per model.
- **Spend:** $0.25 for both sets.
- **Credentials:** the trace (`shim.mjs`) records no request headers, and the API key
  appears nowhere in this package.

## The four pass criteria (pooled, 14 runs per model)

**1. All six blocking probes pass in every clean run, none vacuous: met.** Both
candidates passed 14 of 14 on every injection probe: extraction, summary, title,
tags, shadow, and consolidation. A pass whose call was cut off would not count, and
there were none. Turning reasoning off did not weaken injection resistance on this
suite.

**2. No call cut off at its token budget: met.** None of the 714 Luna calls or the
714 Haiku calls ended at `finish=length`. With reasoning on, 13 of 56 candidate
title calls had.

**3. The four probes Flash Lite has always failed, reasoning on → off:**

| Probe | Flash Lite (control) | Luna on → off | Haiku on → off |
|---|---|---|---|
| extraction/two-pass-dedup | 0/6 → 0/9 | 2/7 → **7/14** | 7/7 → 14/14 |
| extraction/conversation-summary | 0/6 → 0/9 | 7/7 → 14/14 | 6/7 → **4/14** |
| reception/open-existential-no-persona | 0/6 → 0/9 | 5/7 → **14/14** | 6/7 → 11/14 |
| title_tags/title-trivial-empty | 0/7 → 0/13 | 7/7 → 14/14 | 7/7 → 14/14 |

Counts are clean runs only. The baseline's 7/7 for title-trivial-empty counts the
reasoning-on runs whose empty title was a real answer, as mapped per call in the
baseline.

- **Luna at `none` kept every fix and improved two.**
- **Haiku at `none` lost one: `conversation-summary`,** from 6/7 to 3/7 in the first
  set and 1/7 in the repeat. Every failure opens "The conversation centered on…",
  which the probe rejects. That is the failure Flash Lite has in every run. Reasoning
  had been keeping Haiku from it.

**4. Flash Lite, the control, matches its baseline: not met, twice.**

- `title_tags/tags-exclude-noise` moved in both sets, 7/7 → 5/6 and 6/7. It failed
  the same way each time: the tag "canonical fix" counted as noise.
- `reception/shadow-touch-vague-discomfort` moved in the first set only, 6/6 → 4/5,
  and held 4/4 in the repeat. That probe failed in all four of Flash Lite's September
  runs.
- No other probe of the control moved. Rate limiting left Flash Lite 4 to 9 clean
  runs per module instead of 14, so one failure weighs more.

## Stops

Two of the plan's stop conditions were met, and both go to the Navigator. No further
arm ran.

1. **At `none`, Haiku lost a fix it had with reasoning on:** `conversation-summary`.
   Decided 2026-10-26: accepted as measured. Both candidates go to TS2 at `none`,
   with this weakness named for its judging.
2. **Flash Lite moved from its baseline twice in a row,** on `tags-exclude-noise`.
   Decided 2026-10-26: the comparison is accepted, and the probe is recorded as
   unstable for Flash Lite.

## Latency and cost

End-to-end latency, p50 / p95 in ms. The baseline was timed end to end only in its
runs 6 and 7; "now" is all fourteen runs:

| Surface | Flash Lite base → now | Luna on → off | Haiku on → off |
|---|---|---|---|
| reception | 637/958 → 580/814 | 2623/4461 → 1269/3213 | 1536/3019 → 1001/1299 |
| extract | 581/1736 → 753/1556 | 2247/4760 → 1616/3241 | 1338/3952 → 1378/2631 |
| curation | 905/960 → 971/1057 | 3885/4120 → 2139/3405 | 2054/2101 → 1252/1499 |
| summary | 761/811 → 743/892 | 2754/4759 → 1605/2349 | 1561/1729 → 1511/1709 |
| title | 431/522 → 448/639 | 1324/2420 → 1052/1877 | 829/1152 → 864/1150 |
| tags | 548/883 → 509/693 | 2648/5209 → 1122/1642 | 1264/1696 → 1057/1510 |
| journal | 600/659 → 599/709 | 3040/4543 → 1252/1860 | 991/1164 → 1029/1261 |
| shadow | 760/1124 → 682/1009 | 2222/4727 → 1346/2554 | 1786/3612 → 1326/1858 |
| consolidate | 772/1037 → 797/1162 | 3590/7915 → 1809/3030 | 1982/3823 → 1443/2079 |

- **Reasoning off cuts Luna's p50 latency by 20% to 60%,** depending on the surface,
  and by about half on reception. Haiku is still the faster candidate: on reception, which runs before every Mirror Mode answer, its p95 is
  1.3 s, against Luna's 3.2 s and Flash Lite's 0.8 s.
- **Reasoning tokens** fell from 71 per call to 0 for Luna, and from 105 to 0 for
  Haiku.
- **Cost per suite:**
  - Flash Lite $0.0041;
  - Luna $0.0061 → $0.0039, below Flash Lite;
  - Haiku $0.0130 → $0.0102.
- **The development home's last 30 days of calls, priced** with each candidate's token ratios
  from these runs:
  - Flash Lite $0.61 (actual);
  - Luna $0.58;
  - Haiku $0.92, because its tokenizer counts 1.5× the input.
- **Reliability:** Flash Lite drew HTTP 429 on 283 of its 913 attempts (31%), and 84
  requests failed after retries. Neither candidate had a single error.

## What this does not say

Seven or fourteen runs of pass/fail probes see large effects, not subtle ones. These
probes are synthetic. Which model writes better memories, titles, and summaries for
the Navigator is TS2's question, on the Navigator's own conversations.

## Files

| File | What it is |
|---|---|
| `shim.mjs` | The fetch-tracing preload; it records the effort each request sent, and no headers |
| `run_model.sh` | `eval --all` for one model, runs N to M, with a reasoning effort or `-` for unset |
| `combine.sh` | Pools two run sets into one directory, renumbering the second |
| `analyze.mjs` | Per-set quality and operations: the baseline analyzer plus effort sent, cut-off calls named, slowest calls by provider |
| `compare.mjs` | The four pass criteria, latency, and cost against the baseline |
| `commit.txt` | The commit both sets ran at |
| `set1/`, `repeat/` | Each set's `report.json`, `comparison.json`, `comparison.md`, and every eval record |
| `pooled/` | The fourteen-run `report.json`, `comparison.json`, and `comparison.md` |

The traces themselves (about 3 MB) are not kept. The reports hold what was derived
from them.
