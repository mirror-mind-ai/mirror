[< Story](index.md)

# Validation — CV22.DS8.US3

**Run 2026-09-12.** Live OpenRouter throughout. Copy-only steps against
`tmp/parity/real-copy.db` (a copy of the real home, 477 ledger rows at the
start). Total spend across every copy probe: **$0.000686**.

Status: **groups A and B validated on a copy and on the real home; the revert
matrix and key hygiene pass.** Group C (`consolidate scan`, `shadow scan`) is
not in this route — it is blocked by
[CV22.DS8.TS2](../index.md#why-ts2-exists-2026-09-11).

---

## A finding that changed the route before it started

The plan staged this as "flip, validate on a copy, then flip on the real
home". That staging assumed the flip had a gate outside the code. It does not.

`.pi/extensions/mirror-logger.ts` invokes `ts/src/frontDoor/cli.ts`
**relative to the repository root**, with `--env-file-if-exists=.env`, and Pi
runs with this repo as its working directory. So the plateau-6 commit changed
live routing for the running session the moment it landed: the next
`/mm-journal`, `/mm-consult`, or `/mm-mirror --query` would have reached the
live provider on the real home before any deliberate validation step.

**Holdback used instead.** `.env` is read per front-door invocation and is
gitignored, so the seven revert variables were written there before validation
began. That holds the real home on Python with no Pi relaunch, and removing a
line is the deliberate flip. Verified before starting: all seven leaves routed
`python`.

**A trap inside the holdback, worth recording.** Node's `--env-file` fills only
variables that are *unset*; a value already in the environment wins. So
`env -u MIRROR_TS_CONSULT` does **not** lift the holdback — it unsets the shell
copy and then the file supplies `=0` again. The override must SET the variable:
`MIRROR_TS_CONSULT=1`, which works because only an exact `"0"` reverts. The
first `credits` run failed on exactly this, and the script's refusal named the
variable, which is how it was diagnosed in one step.

---

## Step 1 — `credits` (zero spend). Gate for group A. **PASS**

```text
ok  transport is live (live)
..  latency 1302ms
ok  totalCredits is a finite number (10)
ok  totalUsage is a finite number (7.02254477)
ok  balance is a finite number (2.9774552300000003)
ok  balance = total - usage (the arithmetic the bar renders)
```

## Step 2 — `ask` and `mirror-query` on the copy. **PASS**

```text
ask            latency 14589ms · consult row · priced · cost $0.000020 fetched from /generation
mirror-query   latency 1706ms  · outcomes: calls=1 answered=1 · reception row · priced $0.000257
```

### Cross-engine ledger shape — the step's stop rule

No second Python run was needed: this home already carried Python-written rows
from 2026-09-10 for both roles.

| Engine | role | prompt / completion | cost | bodies |
|---|---|---|---|---|
| Python (2026-09-10) | `reception` | 2401 / 38 | `0.0002557` | `0` / `0` |
| **TypeScript** | `reception` | 2400 / 43 | `0.0002572` | `0` / `0` |

Same model, same shape, same magnitude, both priced, both withheld. **No stop
condition fired.**

A detail from that Python baseline is worth keeping: its `consult` row cost
`0.001023`, which is *exactly* `7338/1000×0.0001 + 723/1000×0.0004` — the
static estimate. Python's generation poll had returned nothing and
`build_llm_logger` fell back. Before plateau 4 TypeScript wrote `NULL` there.
The database-architect's finding, confirmed by the owner's own data rather than
by argument.

## Step 3 — group B on the copy. **PASS (5/5)**

| Probe | Verdicts | Ledger |
|---|---|---|
| `journal` | title 32 chars (≤ 60 code points), 5 tags as a list, 1536-dim vector, AI-07 provenance | `journal_classification` → `embedding`, priced `4.24e-05` + `5.0e-07` |
| `harvest` | one `journal`/`self` memory, tags `["soul-mode", "harvested-fruit"]`, **fruit cleared after the write** | `embedding`, priced |
| `week-plan` | pending file holds `array(2)` | `week_plan`, priced `0.0001818` |
| `descriptor` | `calls=1`, `outcomes: calls=1 answered=1`, descriptor stored (100 chars) | `descriptor`, priced `0.0001826` |
| `apply` | proposal `applied`, merged memory written | `embedding`, priced `2.0e-07` |

Verified directly against the copy afterwards, not only through the script:

```text
memory_type  layer  tags                                              bytes
journal      ego    ["technical","routine","focus","completion",...]  6144
decision     ego                                                      6144   [merged] ...
journal      self   ["soul-mode","harvested-fruit"]                   6144

rows_written  unpriced  body_bytes  total_usd
8             0         0           0.000686
```

**Zero unpriced rows. Zero body bytes.** The two properties the whole ledger
plateau exists for.

Three leaf-specific confirmations:

- **`soul harvest save` completed for the first time ever on TypeScript.** It
  had no provider wired at all: routing sent it to TS and the route's default
  `embed` threw. The fruit-cleared-after-write check is the ordering that
  leaves a harvest recoverable when a provider is down.
- **`journal` embedded through `generateEmbeddingSafely`** — CR075's fix,
  end to end: the wrapper's ledger hook is what produced the `embedding` row.
- **`descriptor generate` wrote a row Python never writes.** `persona/engineer`
  had no descriptor before (only three `journey/*` did), so this created rather
  than overwrote. The decided divergence, working.

## Step 4 — real home, group A, through the skills. **PASS**

Run through `/mm-consult` and `/mm-mirror`, not a shell, because the revert
variables are read when Pi launches and the skill path is the one that matches
production.

- `consult credits` → `Balance: openrouter: ▓▓░░░ R$ 16.97`
- `/mm-consult gemini lite "what day is today?"` → answered; `[prompt: 45,
  completion: 4]`, `Call cost: $0.000006`, balance `R$ 16.93`
- `/skill:mm-mirror "How many journeys are there?"` → full Mirror Mode answer,
  reception routed

Ledger and log on the real home:

```text
reception  0.0002556  p=0  2026-09-12T11:13
consult    6.1e-06    p=0  2026-09-12T11:11

front-door.log:  mirror  ts  exit=0  reception calls=1 answered=1
```

That last line is the outcome seam in production: the front-door log now says
*why* a query produced what it produced, not merely that the command exited 0.

## Step 5 — group B on the real home. **PASS (4/4)**

The four holdback lines commented out of `.env`; `MIRROR_TS_CULTIVATION=0` left
active, since `consolidate apply` was proven on the copy and its siblings are
TS2-gated.

| Write | Result | Ledger |
|---|---|---|
| `/mm-journal` | memory `7b7dd612`, `journal`/`ego`, 1536-dim, 4 tags | `journal_classification` `3.99e-05` → `embedding` `1.8e-07` |
| `soul harvest save` | memory `2e2471de`, `journal`/`self`, tags `["soul-mode","harvested-fruit"]`, **fruit cleared** | `embedding` `6.0e-07` |
| `week plan` | 2 items, both journey-attributed, pending file written | `week_plan` `0.0001861` |
| `descriptor generate --layer persona --key quality-assurance` | descriptor created, 130 chars | `descriptor` `0.0001657` |

Thirteen rows since 11:20, **every one priced, every `prompt`/`response`
length 0**. The front-door log carries the seam in production:

```text
journal      ts  exit=0
soul         ts  exit=0
week         ts  exit=0
descriptor   ts  exit=0   descriptor calls=1 answered=1
```

Unrelated but healthy: a close tail fired at 11:54 on a real session switch
(`conversation_title` → `summary` → `tags` → `extraction` → `task_extraction`
→ `embedding ×3`), all priced — US2's surface still well.

## Step 6 — the revert matrix. **PASS**

`node --env-file=.env ts/parity/route_matrix.ts` — a verdict, not a reading
exercise; exits non-zero on any broken contract.

- **nine families, nine single-variable reverts**, each naming its variable;
- **seven bystanders unmoved**: `mirror load`, `week view`, `week save`,
  `consolidate list`, `shadow list`, `soul listen`, `memories` listing. A
  family switch that dragged a deterministic read back would be a worse outage
  than the one it was reached for;
- **six replay-pair cases**, including the deliberate asymmetry — the credits
  fixture alone is COMPLETE for `consult credits` and HALF for `consult ask`,
  which refuses by name — and `MEMORY_RECEPTION=0` making the embedding
  fixture alone complete for `mirror load --query`;
- **both scan leaves name the story that blocks them**;
- **the retired DS5 gate is inert**: ten leaves compared at `=1`, `=0`, and
  unset — identical engine and identical reason.

## Step 7 — key hygiene. **PASS**

`node --env-file=.env ts/parity/key_hygiene.ts <real home> <copy>` — zero on
every surface, both databases: no ledger row carries the key, no front-door log
line carries it, and **no ledger row stores a body at all** across 490 rows.
That last one is not a leak by itself (`MEMORY_LOG_LLM_CALLS=full` stores
bodies deliberately) but it is the property that would turn a future key
rotation into a forensic search.

## Observed, not defects

**`consult` spends ~13 seconds on bookkeeping.** "Took 14.7s" for a 45-token
prompt and a 4-token answer; the copy probe measured 14589ms for a similar
call. The model call is about a second — the rest is
`fetch_generation_cost`'s poll (sleeps of 1+2+3+4s) plus the credits call.
This is a faithful port: Python's `fetch_generation_cost(retries=4)` does
exactly the same, so it is parity, not a US3 regression. It is a real cost now
that `consult` is interactive through a skill, and a **CR candidate** rather
than a stop.

**The smoke rounds sub-microcent totals to `$0.000000`.** The `apply` probe
reported that for a genuine `2.0e-07`. Cosmetic, in the script's own output.

**`soul harvest save`'s revert reason does not match its siblings.** It reads
`soul TS route disabled by MIRROR_TS_SOUL=0` where every other family reads
`<VAR>=0 revert to Python`. Both are true — the family switch is checked before
the leaf's own transport decision — and the contract holds. Cosmetic only.

**Two validation commands failed for environmental reasons, not code reasons**,
and both are recorded because the next person will meet them. Node's
`--env-file` fills only UNSET variables, so `env -u VAR` re-reads the holdback
from the file instead of lifting it; the override must SET `VAR=1`. And zsh
does not word-split unquoted parameter expansions the way bash does, so a
`for c in "journal x"; do node -e '...' $c; done` loop passed `"journal x"` as
a single command name and printed `python  command not ported to TS` for every
leaf — **a check that passed for the wrong reason**, which is the same shape as
the zero-proposal run the outcome seam exists to catch. Both route checks are
now scripts (`ts/parity/route_matrix.ts`, `ts/parity/key_hygiene.ts`) that do
their own splitting and carry their own expectations, so no shell semantics sit
between the question and the answer.

## Not exercised

- **Group C** — `consolidate scan` and `shadow scan` print `SKIPPED` with the
  route's own reason while DS8.TS2 is open, and made no call:
  `live blocked by DS8.TS2 (cultivation prompt templates not ported)`.
- **Live `timeout` / `auth` / `rate_limit` / `provider_error` classes** —
  hermetic tests with an injected `fetch` only, as in US1 and US2.
