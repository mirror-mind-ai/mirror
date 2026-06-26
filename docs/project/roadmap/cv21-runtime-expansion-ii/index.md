[< Roadmap](../index.md)

# CV21 — Runtime Expansion II: Plugin & MCP Convergence

**Status:** 🟢 In Progress
**Goal:** Bring Mirror Mind's runtime adapters into the plugin/hook/MCP era. Package Mirror once as a canonical plugin (Claude-compatible) plus an MCP server, prove it on Claude, then propagate it to Codex (upgrade L3→L4), Antigravity (migrate off the deprecated Gemini CLI), and Grok Build (new) — including the external extension surface, without duplicating business logic.

---

## What This Is

CV8 (Runtime Expansion) attached Mirror Mind to new runtimes through bespoke,
per-runtime adapters: Claude Code hooks, the Pi extension, Gemini CLI shell
hooks, and a Codex wrapper plus JSONL backfill. Each is hand-built and drifts
independently.

Since CV8, the whole coding-agent ecosystem converged on the **same primitives —
plugins, hooks, skills, and MCP** — and, crucially, on the **same plugin shape**:
a manifest bundling skills + agents + hooks + MCP servers. Claude Code defines it
(`.claude-plugin/plugin.json`); Antigravity imports it (`agy plugin import claude`);
Grok Build imports it (`grok plugin import`); Codex installs equivalents through
its marketplace. The Claude plugin format is becoming the de-facto cross-runtime
interchange format.

CV21 exploits that convergence. Instead of N bespoke adapters, Mirror Mind is
authored **once** as a canonical plugin plus an MCP server, then propagated to
each runtime through import/install rather than reimplementation. Four drivers:

- **Anchor — Claude Code:** already at L4, but Mirror ships through the
  *standalone* `.claude/` tier, which Anthropic explicitly frames as for "personal
  workflows / quick experiments." Mirror is a distributed, versioned framework —
  the *plugin* use case. Converting it to a plugin both modernizes Claude
  distribution and produces the canonical package the other runtimes consume.
- **Upgrade — Codex:** CV8 capped Codex at L3 for lack of hooks. Codex 0.139.0
  now has a full Claude-style hook system, native skills, plugins, and MCP — so
  **L4 is reachable** and the CV8 wrapper can be retired.
- **Migrate — Antigravity:** Google is deprecating the Gemini Code Assist
  individual backend on **2026-06-18**
  ([notice](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)).
  Its successor is **Google Antigravity** (`agy` CLI), which can import Claude
  plugins. The Gemini CLI integration is retired.
