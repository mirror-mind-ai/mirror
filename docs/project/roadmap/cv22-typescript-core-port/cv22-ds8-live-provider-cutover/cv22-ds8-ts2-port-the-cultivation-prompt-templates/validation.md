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

## Navigator-run (pending)

Steps 6a–8c of the [test guide](test-guide.md): the live smoke on a copy
with the `prompt_tokens` floor, the revert matrix, and the `scan → list →
apply` journey on a copy home for both families. Evidence to be recorded
here, redacted, with `prompt_tokens` visible and no `prompt` column.
