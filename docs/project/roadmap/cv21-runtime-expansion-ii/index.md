[< Roadmap](../index.md)

# CV21 — Runtime Expansion II: Plugin & MCP Convergence

**Status:** 🟢 In Progress
**Goal:** Bring Mirror Mind's runtime adapters into the plugin/hook/MCP era. Package Mirror once as a canonical plugin (Claude-compatible) plus an MCP server, prove it on Claude, then propagate it to Codex (upgrade L3→L4), Antigravity (migrate off the deprecated Gemini CLI), and Grok Build (new) — including the external extension surface, without duplicating business logic.

> **Restart notice (2026-10-13):** CV21 stopped after DS2.US2 on 2026-06-23,
> the last Python baseline before CV22 ported the core to TypeScript and moved
> distribution to npm. It resumes under Ariad on the `mirror` journey, with its
> epics mapped one-to-one to Delivery Stories. Its spike evidence (DS1, DS3, DS6,
> DS9) describes the June runtime versions and a Python core. Before any
> per-runtime Delivery Story is pulled,
> [DS12](cv21-ds12-runtime-re-baseline/index.md) re-measures that evidence on the
> installed versions
> ([decision](../../decisions.md#cv21-re-baselines-its-runtime-evidence-before-building-on-it)).
> Gemini CLI is
> [retired](../../decisions.md#gemini-cli-is-retired-and-antigravity-is-its-successor),
> and Antigravity succeeds it.

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
  plugins. Mirror retires its Gemini CLI integration
  ([decision](../../decisions.md#gemini-cli-is-retired-and-antigravity-is-its-successor)),
  which v0.32.1 still ships.
- **Add — Grok Build:** **xAI Grok Build** (`grok` CLI, [x.ai/cli](https://x.ai/cli))
  is a new runtime that already discovers our skills and can import plugins.

This is **not** a reopening of CV8. CV8 stays done as historical record. CV21 is
its successor — reusing CV8's runtime contract, parity model, and `review-copy`
reference path, but replacing per-runtime reinvention with one shared package.

---

## Spike Findings (June 2026, evidence-based)

> These describe the runtime versions installed in June 2026 and a Python core.
> [DS12](cv21-ds12-runtime-re-baseline/index.md) re-measures them. Until it closes,
> read them as history, not as the current contract.

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
- **DS3 confirmed: L4 reachable.** `SessionStart`/`Stop` expose `session_id` +
  `transcript_path`; the hook adapter is close kin to Claude's. Caveats: `async`
  hooks are skipped (logging must be synchronous) and there is no `SessionEnd`
  (use deferred extraction).

### Antigravity (`agy` CLI v1.0.8)

- Real CLI (headless `--print`, TUI, `--sandbox`), **not** IDE-only. Embeds a
  Claude-shaped plugin model (`plugin.json` + `SKILL.md` + hooks + rules +
  commands), `agy plugin import [gemini|claude]`, `agy plugin validate`, a
  marketplace, and first-class MCP.
- **Skills discovered from `.agents/skills/`** (DS6) — the surface Mirror already
  uses, as on Codex/Grok; static instructions via `AGENTS.md`.
- **DS6 confirmed: L3 (not L4).** The hook system is tool/invocation/stop-centric
  (`PreToolHook`/`PostToolHook`/`PreInvocationHook`/`PostInvocationHook`/`StopHook`)
  with **no `UserPromptSubmit` or `additionalContext`** — the clean per-turn
  injection is absent. Mirror Mode via `AGENTS.md` + explicit invocation; logging
  via wrapper/`StopHook`. An unverified `PreInvocation` + `HookSystemMessage`
  injection path is flagged for DS7 to probe. `agy plugin import claude` consumes
  the Claude plugin from DS1.

### Grok Build (`grok` CLI v0.2.51)

- The **most Claude-compatible** new runtime: reads `.claude/settings.json`
  hooks, `.claude/skills/`, `.claude/plugins/`, `.agents/skills/`, and `AGENTS.md`
  natively (compat on by default).
- **DS9 confirmed: L3 (strong L1).** Full Claude-style hook lifecycle
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
No fake parity: each runtime claims only what it honestly supports. Each claim
names the runtime version, binary, and date it was measured on (the
[evidence rule](cv21-ds12-runtime-re-baseline/index.md#evidence-rule)).

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

## Delivery Stories

CV21 is governed by [Ariad](../ariad-adoption.md) on the `mirror` journey since
2026-10-13 ([decision](../../decisions.md#cv21-resumes-under-ariad-on-the-mirror-journey-its-epics-mapped-one-to-one-to-delivery-stories)).
Its former epics are Delivery Stories, one-to-one, and the [code map](#code-map)
resolves every code written before the migration. A Delivery Story without a
package gets one when it is pulled, and expands into User and Technical Stories.

| Code | Delivery Story | User-visible outcome | Status |
|------|----------------|----------------------|--------|
| [CV21.DS1](cv21-ds1-unified-plugin-mcp-spike/index.md) | Unified Plugin & MCP Spike | Validated (isolated, no config mutated): a Mirror plugin passes `claude plugin validate` and `agy plugin validate`; formats aligned but bridged by `agy plugin import claude`; MCP carries the command surface but not auto-injection. Decision: converge with thin-adapter fallback | ✅ Done |
| [CV21.DS2](cv21-ds2-mirror-plugin-mcp-foundation/index.md) | Mirror Plugin & MCP Foundation (Claude) | Author the canonical Mirror Mind plugin (skills + hooks + MCP) + MCP server; convert Mirror's standalone `.claude/` to the plugin; wire `statusLine`; prove on Claude as the reference runtime; isolated smoke test | 🟢 Active |
| [CV21.DS3](cv21-ds3-codex-upgrade-spike/index.md) | Codex Upgrade Spike | Confirmed (read-only, no config mutated): full Claude-style hooks (`SessionStart`/`UserPromptSubmit`→`additionalContext`/`Stop`) → **L4 reachable**; `session_id` + `transcript_path` available; skills already discovered via `.agents/skills/` (no migration). Caveats: `async` hooks skipped, no `SessionEnd` | ✅ Done |
| CV21.DS4 | Codex Hook + Plugin Reimplementation | Hooks replace the CV8 wrapper and consume the shared plugin/MCP: `SessionStart`/`UserPromptSubmit`/`Stop` logging + Mirror Mode injection; target L4; keeps `interface='codex'`. Logging must be synchronous (`async` skipped); deferred extraction (no `SessionEnd`); isolated smoke test | 🟡 Planned |
| CV21.DS5 | Codex Skill & Extension Surface | `mm-*` skills already discovered via `.agents/skills/` (DS3 finding — no migration); expose user-owned extensions into `.agents/skills/` and/or a Codex plugin; smoke test | 🟡 Planned |
| [CV21.DS6](cv21-ds6-antigravity-runtime-spike/index.md) | Antigravity Runtime Spike | Confirmed (read-only, no config mutated): hooks are tool/invocation/stop-centric — **no `UserPromptSubmit`/`additionalContext`** → honest parity **L3** (not L4); skills via `.agents/skills/` (no migration); Mirror Mode via `AGENTS.md`; `agy plugin import claude` path confirmed. `PreInvocation`+`HookSystemMessage` injection flagged for DS7 | ✅ Done |
| CV21.DS7 | Antigravity Runtime & Extension Surface | Antigravity runs Mirror at **L3** via `.agents/skills/` + `AGENTS.md` + explicit invocation; logging via wrapper/`StopHook` + deferred extraction (`interface='antigravity'`); external extensions ride `.agents/skills/`; probe `PreInvocation`+`HookSystemMessage` injection; isolated smoke test | 🟡 Planned |
| CV21.DS8 | Gemini CLI Sunset | The Gemini CLI integration v0.32.1 still ships is removed behind a documented cutoff ([decision](../../decisions.md#gemini-cli-is-retired-and-antigravity-is-its-successor)): the `.gemini/hooks` wrappers, the `gemini` hook family, the `mirror init` steps, the Gemini smoke, and every runtime-facing doc; Antigravity named as the successor; released with its own note. Gemini *models* are untouched. Honest note (DS6): Gemini CLI was L4, and Antigravity measured L3 on `agy` 1.0.8, so per-turn injection is lost unless the current `agy` offers it | 🟡 Planned |
| [CV21.DS9](cv21-ds9-grok-build-runtime-spike/index.md) | Grok Build Runtime Spike | Confirmed (read-only, no config mutated): full Claude-style hook lifecycle read from `.claude/settings.json` (native logging, **not** export/backfill); `UserPromptSubmit` passive → no injection → honest parity **L3** (strong L1); skills via `.agents/skills/` (no migration); plugins via `.claude/plugins/` compat; MCP in `config.toml` | ✅ Done |
| CV21.DS10 | Grok Build Runtime & Extension Surface | Grok runs Mirror at **L3** via native `.claude/settings.json` hook lifecycle (`interface='grok_build'`, deferred extraction, project-trust aware); skills via `.agents/skills/`; Mirror Mode via `AGENTS.md` + explicit slash invocation; external extensions ride `.agents/skills/`; MCP via `~/.grok/config.toml`; isolated smoke test | 🟡 Planned |
| CV21.DS11 | Contract & Docs Refresh | All runtimes folded into the runtime interface contract, decisions, and the parity matrix across README, Getting Started, REFERENCE, and architecture; the plugin/MCP convergence documented | 🟡 Planned |
| [CV21.DS12](cv21-ds12-runtime-re-baseline/index.md) | Runtime Re-Baseline | Every runtime finding re-measured in isolation on the installed version, with version, binary, and date recorded. The plugin imports DS1 deferred run live, and the extension surface is re-grounded on the TypeScript extension contract. A decision confirms or reshapes DS2's remainder and DS4–DS11. Pulled before any per-runtime Delivery Story | 🟡 Planned |

---

## Code Map

The migration of 2026-10-13 kept every number, and folders moved with their codes
(`cv21-e2-…` became `cv21-ds2-…`). A code written before it resolves as follows.

| Before | After | Where |
|--------|-------|-------|
| `CV21.E<n>` | `CV21.DS<n>` | the Delivery Story with the same number |
| `CV21.E1.S1`–`S4` | `CV21.DS1.TS1`–`TS4` | rows of [DS1](cv21-ds1-unified-plugin-mcp-spike/index.md)'s candidate table |
| `CV21.E2.S1` | `CV21.DS2.US1` | [Claude plugin conversion](cv21-ds2-mirror-plugin-mcp-foundation/cv21-ds2-us1-claude-plugin-conversion/index.md) |
| `CV21.E2.S1b` | `CV21.DS2.US1b` | [Claude skill parity](cv21-ds2-mirror-plugin-mcp-foundation/cv21-ds2-us1b-claude-skill-parity/index.md) |
| `CV21.E2.S2` | `CV21.DS2.US2` | [Mirror MCP server](cv21-ds2-mirror-plugin-mcp-foundation/cv21-ds2-us2-mirror-mcp-server/index.md) |
| `CV21.E2.S3` | `CV21.DS2.US3` | a row of [DS2](cv21-ds2-mirror-plugin-mcp-foundation/index.md)'s candidate table, no package yet |
| `CV21.E2.S4` | `CV21.DS2.TS4` | a row of [DS2](cv21-ds2-mirror-plugin-mcp-foundation/index.md)'s candidate table, no package yet |
| `CV21.E3.S<n>`, `CV21.E6.S<n>`, `CV21.E9.S<n>` | `CV21.DS3.TS<n>`, `CV21.DS6.TS<n>`, `CV21.DS9.TS<n>` | rows of each spike's candidate table |

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
skills are surfaced. The foundation (DS2) closes this structurally — external
extensions are bundled into the canonical plugin and/or exposed via the MCP
server, so each runtime inherits them through the same import/install path rather
than a per-runtime projection. For Codex, external extensions are exposed through
the `.agents/skills/` surface it already discovers (DS3) — no separate projection.

### Concrete extension work

1. Add command-name conventions (or an explicit no-convention decision) for the
   new runtime keys; keep `interface='codex'` and register `antigravity` /
   `grok_build`.
2. Bundle external `prompt-skill` extensions into the canonical plugin / expose
   them through the MCP server (DS2), so Claude, Antigravity, Grok, and Codex pick
   them up via import/install.
3. Add `antigravity:`, `grok:`, and `codex:` runtime blocks to
   `review-copy/skill.yaml`.
4. Prove `review-copy` invocable end-to-end on each runtime (DS5/DS7/DS10) via
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
- No betting the per-runtime Delivery Stories on cross-runtime plugin import
  before it has run live (DS12); if import is unreliable, fall back to thin per-runtime adapters that
  still consume the shared MCP server.
- No fake parity; no Antigravity *IDE* (GUI) integration — `agy` CLI only.

---

## Sequencing

Sequenced by implementation leverage and user base. Mirror's users are mostly on
Claude Code and Codex. Few used Gemini CLI, which is now retired.

```text
Done (June 2026)    DS1 unified plugin & MCP spike · DS3 Codex · DS6 Antigravity · DS9 Grok spikes
In progress         DS2 plugin & MCP foundation on Claude: US1, US1b, US2 done; US3, TS4 open

Next                DS12 runtime re-baseline        (re-measure before building on it)
                      ├── DS2 remainder             US3 status line · TS4 reference smoke
                      ├── DS4 Codex hooks + plugin → DS5 Codex skills + extensions
                      ├── DS7 Antigravity runtime + extensions → DS8 Gemini CLI removal
                      └── DS10 Grok runtime + extensions
                            └── DS11 contract & docs refresh (all runtimes)
```

Order rationale:

1. **Re-baseline first (DS12).** The June evidence ran on older runtime versions and
   a Python core, and the plugin import it bet on has never run. No per-runtime story
   builds on evidence nobody re-measured.
2. **Claude as reference (DS2's remainder).** It is the most-used runtime and the
   native home of the plugin format. CV22 already proved the npm-era plugin in a real
   Claude Code session, so TS4 may close on DS12's Claude evidence.
3. **Codex next (DS4–DS5).** It is the second most-used runtime and has the biggest
   parity gain (L3 → L4). It starts from the wrapper v0.32.1 ships, not from CV8's.
4. **Antigravity, then the Gemini removal (DS7 → DS8).** The Gemini cutoff has to
   tell its users what to do instead, so a wired successor comes first.
5. **Grok (DS10).** It is the newest and least-used runtime, and the most uncertain.
6. **Docs refresh (DS11).** It folds every runtime into the canonical spec once real
   parity is known.

DS12's decision may reorder, merge, or drop any of these.

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
- the Gemini CLI integration is removed from the package behind a documented cutoff
  and retired across all runtime-facing docs;
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
