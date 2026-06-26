[< CV21](../index.md)

# CV21.E6 — Antigravity Runtime Spike

**Status:** ✅ Done

---

## Outcome

Map `agy` (Antigravity CLI v1.0.8) against Mirror's runtime contract and the E1
canonical-package decision, characterize `agy plugin import claude`, and fix the
honest parity. As a spike it collapses into decidability: E7 can implement against
a known contract.

Same discipline as E1/E3: read-only evidence from the `agy` binary (`hooks_pb`
proto symbols, skill-path strings), `agy plugin` help, and local config. **No
production Antigravity config mutated**; live import and hook-firing are deferred
to E7's isolated smoke test.

---

## Findings

### Hooks — tool/invocation/stop-centric, no clean per-turn injection

Antigravity's plugin hook system (`hooks_pb`) exposes:

| Hook | Args/Result |
|---|---|
| `PreToolHook` / `PostToolHook` | tool-call level |
| `PreInvocationHook` / `PostInvocationHook` | agent-invocation level |
| `StopHook` | turn end (`StopHookArgs`, `continuation_prompt_override`) |
| `HookSystemMessage` | a hook can return a system message |

**Critically absent: `SessionStart`, `UserPromptSubmit`, and `additionalContext`.**
So Antigravity lacks the clean per-turn user-prompt injection mechanism that gives
Codex and Claude Code their L4 parity. (The earlier `onSessionStart` strings were
TUI gesture handlers, not lifecycle hooks.)

There is an **unverified** stretch path: a `PreInvocationHook` returning a
`HookSystemMessage` *might* inject Mirror Mode context before each agent
invocation. The semantics (does it fire per user turn? does the system message
reach the model as context?) are not documented in fetchable sources and were not
hands-on tested in this spike. **E7 must probe this directly** before claiming
anything above L3.

### Skills — `.agents/skills/` discovered (same surface Mirror already uses)

Antigravity scans `{workspace}/.agents/skills/{skill_name}/SKILL.md` (plus global
and shared skill roots). That is exactly the surface Mirror already publishes
(`.agents/skills/mm-*` symlinked from `.pi/skills/`). So — as with Codex (E3) and
Grok — **Mirror's `mm-*` skill surface works on Antigravity unchanged**.
`.agents/skills/` is now confirmed as the universal skill-discovery path across
Codex, Grok, and Antigravity.

### Static instructions — `AGENTS.md`

Antigravity reads `AGENTS.md` (and `GEMINI.md`) as project/global customization
rules. Mirror already ships `AGENTS.md` (→ `CLAUDE.md` symlink), so Mirror Mode
context is carried by static instructions plus explicit skill invocation, the same
model Codex used at L3 in CV8.

### Plugin import / MCP

- `agy plugin import [gemini|claude]` scans for installed gemini/claude
  plugins/extensions and imports them (run now: "No claude extensions found" —
  non-destructive, and nothing to import until E2 builds the Mirror plugin). This
  confirms the import path is keyed to the Claude plugin format from E1.
- MCP is first-class (`mcpServers`; validated in E1), so the Mirror MCP server is
  portable here as the command surface.
- The agent already runs `uv` (permission `command(uv)` granted), so
  `uv run python -m memory ...` is callable (L0 baseline).

### Honest parity — L3 (not L4)

Confirmed **L3**, a downgrade from the E6 "L3–L4" hypothesis:

- L0 ✓ (runs `uv`), L2 ✓ (`.agents/skills/` + MCP), L3 ✓ (`AGENTS.md` + explicit
  invocation).
- **L4 not reachable** as confirmed: no `UserPromptSubmit`/`additionalContext`.
  The `PreInvocation` + `HookSystemMessage` path is an unverified stretch for E7;
  if it does not deliver per-turn injection, Antigravity stays at L3 — the same
  honest level Codex held in CV8 and Grok is expected to hold.
- Logging has no clean hook lifecycle (no `SessionStart`/`SessionEnd`) and
  conversations are stored as opaque protobuf, so transcript backfill is
  impractical. Logging will use a wrapper around `agy --print` and/or `StopHook`,
  with deferred extraction — decided in E7.

---

## Reconciliation with CV21

- **E7 (Antigravity Runtime & Extension Surface):** target **L3**; carry Mirror
  Mode via `AGENTS.md` + explicit `mm-*` invocation; skills via `.agents/skills/`
  (no new surface); logging via wrapper/`StopHook` + deferred extraction;
  external extensions ride `.agents/skills/`. **Probe** the `PreInvocation` +
  `HookSystemMessage` injection path; only then consider claiming above L3.
- The CV21 parity matrix should list Antigravity at **L3**, alongside Codex's
  pre-upgrade level and Grok — distinct from the L4 runtimes (Claude, upgraded
  Codex).

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV21.E6.S1 | Hook surface mapping | Spike | `hooks_pb` event set mapped; no `UserPromptSubmit`/`additionalContext`; `PreInvocation`+`HookSystemMessage` flagged as unverified injection path | ✅ Done |
| CV21.E6.S2 | Skill + instruction surface | Spike | `.agents/skills/` discovery confirmed (no migration); `AGENTS.md` static instructions confirmed | ✅ Done |
| CV21.E6.S3 | Plugin import + MCP | Spike | `agy plugin import claude` path confirmed (keyed to Claude plugin); MCP portable | ✅ Done |
| CV21.E6.S4 | Parity decision | Decision | Honest parity fixed at **L3** (down from L3–L4); E7 reconciled with the `PreInvocation` probe | ✅ Done |

---

## Done Condition

E6 is done when Antigravity's hook surface, skill discovery, static-instruction
path, plugin-import path, and MCP support are mapped against Mirror's contract with
read-only evidence, honest parity is fixed (L3, with the `PreInvocation` stretch
flagged for E7), and E7 is reconciled — with no production Antigravity config
mutated (live import/hook-firing deferred to E7's smoke test).

---

## References

- [CV21 — Runtime Expansion II](../index.md)
- [CV21.E1 Unified Plugin & MCP spike](../cv21-e1-unified-plugin-mcp-spike/index.md)
- [Runtime Interface Contract](../../../../product/specs/runtime-interface/index.md)
- [CV8 Runtime Expansion](../../cv8-runtime-expansion/index.md)
- Antigravity CLI: <https://github.com/google-antigravity/antigravity-cli>
- Antigravity docs: <https://antigravity.google/docs/cli-overview>
