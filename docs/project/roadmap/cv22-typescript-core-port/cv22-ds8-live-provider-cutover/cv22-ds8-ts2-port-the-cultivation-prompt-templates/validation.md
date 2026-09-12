[< Story](index.md)

# Validation — CV22.DS8.TS2

## Hermetic (Driver-run, 2026-09-13)

| # | Check | Result |
|---|---|---|
| 1 | `cd ts && npm run typecheck && npm run lint` | clean; the one lint warning is the pre-existing `CONVERSATIONS_LIFECYCLE_FLAGS` in `routing.ts` recorded by US3 |
| 2 | `cd ts && npm test` | **2038 / 2038** — `cultivationPrompts.test.ts` (10 oracle scenarios, 2 template pins, replay enforcement for both roles, hostile-content survival) and `promptContext.test.ts` (7 name cases, 4 identity-context cases, the D1 guard, code-point slicing, section order) |
| 3 | `uv run python ts/parity/generate_prompt_assembly_golden.py && git diff --exit-code …` | no-op on second run; corpus 37 → 47 scenarios, `system_prompts.consolidation` / `.shadow_scan`, `resolvers` section |
| 4 | `node ts/parity/route_matrix.ts --contracts-only` | `PASS route matrix — every contract holds`; both scan leaves `ts` / `DS8.TS2 cultivation scan live`; revert `MIRROR_TS_CULTIVATION=0` → `python`; no story gate remains |
| 5 | `uv run pytest -m "not live"` | **2841 passed**; `git diff HEAD~4 -- src/` is empty — the oracle was read, not edited. One pre-existing failure deselected: `test_server.py::test_operations_run_api_executes_runtime_diagnose_through_controlled_command` times out polling a runtime-diagnose run on this machine; identical at `HEAD~4` with `ts/` reverted, so environmental and not this story's |

What the pins prove: raw template bytes equal Python's; every assembled branch
hashes to the digest captured from the real `propose_*` with `send_to_model`
stubbed; a `ReplayLlmProvider` fixture pinning `promptDigests` for either
role refuses one byte of drift in `identity_context` or `user_name`.

Resolver expectations were not hand-derived: the golden's `resolvers` section
is the output of `shadow_cmd._user_name`, `consolidate_cmd._user_name`, and
`consolidate_cmd._identity_context` run over a fake client with synthetic
identity content. The one row where the two Python name resolvers disagree
(`name present without marker`) is asserted to be the only one.

## Plateau 4½ — prompt-engineer reading (2026-09-13, before any live call)

Rendered from the golden's `prompt` field — `consolidation cluster with
journey and context` (2,977 chars) and `shadow scan with structure and
context` (2,242 chars). Synthetic inputs; nothing from a real database.

| Check | consolidation | shadow_scan |
|---|---|---|
| `{{ }}` collapsed to a valid JSON shape | ✓ single-brace object | ✓ single-brace array |
| Fence encloses exactly the user-derived block | ✓ `<cluster>` | ✓ `<shadow_memories>` |
| System-side context sits above `## Untrusted input`, never inside the fence | ✓ | ✓ |
| No placeholder survives | ✓ | ✓ |

**Findings.** Neither is a TS2 edit; the bytes are Python's.

1. *Against the oracle — CR at closure, with the 600-character finding.* The
   identity context is injected under `## Current identity context`, but the
   seeded layers open with `# Behavior`, `# Identity`, `# Soul` — H1s. Read
   as Markdown, `# Soul` becomes the document's top-level section and the
   guard, the fenced cluster, and the output contract nest under the user's
   soul heading. Together with the 600-character truncation that asks the
   model to "replace" text it never saw, the identity-context block of
   `CONSOLIDATION_PROMPT` is one CR with two observations.
2. *Against the fixture — fixed here.* The synthetic shadow ids collapsed to
   one 8-character label (`[mem-shad]`), so the rendered scenario showed two
   memories the model could not distinguish when echoing `memory_ids`. Ids
   now differ in their first 8 characters; shadow digests regenerated,
   template bytes untouched.

The hard stop is satisfied: this reading precedes the first live call.

## Navigator-run (2026-09-13, database copy)

Copy of the owner's home under `tmp/parity/` (ignored). `MEMORY_LOG_LLM_CALLS`
at its default; bodies withheld on every row (`LENGTH(prompt) = 0`). Model
`google/gemini-2.5-flash-lite`; embedding `openai/text-embedding-3-small`.

### 6a — `consolidate-scan`, two runs

