[< Story](index.md)

# Refactoring — CV21.E2.S2 Mirror MCP server

Deferred items surfaced during the review ritual. None block S2.

## Deferred (scope, by design)

- **Write/mutation tools.** S2 ships a read + on-demand-context surface only.
  Journal, mode, soul, identity, and consolidation writes are a later story with
  their own consent semantics. Documented as a non-goal, not debt.

## Forward notes

- **Minimal protocol surface.** The hand-rolled server implements the tools-only
  subset (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`,
  `ping`). It does not implement MCP `resources`, `prompts`, pagination, or batch
  requests. *Revisit when* a target MCP client requires any of those, or if
  protocol-compliance burden grows enough to justify adopting the official SDK as
  an optional extra (the D1 alternative).
- **`mcp` in the runtime-interface contract.** The new `python -m memory mcp`
  surface is intentionally not yet folded into
  `docs/product/specs/runtime-interface/index.md` / `REFERENCE.md`; per the E2
  plan, the contract/decisions docs are updated at E2 close (after `statusLine`
  S3 and the reference smoke S4), to avoid documenting a half-built package.
