[< CV21](../index.md)

# CV21.E9 — Grok Build Runtime Spike

**Status:** ✅ Done

---

## Outcome

Map `grok` (Grok Build CLI v0.2.51) against Mirror's runtime contract and the E1
canonical-package decision, resolve the open questions (skill-discovery root,
invocation syntax, logging mechanism, plugin-import support, Mirror Mode model),
and fix the honest parity. As a spike it collapses into decidability: E10 can
implement against a known contract.

Same discipline as E1/E3/E6: read-only evidence from the `grok` binary, the
**local authoritative docs** at `~/.grok/docs/user-guide/`, `grok inspect`, and
`grok` help. **No production Grok config mutated**; live testing deferred to E10's
isolated smoke test.

---

## Findings

The hypothesis was "Codex-like, logging via export/backfill, L1/L3." Reality: Grok
is the **most Claude-compatible** of the three new runtimes, with a full native
hook lifecycle — but it shares Antigravity's injection ceiling.

### Hooks — full Claude-style lifecycle, but no per-turn injection

Grok has a complete hook system (`~/.grok/hooks/*.json`, `<project>/.grok/hooks/`,
**and `.claude/settings.json` read natively** via Claude compat, on by default):

| Event | Fires | Inject? |
|---|---|---|
| `SessionStart` | session start | no |
| `UserPromptSubmit` | prompt submitted | **no — passive, stdout ignored** |
| `Stop` / `StopFailure` | turn ends | no |
| `SessionEnd` | session ends | no |
| `PreToolUse` | before a tool | yes (allow/deny only) |
| `PostToolUse`/`PreCompact`/`PostCompact`/`Subagent*`/`Notification` | — | no |

Hook input is JSON on stdin (`hookEventName`, `sessionId`, `cwd`, `workspaceRoot`,
…); env includes `GROK_SESSION_ID`, `GROK_WORKSPACE_ROOT`, and the **Claude alias
`CLAUDE_PROJECT_DIR`**. Crucially, for passive events — including
`UserPromptSubmit` — **stdout is ignored**; only `PreToolUse` may return a
decision. So Grok has **no `additionalContext` per-turn injection**: the L4
mechanism is absent, exactly like Antigravity.

**Strong consequence for logging:** Grok reads Mirror's existing
`.claude/settings.json` hooks directly (with `CLAUDE_PROJECT_DIR` set), so L1
logging is via a clean native hook lifecycle (`SessionStart`/`UserPromptSubmit`/
`Stop`/`SessionEnd`) — **not** a wrapper or `grok export` backfill as hypothesized.
Project hooks require trust (`~/.grok/trusted-hook-projects`).

### Skills — `.agents/skills/` discovered (Mirror's surface)

Grok discovers skills from `./.grok/skills/`, `<repo>/.grok/skills/`,
`~/.grok/skills/`, `~/.claude/skills/` (compat), and — per the docs — **also scans
`.agents/skills/` at each tier**, walking CWD→repo-root. That is why `grok inspect`
already lists Mirror's 21 hyphenated `mm-*` skills as project skills. So, as on
Codex (E3) and Antigravity (E6), **Mirror's `mm-*` surface works on Grok
unchanged.** Invocation: slash `/local:<name>` / `/user:<name>` / `/plugin:<name>`,
or implicit by `description`.

### Plugins / MCP / instructions / import

- **Plugins:** Claude-shaped (skills + commands + agents + hooks + MCP + LSP), with
  a marketplace and `grok plugin install <git|github|local>`. Grok **also reads
  `.claude/plugins/` for compat** and sets `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`
  aliases — so the canonical Claude plugin from E1/E2 propagates to Grok.
- **MCP:** `[mcp_servers.*]` in `~/.grok/config.toml` — the Mirror MCP server is
  portable here.
- **Instructions:** `AGENTS.md` / `Claude.md` (Mirror ships `AGENTS.md` → `CLAUDE.md`).
- **Import:** Grok scans Claude settings/permissions/hooks for import; the binary
  carries a Claude import path.

### Honest parity — L3 (strong L1 logging)

Confirmed **L3**, revising the "L1/L3" hypothesis:

- L0 ✓ (runs `uv`), L1 ✓ **strong** (native Claude-compat hook lifecycle reading
  `.claude/settings.json`), L2 ✓ (`.agents/skills/` + MCP + plugins), L3 ✓
  (`AGENTS.md` + explicit slash invocation).
- **L4 not reachable:** `UserPromptSubmit` is passive (stdout ignored), so no
  automatic per-turn Mirror Mode injection — the same ceiling as Antigravity.

---

## Cross-runtime convergence (now confirmed)

- **`.agents/skills/` is the universal skill surface** across Codex, Antigravity,
  and Grok — Mirror's CV8 surface needs no per-runtime skill work.
- **Injection (L4) splits the field:** runtimes with a `UserPromptSubmit` +
  `additionalContext` mechanism reach L4 (Claude, upgraded Codex); runtimes without
  it stay L3 (Antigravity, Grok).
- **Grok is the most Claude-compatible runtime:** it reads `.claude/settings.json`,
  `.claude/skills/`, `.claude/plugins/`, `.agents/skills/`, and `AGENTS.md`, so the
  canonical Claude package (E2) propagates with minimal new code.

---

## Reconciliation with CV21

- **E10 (Grok Runtime & Extension Surface):** target **L3**; logging via the native
  `.claude/settings.json` hook lifecycle (not wrapper/export-backfill) with
  `interface='grok_build'` and deferred extraction; skills via `.agents/skills/`;
  Mirror Mode via `AGENTS.md` + explicit slash invocation; external extensions ride
  `.agents/skills/`; MCP via `~/.grok/config.toml`. Account for project hook trust.
- CV21 parity matrix: Grok at **L3**, alongside Antigravity.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV21.E9.S1 | Hook lifecycle + injection | Spike | Full Claude-style lifecycle confirmed; `UserPromptSubmit` passive (no injection); `.claude/settings.json` read natively | ✅ Done |
| CV21.E9.S2 | Skill discovery + invocation | Spike | `.agents/skills/` discovered (no migration); slash `/scope:name` + implicit invocation | ✅ Done |
| CV21.E9.S3 | Plugin / MCP / import | Spike | Claude-shaped plugins + `.claude/plugins/` compat; MCP in `config.toml`; Claude import path | ✅ Done |
| CV21.E9.S4 | Parity decision | Decision | Honest parity fixed at **L3** (strong L1 logging); E10 reconciled to native hooks | ✅ Done |

---

## Done Condition

E9 is done when Grok's hook lifecycle, injection limit, skill discovery, invocation
syntax, plugin/MCP/import paths, and Mirror Mode model are mapped against Mirror's
contract with read-only evidence, honest parity is fixed (L3, strong L1), and E10
is reconciled — with no production Grok config mutated (live testing deferred to
E10's smoke test).

---

## References

- [CV21 — Runtime Expansion II](../index.md)
- [CV21.E1 Unified Plugin & MCP spike](../cv21-e1-unified-plugin-mcp-spike/index.md)
- [Runtime Interface Contract](../../../../product/specs/runtime-interface/index.md)
- [CV8 Runtime Expansion](../../cv8-runtime-expansion/index.md)
- Grok Build: <https://x.ai/cli> · local docs: `~/.grok/docs/user-guide/`
