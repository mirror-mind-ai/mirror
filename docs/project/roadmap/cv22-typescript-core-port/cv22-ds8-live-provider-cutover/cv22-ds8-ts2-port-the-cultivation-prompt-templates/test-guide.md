[< Story](index.md)

# Test Guide — CV22.DS8.TS2

## Automated Validation

Run from the repository root unless noted. All hermetic; no test reaches the
network.

| # | Command | Pass | Fail |
|---|---------|------|------|
| 1 | `cd ts && npm run typecheck && npm run lint` | clean | any error, or a new lint warning |
| 2 | `cd ts && npm test` | 0 failures; `test/cultivation/propose.test.ts` and `test/cultivation/promptContext.test.ts` include the new template, digest, fixture, and resolver tests | any failure |
| 3 | `uv run python ts/parity/generate_prompt_assembly_golden.py && git diff --exit-code ts/test/goldens/prompt-assembly.golden.json` | regeneration is a no-op; the corpus carries `system_prompts.consolidation`, `system_prompts.shadow_scan`, and scenarios for both surfaces | any diff |
| 4 | `node ts/parity/route_matrix.ts --contracts-only` | exit 0; `consolidate scan` and `shadow scan` contracts read live, no `DS8.TS2` reason anywhere; the `soul harvest save` contract carries the swept reason string | non-zero exit |
| 5 | `uv run pytest -m "not live"` | Python suite unchanged and green (the oracle is read, not edited) | any failure |

What the pins prove, so a reviewer can trust them:

- **Byte equality** — `CONSOLIDATION_PROMPT` / `SHADOW_SCAN_PROMPT` in TS equal
  `system_prompts.*` from the golden, which Python emitted from `prompts.py`.
- **Assembly digest** — for every scenario, `sha256(buildXPrompt(inputs))`
  equals `prompt_sha256` captured from the real `propose_*` call with
  `send_to_model` stubbed. Branches cover memory with/without `journey` and
  `context`, identity context absent / present / >600 code points with a
  non-BMP character, a Unicode `user_name`, shadow structure empty and
  populated, and `readiness_state` variants. **All inputs synthetic.**
- **Replay enforcement** — one `ReplayLlmProvider` fixture pins
  `promptDigests.consolidation` and `promptDigests.shadow_scan`; a test
  mutates one byte of the assembled prompt and asserts the provider refuses.
- **Resolvers** — `cultivationUserName` yields `Vinícius` (not `Vin`) from
  the seed phrasing, the fallback `the user` when the row or the phrase is
  absent, and `consolidationIdentityContext` slices at 600 code points with
  the Python section order and fallback. Expected values are Python outputs,
  recorded with the command that produced them.

**The digest is proven here and only here.** The live route below cannot
observe it (the ledger is metadata-only) and does not claim to; its witness is
`prompt_tokens`.

## Prompt-Engineer Reading (plateau 4½ — hard stop)

Before any live call. Render one assembled scenario per surface from the
golden — synthetic by construction, safe to read and to quote:

```bash
node -e '
const g = require("./ts/test/goldens/prompt-assembly.golden.json");
for (const s of ["consolidation", "shadow_scan"]) {
  const sc = g.scenarios.find((x) => x.surface === s);
  console.log(`===== ${s} / ${sc.label} =====\n${sc.prompt}\n`);
}'
```