- **Add — Grok Build:** **xAI Grok Build** (`grok` CLI, [x.ai/cli](https://x.ai/cli))
  is a new runtime that already discovers our skills and can import plugins.

This is **not** a reopening of CV8. CV8 stays done as historical record. CV21 is
its successor — reusing CV8's runtime contract, parity model, and `review-copy`
reference path, but replacing per-runtime reinvention with one shared package.

---

## Spike Findings (preliminary, evidence-based)

Gathered by inspecting installed binaries (`claude` 2.1.114, `codex` 0.139.0,
`agy` 1.0.8, `grok` 0.2.39), the public `google-antigravity/antigravity-cli` and
`openai/codex` repos, and the fetchable Claude/Codex docs. These are the working
hypotheses the spike epics must confirm hands-on.

### Claude Code (`claude` v2.1.114) — the anchor

- Already at **L4**: current hook events (SessionStart, UserPromptSubmit,
  SessionEnd, …), native skills via `/skill-name`, MCP (`--mcp-config`), and a
  plugin system with marketplaces (`~/.claude/plugins/`, `installed_plugins.json`).
  **No parity work needed.**
- Mirror uses the **standalone `.claude/`** tier (committed hooks + `mm:*` skills).
  Anthropic's docs frame standalone as personal/experimental and **plugins** as
  the path for "sharing, versioned releases, reusable across projects, marketplace
  distribution" — which is exactly Mirror's situation.
- A Claude **plugin** (`.claude-plugin/plugin.json`) bundles skills + agents +
  hooks + MCP servers — the canonical package the other runtimes import.
- **Opportunity: distribution modernization, not parity.** Convert standalone
  `.claude/` into the Mirror plugin; wire `statusLine`; optionally expose MCP.

### Codex (`codex` CLI v0.139.0)

- CV8's "no lifecycle hooks / no per-turn injection / L3 ceiling" is now obsolete.
  Codex has a **full Claude-style hook system** (`SessionStart`, `UserPromptSubmit`,
  `PreToolUse`/`PostToolUse`, `PreCompact`/`PostCompact`, `SubagentStart`/`Stop`),
  configured via `hooks.json` or `[hooks]` in `config.toml`, with a `/hooks` trust
  model. Confirmed from the binary hook schema and `developers.openai.com/codex/hooks`.
- **Per-turn context injection** via `UserPromptSubmit` `hookSpecificOutput.additionalContext`;
  **skills discovered from `.agents/skills/`** (the surface Mirror already uses,
  symlink-aware) plus `~/.codex/skills/`; plugins + marketplaces; MCP client
  (`codex mcp`) and server (`codex mcp-server`); `codex exec` headless;
  configurable `[tui] status_line`; and `codex doctor`.
- **E3 confirmed: L4 reachable.** `SessionStart`/`Stop` expose `session_id` +
  `transcript_path`; the hook adapter is close kin to Claude's. Caveats: `async`
  hooks are skipped (logging must be synchronous) and there is no `SessionEnd`
  (use deferred extraction).

### Antigravity (`agy` CLI v1.0.8)

- Real CLI (headless `--print`, TUI, `--sandbox`), **not** IDE-only. Embeds a
  Claude-shaped plugin model (`plugin.json` + `SKILL.md` + hooks + rules +
  commands), `agy plugin import [gemini|claude]`, `agy plugin validate`, a
  marketplace, and first-class MCP.
- **Skills discovered from `.agents/skills/`** (E6) — the surface Mirror already
  uses, as on Codex/Grok; static instructions via `AGENTS.md`.
- **E6 confirmed: L3 (not L4).** The hook system is tool/invocation/stop-centric
  (`PreToolHook`/`PostToolHook`/`PreInvocationHook`/`PostInvocationHook`/`StopHook`)
  with **no `UserPromptSubmit` or `additionalContext`** — the clean per-turn
  injection is absent. Mirror Mode via `AGENTS.md` + explicit invocation; logging
  via wrapper/`StopHook`. An unverified `PreInvocation` + `HookSystemMessage`
  injection path is flagged for E7 to probe. `agy plugin import claude` consumes
  the Claude plugin from E1.

### Grok Build (`grok` CLI v0.2.51)

- The **most Claude-compatible** new runtime: reads `.claude/settings.json`
  hooks, `.claude/skills/`, `.claude/plugins/`, `.agents/skills/`, and `AGENTS.md`
  natively (compat on by default).
- **E9 confirmed: L3 (strong L1).** Full Claude-style hook lifecycle
  (`SessionStart`/`UserPromptSubmit`/`Stop`/`SessionEnd`) read from
  `.claude/settings.json` — so logging is via **native hooks, not export/backfill**.
  But `UserPromptSubmit` is passive (stdout ignored) — **no `additionalContext`
  injection**, so Mirror Mode stays `AGENTS.md` + explicit slash invocation. Skills
  via `.agents/skills/` (no migration); MCP in `~/.grok/config.toml`; Claude-shaped
  plugins consume the canonical package via `.claude/plugins/` compat.

---

## Parity Levels

CV21 reuses CV8's explicit parity levels (L0 CLI-assisted → L4 full parity). See
[CV8 Runtime Parity Levels](../cv8-runtime-expansion/index.md#runtime-parity-levels).
No fake parity: each runtime claims only what it honestly supports.

---

## Product Outcome

- Mirror Mind is packaged as a **canonical plugin** (Claude-compatible: skills +
  hooks + MCP) plus a **Mirror MCP server**, authored once.
- **Claude** users install Mirror as a plugin/marketplace package instead of
  committing `.claude/` scaffolding into their repos.
- **Codex** is upgraded from the CV8 wrapper to a hook-based integration (target
  L4) with native skills, writing `interface='codex'`.
- **Antigravity** runs Mirror with continuity (`interface='antigravity'`) by
  importing the canonical plugin; the Gemini CLI integration is retired.
- **Grok Build** runs Mirror at its highest honest parity, `interface='grok_build'`.
- **User-owned extensions** (the `review-copy` reference and others) work on every
  runtime, riding the same plugin/MCP package — not just built-in `mm-*` skills.

---

## Epics

| Code | Epic | User-visible outcome | Status |
|------|------|----------------------|--------|
| [CV21.E1](cv21-e1-unified-plugin-mcp-spike/index.md) | Unified Plugin & MCP Spike | Validated (isolated, no config mutated): a Mirror plugin passes `claude plugin validate` and `agy plugin validate`; formats aligned but bridged by `agy plugin import claude`; MCP carries the command surface but not auto-injection. Decision: converge with thin-adapter fallback | ✅ Done |
| [CV21.E2](cv21-e2-mirror-plugin-mcp-foundation/index.md) | Mirror Plugin & MCP Foundation (Claude) | Author the canonical Mirror Mind plugin (skills + hooks + MCP) + MCP server; convert Mirror's standalone `.claude/` to the plugin; wire `statusLine`; prove on Claude as the reference runtime; isolated smoke test | 🟢 Active |
| [CV21.E3](cv21-e3-codex-upgrade-spike/index.md) | Codex Upgrade Spike | Confirmed (read-only, no config mutated): full Claude-style hooks (`SessionStart`/`UserPromptSubmit`→`additionalContext`/`Stop`) → **L4 reachable**; `session_id` + `transcript_path` available; skills already discovered via `.agents/skills/` (no migration). Caveats: `async` hooks skipped, no `SessionEnd` | ✅ Done |
| CV21.E4 | Codex Hook + Plugin Reimplementation | Hooks replace the CV8 wrapper and consume the shared plugin/MCP: `SessionStart`/`UserPromptSubmit`/`Stop` logging + Mirror Mode injection; target L4; keeps `interface='codex'`. Logging must be synchronous (`async` skipped); deferred extraction (no `SessionEnd`); isolated smoke test | 🟡 Planned |
| CV21.E5 | Codex Skill & Extension Surface | `mm-*` skills already discovered via `.agents/skills/` (E3 finding — no migration); expose user-owned extensions into `.agents/skills/` and/or a Codex plugin; smoke test | 🟡 Planned |
| [CV21.E6](cv21-e6-antigravity-runtime-spike/index.md) | Antigravity Runtime Spike | Confirmed (read-only, no config mutated): hooks are tool/invocation/stop-centric — **no `UserPromptSubmit`/`additionalContext`** → honest parity **L3** (not L4); skills via `.agents/skills/` (no migration); Mirror Mode via `AGENTS.md`; `agy plugin import claude` path confirmed. `PreInvocation`+`HookSystemMessage` injection flagged for E7 | ✅ Done |
| CV21.E7 | Antigravity Runtime & Extension Surface | Antigravity runs Mirror at **L3** via `.agents/skills/` + `AGENTS.md` + explicit invocation; logging via wrapper/`StopHook` + deferred extraction (`interface='antigravity'`); external extensions ride `.agents/skills/`; probe `PreInvocation`+`HookSystemMessage` injection; isolated smoke test | 🟡 Planned |
| CV21.E8 | Gemini CLI Sunset | The `.gemini/` shell-hook integration is honestly retired; Antigravity documented as its successor; all runtime-facing docs updated. Honest note (E6): Gemini CLI was L4; Antigravity is L3 — automatic per-turn injection is lost in the migration | 🟡 Planned |
| [CV21.E9](cv21-e9-grok-build-runtime-spike/index.md) | Grok Build Runtime Spike | Confirmed (read-only, no config mutated): full Claude-style hook lifecycle read from `.claude/settings.json` (native logging, **not** export/backfill); `UserPromptSubmit` passive → no injection → honest parity **L3** (strong L1); skills via `.agents/skills/` (no migration); plugins via `.claude/plugins/` compat; MCP in `config.toml` | ✅ Done |
| CV21.E10 | Grok Build Runtime & Extension Surface | Grok runs Mirror at **L3** via native `.claude/settings.json` hook lifecycle (`interface='grok_build'`, deferred extraction, project-trust aware); skills via `.agents/skills/`; Mirror Mode via `AGENTS.md` + explicit slash invocation; external extensions ride `.agents/skills/`; MCP via `~/.grok/config.toml`; isolated smoke test | 🟡 Planned |
| CV21.E11 | Contract & Docs Refresh | All runtimes folded into the runtime interface contract, decisions, and the parity matrix across README, Getting Started, REFERENCE, and architecture; the plugin/MCP convergence documented | 🟡 Planned |

---

## External Extension Surface Assessment

Extensions must work on every runtime, not just built-in `mm-*` skills. The
convergence changes how: external extensions ride the **same canonical plugin /
MCP package** the foundation builds, rather than each runtime growing a bespoke
exposure path.

### Current model (as built)

- Extensions declare a `runtimes:` map in `skill.yaml` (per-runtime `command_name`
  + `skill_file`); runtime names are regex-validated, not allow-listed.
- Command-name conventions are enforced only for `claude` (`ext:`) and `pi`
  (`ext-`); materialization writes a per-runtime catalog at
  `~/.mirror-minds/<user>/runtime/skills/<runtime>/extensions.json`.
- Consumption today: Claude via `expose-claude` projecting into `.claude/skills/`;
  Pi via the `mirror-logger` catalog read. Gemini CLI/Codex rely on the shared
  `.agents/skills/` symlink surface, which currently carries only built-in `mm-*`
  skills. Reference extension: `examples/extensions/review-copy/`.

### Identified gap and how the foundation closes it

External-extension exposure to the `.agents/`-discovering runtimes (Gemini CLI,
Codex — and now Antigravity, Grok) is **not implemented**: only built-in `mm-*`
skills are surfaced. The foundation (E2) closes this structurally — external
extensions are bundled into the canonical plugin and/or exposed via the MCP
server, so each runtime inherits them through the same import/install path rather
than a per-runtime projection. For Codex, external extensions are exposed through
the `.agents/skills/` surface it already discovers (E3) — no separate projection.

### Concrete extension work

1. Add command-name conventions (or an explicit no-convention decision) for the
   new runtime keys; keep `interface='codex'` and register `antigravity` /
   `grok_build`.
2. Bundle external `prompt-skill` extensions into the canonical plugin / expose
   them through the MCP server (E2), so Claude, Antigravity, Grok, and Codex pick
   them up via import/install.
3. Add `antigravity:`, `grok:`, and `codex:` runtime blocks to
   `review-copy/skill.yaml`.
4. Prove `review-copy` invocable end-to-end on each runtime (E5/E7/E10) via
   isolated smoke tests, mirroring the CV6/CV8 reference path.

---

## Non-Goals

- No new memory implementation per runtime; no per-runtime schema beyond the
  `interface` label.
- No hosted service or daemon.
- No rewrite of Pi behavior except where CV21 exposes a shared runtime-contract or
  extension-surface bug.
- No forced migration of Claude users off standalone `.claude/`; the plugin is the
  recommended path, the standalone path keeps working.
- The Codex upgrade keeps `interface='codex'` and must not break existing Codex
  sessions; the CV8-era wrapper is retired only after the hook path proves L4 in
  an isolated smoke test.
- No betting the per-runtime epics on cross-runtime plugin import before E1 proves
  it real; if import is unreliable, fall back to thin per-runtime adapters that
  still consume the shared MCP server.
- No fake parity; no Antigravity *IDE* (GUI) integration — `agy` CLI only.

---

## Sequencing

Sequenced by implementation leverage and user base, not by the Gemini deadline.
Mirror's users are mostly on Claude and Codex; very few use Gemini, so missing the
2026-06-18 Gemini cutoff is acceptable.

```text
E1 Unified Plugin & MCP spike            (keystone — is cross-runtime import real?)
  └── E2 Mirror Plugin & MCP foundation on Claude   (canonical package, proven on the most-used runtime)
        ├── E3 Codex spike → E4 Codex hook+plugin reimpl (L4) → E5 Codex skills + extensions
        ├── E6 Antigravity spike → E7 Antigravity runtime + extensions   (+ E8 Gemini CLI sunset)
        └── E9 Grok spike → E10 Grok runtime + extensions
              └── E11 contract & docs refresh (all runtimes)
```

Order rationale:

1. **Foundation first.** The canonical plugin + MCP server is the keystone; E1
   proves cross-runtime import is real before the per-runtime epics depend on it.
2. **Claude as reference (E2).** It is the most-used runtime and the native home of
   the plugin format, so the canonical package is built and validated where it is
   best understood.
3. **Codex next (E3–E5).** Second most-used; now hook/plugin/MCP-capable; the
   biggest parity gain (L3 → L4) and the cleanest consumer of the foundation.
4. **Antigravity (E6–E8).** Imports the Claude plugin; Gemini sunset folds in.
   Deprioritized from the deadline because few Mirror users are on Gemini.
5. **Grok (E9–E10).** Newest and least-used; most uncertain; last.
6. **Docs refresh (E11).** Folds every runtime into the canonical spec once real
   parity is known.

---

## Done Condition

CV21 is done when:

- Mirror Mind is packaged as a canonical plugin + MCP server and validated on
  Claude, which installs it as a plugin rather than committed `.claude/` scaffolding;
- the Codex surface is upgraded from the CV8 wrapper to a hook-based integration at
  its highest honest parity (target L4), writing `interface='codex'`, with native
  skills and the `review-copy` reference extension working;
- Antigravity runs Mirror at its highest honest parity, writes
  `interface='antigravity'`, has an isolated smoke test, and runs `review-copy`;
- Grok Build runs Mirror at its highest honest parity, writes
  `interface='grok_build'`, has an isolated smoke test, and runs `review-copy`;
- the Gemini CLI integration is honestly retired across all runtime-facing docs;
- external extensions are discoverable and invocable on every runtime via the
  shared package;
- the runtime interface contract, decisions log, and parity matrix across README,
  Getting Started, REFERENCE, and architecture clearly distinguish Claude Code, Pi,
  Codex, Antigravity, Grok Build, and the retired Gemini CLI.

---

## References

- [Runtime Interface Contract](../../../product/specs/runtime-interface/index.md)
- [CV8 Runtime Expansion](../cv8-runtime-expansion/index.md)
- [Extensions](../../../product/extensions/index.md) ·
  [Binding Model](../../../product/extensions/binding-model.md)
- Claude Code plugins: <https://docs.claude.com/en/docs/claude-code/plugins> ·
  skills: <https://docs.claude.com/en/docs/claude-code/skills>
- Codex CLI: <https://github.com/openai/codex> ·
  hooks: <https://developers.openai.com/codex/hooks>
- Antigravity CLI: <https://github.com/google-antigravity/antigravity-cli> ·
  docs: <https://antigravity.google/docs/cli-overview>
- Grok Build: <https://x.ai/cli>
- Gemini Code Assist individual deprecation: <https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals>
