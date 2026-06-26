[< CV21](../index.md)

# CV21.E1 — Unified Plugin & MCP Spike

**Status:** ✅ Done

---

## Outcome

The keystone decision of CV21: **we know whether packaging Mirror Mind once as a
canonical plugin plus an MCP server is real and viable across runtimes**, and we
have chosen the integration strategy before any per-runtime epic depends on it.

This is discovery work. It collapses into **decidability**, not code: a recorded
decision on convergence vs thin-adapter fallback, the canonical plugin format,
and the MCP server scope — with the per-runtime epics (E3–E10) confirmed or
adjusted against the finding.

---

## Questions To Answer

1. **Canonical plugin format.** What does a minimal Mirror Mind Claude plugin
   (`.claude-plugin/plugin.json` bundling skills + hooks + MCP) look like, and
   does `claude` load and run it equivalently to the current standalone `.claude/`?
2. **Cross-runtime import — the bet.** Is plugin import actually real?
   - `agy plugin import claude` of the Mirror plugin
   - `grok plugin import` (claude/gemini source)
   - Codex marketplace install of an equivalent package
   What survives import (skills? hooks? MCP?) and what does not?
3. **MCP feasibility.** Can a Mirror MCP server carry the command surface and,
   critically, **Mirror Mode context injection** — or is MCP tool-call only, with
   per-turn injection still needing runtime hooks?
4. **Extensions on the package.** Can user-owned `prompt-skill` extensions ride
   the canonical plugin / MCP server so every runtime inherits them, closing the
   `.agents/` exposure gap structurally?
5. **Fallback shape.** If import is unreliable, what is the thin-adapter +
   shared-MCP fallback per runtime, and how much of the foundation still pays off?

---

## Scope

- Build a throwaway Mirror Mind plugin in an isolated scratch dir; `agy plugin
  validate` and Claude load-test it. No production mirror or repo state touched.
- Empirically test cross-runtime import on the installed CLIs (`agy`, `grok`,
  `codex`) against the scratch plugin.
- Prototype-probe a minimal Mirror MCP server (or desk-check the contract) for
  command surface + context injection feasibility.
- Decide: **converge** (canonical plugin + MCP as the spine) vs **thin adapters +
  shared MCP** fallback; fix the canonical format and MCP scope.
- Record the decision in `docs/project/decisions.md` and reconcile E2–E11.

Out of scope: building the production plugin or MCP server (that is E2), and any
per-runtime implementation.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV21.E1.S1 | Canonical plugin authoring probe | Spike | A minimal Mirror plugin validates on Claude in an isolated dir | ✅ Done |
| CV21.E1.S2 | Cross-runtime import probe | Spike | Component taxonomy validates on `agy`; format bridge identified; live import deferred to per-runtime epics | ✅ Done |
| CV21.E1.S3 | Mirror MCP server feasibility | Spike | MCP carries the command surface + on-demand context, not automatic per-turn injection | ✅ Done |
| CV21.E1.S4 | Convergence decision record | Decision | `decisions.md` entry choosing converge with thin-adapter fallback; canonical format + MCP scope fixed | ✅ Done |

---

## Findings & Decision

Run in an isolated `/tmp` scratch dir; **no production mirror, repo, or runtime
config was mutated** (verified: Claude installed-plugins and Antigravity
`mcp_config` unchanged after the spike).

- **Plugin authoring works (S1).** A minimal Mirror plugin (`mm-*` skill +
  lifecycle hooks) passes `claude plugin validate` once the unsupported `$schema`
  manifest key is removed (the 2.1.114 validator rejects unknown keys).
- **Cross-runtime alignment (S2).** `agy plugin validate` recognizes the same
  component taxonomy (skills/agents/commands/mcpServers/hooks). Formats are
  aligned but not byte-identical — Claude `.claude-plugin/plugin.json` vs `agy`
  root `plugin.json`, with hooks/MCP in different locations — so `agy plugin
  import claude` is the bridge. Claude `@skills-dir` in-place plugins need no
  marketplace/install; Codex uses local marketplace snapshots + native hooks.
  Live `import`/`install` execution (config-mutating) is deferred to the
  per-runtime epics where that mutation is in scope.
- **MCP (S3).** `mcpServers` is portable across Claude/Antigravity/Codex, but
  pull-based: it carries the command surface + on-demand context, **not**
  automatic per-turn injection. Automatic Mirror Mode injection stays in
  per-runtime hooks; Grok (no per-turn hook) caps at L3.
- **Decision (S4): converge** on a canonical Claude-format plugin (`mm-*` skills
  + lifecycle hooks) plus a Mirror MCP server, propagated by import/install, with
  a thin-adapter + shared-MCP fallback. Recorded in
  [Decisions](../../../decisions.md#cv21-converges-on-a-canonical-plugin-plus-mcp-server-bridged-by-import).

---

## Done Condition

E1 is done when the convergence question is answered with empirical evidence, the
integration strategy is chosen and recorded as a decision, the canonical plugin
format and MCP scope are fixed, and the per-runtime epics (E2–E11) are confirmed
or adjusted to match — with no production mirror, repo state, or runtime config
mutated by the spike.

---

## References

- [CV21 — Runtime Expansion II](../index.md)
- [Runtime Interface Contract](../../../../product/specs/runtime-interface/index.md)
- [CV8 Runtime Expansion](../../cv8-runtime-expansion/index.md)
- Claude Code plugins: <https://docs.claude.com/en/docs/claude-code/plugins>
- Antigravity CLI: <https://github.com/google-antigravity/antigravity-cli>
- Codex hooks: <https://developers.openai.com/codex/hooks>
- Grok Build: <https://x.ai/cli>