Read for assembly, not wording (the words are Python's):

| Check | Pass |
|---|---|
| `{{ }}` collapsed | the output-format block is a valid JSON shape with single braces |
| Fence placement | `<cluster>` / `<shadow_memories>` enclose exactly the user-derived block, nothing else |
| System-side context | `identity_context` / `shadow_structure` sit above the "## Untrusted input" guard, never inside the fence |
| Placeholders | no literal `{user_name}`, `{identity_context}`, `{cluster_text}`, `{shadow_structure}`, `{shadow_memories}` survives |

Record the reading and any finding in `validation.md`. Findings against the
text itself become CRs, not TS2 edits. **Never render from a real-copy
database for this step.**

## E2E Decision

**Required.** Steps 6–8 below are the E2E: the first time these two prompts
reach a model from TypeScript, and the first time a row they produce meets
TS's `apply`. Never CI; Navigator-run against a copy. Cost bound: ≤ 3
`consolidation` calls (`--limit 3`) + 1 `shadow_scan` call at
`temperature: 0.1` on the extraction model, plus ≤ 1 embedding for a `merge`
apply.

## Navigator Validation

### Prerequisites

- The OpenRouter key in `.env`; no `MIRROR_TS_*` variable set;
  `MEMORY_LOG_LLM_CALLS` at its default (metadata-only). Do not set `full`
  for validation, and paste no `prompt` column into evidence.
- A **copy home** — a directory holding a copied `memory.db` — under
  `tmp/parity/` (ignored; never committed). The smoke takes `--db`; the front
  door takes `--mirror-home`, and without a copy home the path of least
  resistance is your real one.

```bash
mkdir -p tmp/parity/copy-home
cp ~/.mirror-minds/<mirror>/memory.db tmp/parity/copy-home/memory.db
cp tmp/parity/copy-home/memory.db tmp/parity/real-copy.db   # for the smoke
```

### Route

| # | Command | Expected observation | Pass | Fail |
|---|---------|----------------------|------|------|
| 6a | `node --env-file=.env ts/parity/live_long_tail_smoke.ts --db tmp/parity/real-copy.db consolidate-scan` | `transport is live`; clusters considered ≥ 1; outcomes tally shows ≥ 1 `answered`; ledger rows for role `consolidation` with non-null cost and `prompt_tokens ≥ 400`; key absent from output | `PASS` | `SKIPPED` (route still blocked); every outcome `parse_failed` (prompt not understood); no ledger row; a row below the floor (a dump was sent); or the key in output |
| 6b | `node --env-file=.env ts/parity/live_long_tail_smoke.ts --db tmp/parity/real-copy.db shadow-scan` | `transport is live`; candidates considered ≥ 1; a ledger row for role `shadow_scan` with `prompt_tokens ≥ 300`; outcome `answered` or `empty` (`[]` is valid output under the real contract; the dump could only produce `parse_failed`) | `PASS` | `SKIPPED`, `parse_failed`, no ledger row, or a row below the floor |
| 7 | `MIRROR_TS_CULTIVATION=0 node ts/parity/route_matrix.ts` | both scan leaves route to Python; `consolidate list` stays on TS | as stated | either leaf on the wrong engine |
| 8a | `node --env-file=.env ts/src/frontDoor/cli.ts consolidate scan --limit 1 --mirror-home tmp/parity/copy-home` | Python-shaped rendering: `Scanning N memories…`, one proposal or the `⚠ LLM returned no valid proposal` line, the `pending` review instructions | shape matches Python's `cmd_scan` | a TS-only shape, a stack trace, or a swallowed failure with no outcome line |
| 8b | `node --env-file=.env ts/src/frontDoor/cli.ts consolidate list --status pending --mirror-home tmp/parity/copy-home` then `… consolidate apply <id> --mirror-home tmp/parity/copy-home` | the row produced in 8a is listed, then applied: status `accepted`; a `merge` embeds (one embedding call), an `identity_update` writes the copy's identity, a `shadow_candidate` advances readiness | `accepted` and the Python-shaped apply rendering | apply rejects a row its own scan produced — the seam this story opens is broken |
| 8c | `node --env-file=.env ts/src/frontDoor/cli.ts shadow scan --mirror-home tmp/parity/copy-home` then `… shadow apply <id> --mirror-home tmp/parity/copy-home` (skip apply if the scan proposed nothing — a valid outcome) | observations rendered as Python renders them; the applied row `accepted` and the copy's `shadow/profile` updated | as stated | apply rejects the row, or the render diverges |

Steps 6a/6b are the structural verdicts; 8a–8c are the user journey the
`/mm-consolidate` and `/mm-shadow` skills actually run (both already enter
through `ts/src/frontDoor/cli.ts`). Optional, Navigator-chosen: one real-home
`shadow scan` (one call, writes only `pending` rows, reversible with
`shadow reject <id>`).

## Validation Evidence

Pending implementation and validation. Record here: the plateau-4½ reading,
the smoke transcripts (redacted, `prompt_tokens` visible), per-call cost, the
8a–8c journey outcome, the revert-matrix result, and the Python commands that
produced the resolver expectations. No `prompt` column, no identity text.
