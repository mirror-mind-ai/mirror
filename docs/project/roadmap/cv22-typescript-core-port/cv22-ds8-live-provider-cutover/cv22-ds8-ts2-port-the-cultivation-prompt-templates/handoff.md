[< Story](index.md)

# Handoff — CV22.DS8.TS2

**Date:** 2026-09-13 · written for the next session and the Mirror that loads
the journey next.

## What is now true

`consolidate scan` and `shadow scan` answer from TypeScript against the live
provider on an unconfigured install. The prompts they send are Python's real
`CONSOLIDATION_PROMPT` and `SHADOW_SCAN_PROMPT` (`ts/src/extraction/prompts.ts`),
assembled in `ts/src/cultivation/propose.ts` through `pyFormat` around the
same fenced block Python fences. Three pins hold them: the raw template bytes
equal the golden's; every assembled branch hashes to a digest **captured**
from the real Python builders with `send_to_model` stubbed; and a
`ReplayLlmProvider` fixture pinning `promptDigests` for either role refuses
one byte of drift. The inputs `cmd_scan` resolves live in
`ts/src/cultivation/promptContext.ts` — Unicode-correct `\w`, code-point
slicing — and `scan.ts` resolves them where Python does, so neither `cli.ts`
nor the smoke needed a change for the threading.

`CULTIVATION_SCAN_TRANSPORT` no longer carries `liveBlockedBy`. The route
matrix's story-gate section, empty for the first time, became its opposite:
no DS8 leaf may be refused by a story's name. `MIRROR_TS_CULTIVATION=0`
reverts `apply`, `scan`, and `shadow scan` together; `list|show|reject` stay
on TypeScript.

The live smoke asserts a `prompt_tokens` floor per role (400 / 300) as the
witness that instruction text, not a dump, went out; observed 1186–1362 for
consolidation and 1251–8285 for shadow. It also names transport-failure
classes now (`failureKinds()`), because the first live run could not.

The burn-down ledger's replay-gated table reads `(none)`. Sixteen at the
start of DS8, zero now.

## What remains intentionally undone

- **CR080** — `CONSOLIDATION_PROMPT`'s identity-context block: a
  600-code-point fragment the model is asked to surgically replace, under
  seeded H1s that outrank the prompt's own sections. A probe before a
  rewrite; the change lands in TS first.
- **CR081** — `ts/parity/` is outside `tsconfig` include; the smoke and the
  route matrix are never typechecked, and `route_matrix.ts` carries a
  pre-existing `TS2353` nobody sees.
- **CR014** still owns the unified owner-name resolver. TS has two (this
  story's regex form, the close tail's `You are talking to` form); Python has
  three. The hardcoded owner name is out of the TypeScript source.
- Ported renders still end with `python -m memory consolidate apply …` —
  Python's bytes for a command TS answers. DS10's, when the front door becomes
  the npm entry point.
- Python's `propose_consolidation` raises on a JSON-array response; TS reports
  `parse_failed`. Python is compatibility-only here and DS10 deletes it.

## What the next plateau is

**CV22.DS8.TS1** — the `eval` runner ownership decision (`python -m memory
eval`, `evals/`, ~3.2k lines, developer-only): port to a TS harness against
the live transport, or retire with a documented cutoff. It is a decision
story, taken by the port owner and recorded near the roadmap. With it, DS8
closes and the sequence continues to DS7.US8 (Builder/Ariad tree), TS4, DS9,
US9, DS10.

Before that: push this story's commits and verify GitHub Actions with `gh` —
the Navigator's action, not taken here.

## Which evidence supports it

[Validation](validation.md) — hermetic (2039 TS tests, 2841 Python, golden
no-op, route matrix), the plateau-4½ reading, and the Navigator-run route on
copies: two smoke runs for `consolidate-scan` (the first in a slow-provider
window, the second clean), one for `shadow-scan`, the revert matrix, and the
`scan → list → apply` journey for both families on `copy-home`, with the
Driver's mis-attribution of the first applied rows recorded and corrected.
About $0.0024 spent, all on copies. [Debt Review](review.md) — five findings,
deferred with triggers. [Coherence](coherence.md) — process, project, product.
