[< Parent](../index.md)

# CV22.DS8.TS2 — Port the cultivation prompt templates

**Status:** 🟡 Planned — plan reviewed by four lenses 2026-09-13, pending Navigator approval
**Type:** Technical Story

---

## Outcome

`consolidate scan` and `shadow scan` assemble Python's real
`CONSOLIDATION_PROMPT` and `SHADOW_SCAN_PROMPT` in TypeScript — task
statement, identity/dedup context, untrusted-input guard, JSON output contract
— byte-identical to the oracle and digest-pinned, with `userName` and
`identityContext` resolved where Python resolves them. The `liveBlockedBy`
refusal is deleted, the two leaves answer live from TS on an unconfigured
install, and the burn-down ledger's replay-gated table is empty.

## Story Statement

In order to let DS8 close with every replay-gated leaf live,
As the port owner,
I want the two cultivation scan prompts ported and pinned against the oracle,
So that the last two leaves can flip without sending a model an uninstructed memory dump.

## Acceptance Behavior

```text
Given a copy home (a directory holding a copied memory.db) with at least one cluster above
      threshold and at least one shadow-candidate memory, no MIRROR_TS_* variable set,
      MEMORY_LOG_LLM_CALLS at its default, and the OpenRouter key in .env
When  the Navigator runs `consolidate scan --limit 3` and `shadow scan` through the front door
Then  both route to TypeScript in live mode, and no routing contract anywhere still says
      "live blocked by DS8.TS2"
And   `consolidate scan` reports at least one `answered` outcome, and both leave a
      `consolidation` / `shadow_scan` ledger row priced like Python's, with
      prompt_tokens above the floor (≥ 400 / ≥ 300) — the live witness that the
      instruction text, not a memory dump, reached the model
And   a pending row produced by the real prompt is consumed by TS's own `apply`:
      `consolidate apply <id>` and `shadow apply <id>` on the copy leave the row `accepted`
And   `MIRROR_TS_CULTIVATION=0` sends both leaves back to Python
And   `consolidate list|reject` and `shadow list|show|reject` are unchanged

Proven hermetically, not live: the assembled prompt hashes to the digest Python
produces for the same inputs (byte-equality, per-scenario SHA-256, replay-fixture pin).
```

## Scope

- Both templates added to `ts/src/extraction/prompts.ts`, emitted from the
  Python source.
- `buildConsolidationPrompt` / `buildShadowScanPrompt` in `propose.ts` over
  the already-ported formatters and fence, assembled through `pyFormat`.
- `ts/src/cultivation/promptContext.ts`: Unicode-correct user-name lookup and
  the 600-code-point identity context, resolved inside `scan.ts`.
- `generate_prompt_assembly_golden.py` extended with both surfaces and
  per-branch scenarios captured from the real Python builders.
- Byte-equality, per-scenario SHA-256, and a replay fixture pinning
  `promptDigests` for both roles. All golden inputs synthetic.
- The route flip and the tests/tools that asserted the refusal; a
  `prompt_tokens` floor in the live smoke as the live witness.
- A prompt-engineer reading of one assembled golden scenario per surface
  before the first live call (hard stop).
- Riders from US3's review: the `soul harvest save` revert-reason string (with
  its route-matrix contract) and the smoke's sub-microcent rounding.
- Closure docs: ledger, DS8 index, decisions, CR014 evidence, the
  `mm-consolidate` skill note, one CR for the 600-character `replace` finding.

## Out Of Scope

- CR014's unified resolver; the close tail's `resolveUserName`.
- Prompt text changes — parity only; findings become CRs.
- `consolidate apply`, `list|show|reject`, DS8.TS1, DS10 Workbench, any Python edit.

## Validation

- Hermetic: `npm run typecheck && npm run lint && npm test`; golden
  regeneration is a no-op; `route_matrix.ts --contracts-only` green.
- Prompt-engineer reading from the golden before any live call.
- Navigator-run on a copy: `live_long_tail_smoke.ts consolidate-scan` and
  `shadow-scan` — live transport, ≥1 `answered`, ledger rows above the
  `prompt_tokens` floor, key absent; then the journey `scan → list → apply`
  on the copy home for both families.
- Revert matrix: `MIRROR_TS_CULTIVATION=0`.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