| Run | Verdict | Outcomes | `prompt_tokens` (floor 400) | Latency | Cost |
|---|---|---|---|---|---|
| 1 (16:29–16:32 UTC) | FAIL | `calls=3 answered=1 transport_failed=2` | 1186 on the answered call | **28,199 ms** on the answered call | $0.000196 |
| 2 (16:49 UTC) | **PASS** | `calls=3 answered=3` | 1362, 1232, 1186 | 5,694 / 2,825 / 4,536 ms | $0.000592 |

Reading. Run 1's answered call proves the ported prompt live: 1186 tokens
(the dump it replaced was ~50) and a `merge` proposal with an allowlisted
action. Its two failures were transport-layer (`parse_failed` would have
named the prompt) during a window in which the same model that titled a
conversation in 1.6 s that morning took 28 s to answer — consistent with
the 60 s extraction bound (Python's own `MEMORY_LLM_TIMEOUT_EXTRACTION`)
firing. The failure class was not captured because the smoke's tally counted
`transport_failed` and dropped the `kind`; `fa6d2925` adds
`failureKinds()` so the next such run names it. Loading and clustering the
real corpus (950 embedded memories, 96 clusters) takes 0.8 s, measured on
the copy without spending, so the wall time was the calls. Run 2, seventeen
minutes later, answered all three in under 6 s each.

The third cluster produced **1186 prompt tokens in both runs**: same cluster,
same assembled bytes, same count. The prompt is deterministic live, not only
in the golden.

### 6b — `shadow-scan`

**PASS.** `calls=1 answered=1`; `prompt_tokens 1251` (floor 300); 8,457 ms;
$0.000272; three `shadow_observation` rows pending with `target_layer=shadow`,
`target_key=profile`.

### 7 — revert matrix

`MIRROR_TS_CULTIVATION=0 node ts/parity/route_matrix.ts` → `PASS route matrix
— every contract holds`. The three cultivation tail leaves (`apply`, `scan`,
`shadow scan`) revert to Python as one; `consolidate list` and `shadow list`
stay on TypeScript; every DS8 leaf is live by default with no story gate
remaining; the retired `MIRROR_TS_EXTERNAL_ROUTES` is inert.

### 8a — front-door render (PASS)

`consolidate scan --limit 1 --mirror-home tmp/parity/copy-home`: Python's
shape end to end — `Scanning 950 memories (threshold=0.75)...`, `Found 1
cluster(s)`, the proposal card with source memories, rationale, and proposed
content, then `1 proposal(s) created with status='pending'` and the review
instructions. Produced `bda674e8` (`merge`) in `copy-home/memory.db`.

Observation for Debt Review: the review instructions render Python's exact
bytes — `python -m memory consolidate apply <proposal_id>` — while the
command now answers from TypeScript through `cli.ts`. Parity-faithful and
out of scope here; every ported render that names the Python entry point
faces the same question at DS10.

### 8b–8c — the journey to `apply` (in progress; Driver error corrected)

Two databases were in play: the smoke wrote to `tmp/parity/real-copy.db`
(`--db`), the front door to `tmp/parity/copy-home/memory.db`
(`--mirror-home`). The Driver handed the Navigator ids `55486ca5` and
`75b795e3` as TypeScript-produced rows; they are **Python-produced** rows
from 2026-06-18 and 2026-04-30 that were already pending in the owner's home
and thus present in both copies. Applying them proved what US3 already
proved — TS's `apply` consumes Python's rows — not this story's seam. The
earlier claim here that the copy held "eleven merge rows produced by
TypeScript's prompts" was wrong: TypeScript produced four merges and three
shadow observations, all in `real-copy.db`.

Corrected route, run 2026-09-13 (17:00 UTC) on `copy-home` — **PASS**:

| Step | Row | Produced by | Result |
|---|---|---|---|
| 8b | `bda674e8` `merge` | 8a's live `consolidate scan` (TS prompt, `prompt_tokens 1362`) | `accepted`; merged memory created and embedded (`embedding` ledger row, 83 tokens, $0.000002); sources `integrated` |
| 8c | `81d46826` `shadow_observation` | live `shadow scan` through the front door in the same database (TS prompt, `prompt_tokens 8285` over 50 candidates, 1,794 ms, $0.000983); three observations rendered in Python's shape | `accepted`; `shadow/profile` updated; source advanced to `acknowledged`; the two sibling observations remain `pending` |

Proof queries on `copy-home/memory.db`: the four rows created after 16:00 UTC
are `bda674e8 accepted`, `442590b4 pending`, `81d46826 accepted`,
`cd6f20b0 pending`; every ledger row since 16:50 has `LENGTH(prompt) = 0`.

The first cluster produced `prompt_tokens 1362` here as it did in smoke run 2
— a third reading of the same bytes.

### Totals

Seven chat calls and two embeddings across the whole route, all on copies:
about **$0.0024**. No real-home write was made. `tmp/parity/` is ignored and
uncommitted.
