[< CV21](../index.md)

# CV21.E3 — Codex Upgrade Spike

**Status:** ✅ Done

---

## Outcome

Confirm, with read-only evidence, that Codex 0.139.0 can move from the CV8-era
wrapper (L3) to a hook-based integration at **L4**, and map exactly how Mirror's
lifecycle, Mirror Mode injection, skill surface, and extensions land on it. As a
spike, this collapses into decidability, not code: E4 can implement against a
known contract.

Same discipline as E1: evidence from the `codex` binary's embedded hook JSON
schema, the authoritative `developers.openai.com/codex` docs, and local skill
examples. **No production Codex config mutated**; live hook-firing is deferred to
E4's isolated smoke test.

---

## Findings

### Lifecycle hooks — L4 confirmed reachable

Codex 0.139.0 has a full Claude-style hook system (`hooks.json` or `[hooks]` in
`config.toml`, at user/project/managed/plugin layers, with a `/hooks` trust
model). The mapping to Mirror's runtime contract is near-identical to Claude Code:

| Mirror event | Codex hook | Notes |
|---|---|---|
| Session start | `SessionStart` (matcher `startup\|resume`) | Input provides `session_id` and `transcript_path` |
| User prompt + Mirror Mode inject | `UserPromptSubmit` | Input has `prompt`, `session_id`; output `hookSpecificOutput.additionalContext` injects identity per turn — the **L4 mechanism** |
| Assistant log | `Stop` | Fires when Codex finishes a turn; `transcript_path` available |
| Extraction | deferred to next `SessionStart` | Codex has **no `SessionEnd`** hook; use the battle-tested Pi/Gemini deferred model |

Hook output wire fields confirmed in the binary schema: `additionalContext`,
`decision`, `continue`, `systemMessage`, `hookSpecificOutput`, `hookEventName`,
`reason`, `suppressOutput`. Hook input fields include `session_id`, `turn_id`,
`transcript_path`, `hook_event_name`, `prompt`.

**Implementation caveats for E4:**

- `async: true` hooks are parsed but **skipped** by Codex today. Mirror's Claude
  logging hooks use `async`; the Codex adapter must run logging synchronously and
  fast, or spawn its own background process.
- Only `type: "command"` handlers run (`prompt`/`agent` are parsed but skipped).
- Default hook timeout is 600s; prefer git-root-resolved hook command paths since
  Codex may start from a subdirectory.

### Skill surface — already correct, no migration needed

Correction to the CV21 plan: Codex discovers skills from **`.agents/skills/`**
(scanned from CWD up to the repo root, plus `$HOME/.agents/skills`,
`/etc/codex/skills`, and bundled system skills) and **follows symlinks**. That is
exactly the surface Mirror already publishes (`.agents/skills/mm-*` symlinked from
`.pi/skills/`). So Mirror's CV8 skill surface holds on Codex unchanged — there is
**no need to move `mm-*` skills into `.codex/skills/`**. `SKILL.md` needs `name` +
`description` frontmatter (the open agentskills.io standard). Invocation: explicit
via `/skills` or `$`-mention (e.g. `$mm-build`), or implicit by description match.

### Plugins / MCP / extensions

- Plugins are Codex's installable distribution unit (marketplace snapshots) and
  can bundle hooks; skills are the authoring format. Mirror's canonical package
  maps cleanly: skills via `.agents/skills/`, hooks via project `.codex/` or a
  plugin, MCP via `codex mcp`.
- **External extensions** become `.agents/skills/` entries (symlinked), so Codex
  discovers them automatically — closing the `.agents/` exposure gap for Codex
  through the surface it already reads.

### Honest parity

**L4 reachable.** Codex now supports per-turn context injection and a full hook
lifecycle, so the CV8 L3 ceiling ("no hooks, no injection") is obsolete. The
remaining work is implementation (E4) and exposure (E5), not capability.

---

## Reconciliation with CV21

- **E4 (Codex Hook Reimplementation):** proceed against the mapping above; honor
  the `async`-skipped caveat and the no-`SessionEnd` deferred-extraction model.
- **E5 (Codex Skill & Extension Surface):** revised — `mm-*` skills already work
  via `.agents/skills/`; E5's real work is external-extension exposure into
  `.agents/skills/` and optional plugin packaging, not a `.codex/skills/` migration.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV21.E3.S1 | Hook lifecycle mapping | Spike | SessionStart/UserPromptSubmit/Stop mapped to Mirror's logger contract; `session_id` + `transcript_path` confirmed | ✅ Done |
| CV21.E3.S2 | Per-turn injection | Spike | `UserPromptSubmit` `hookSpecificOutput.additionalContext` confirmed as the L4 injection field | ✅ Done |
| CV21.E3.S3 | Skill discovery + invocation | Spike | Codex reads `.agents/skills/` (symlink-aware); no migration; `$`-mention/implicit invocation | ✅ Done |
| CV21.E3.S4 | Parity decision | Decision | L4 confirmed reachable; E4/E5 reconciled; `async` + no-`SessionEnd` caveats recorded | ✅ Done |

---

## Done Condition

E3 is done when Codex's hook lifecycle, injection field, skill discovery, and
plugin/MCP/extension paths are mapped against Mirror's contract with read-only
evidence, L4 is confirmed reachable, and E4/E5 are reconciled — with no production
Codex config mutated (live hook-firing deferred to E4's smoke test).

---

## References

- [CV21 — Runtime Expansion II](../index.md)
- [Runtime Interface Contract](../../../../product/specs/runtime-interface/index.md)
- [CV8 Runtime Expansion](../../cv8-runtime-expansion/index.md)
- Codex hooks: <https://developers.openai.com/codex/hooks>
- Codex skills: <https://developers.openai.com/codex/skills>
- Codex CLI: <https://github.com/openai/codex>
