[< CV21](../index.md)

# CV21.DS2 — Mirror Plugin & MCP Foundation

**Status:** 🟢 In Progress
**Type:** Delivery Story
**Renamed from:** CV21.E2, in the CV21 Ariad taxonomy migration (2026-10-13). Text
written before then keeps the codes it was written with; the
[code map](../index.md#code-map) resolves them.
**User-visible outcome:** Mirror Mind ships as a canonical Claude-format plugin (skills + lifecycle hooks) plus a Mirror MCP server, validated on Claude as the reference runtime. Claude users install Mirror as a versioned plugin instead of committing `.claude/` scaffolding into their repos.

---

## What This Is

E2 builds the keystone artifact of CV21: the **canonical package** every other
runtime consumes by import/install. [E1](../cv21-ds1-unified-plugin-mcp-spike/index.md)
proved — in an isolated scratch dir — that the package is real and chose the
strategy ([decision](../../../decisions.md#cv21-converges-on-a-canonical-plugin-plus-mcp-server-bridged-by-import)):
converge on a Claude-format plugin plus a Mirror MCP server, propagated per
runtime, with a thin-adapter + shared-MCP fallback.

E2 turns that decision into a production artifact and proves it on the
most-used runtime. Concretely:

1. Author the canonical Mirror plugin (`.claude-plugin/plugin.json` bundling the
   `mm-*` skills + the four lifecycle hooks).
2. Author the Mirror **MCP server** (`python -m memory mcp`) carrying the command
   surface and on-demand context (not automatic per-turn injection — E1 finding).
3. Wire the plugin `statusLine` to Mirror's existing status-line surface.
4. Prove the package on Claude with an **isolated smoke test** that mutates no
   production mirror, repo, or runtime config.

Claude is the reference runtime: the native home of the plugin format, so the
canonical package is built and validated where it is best understood. The
standalone `.claude/` path keeps working — the plugin is the recommended path,
not a forced migration (CV21 non-goal).

---

## State After CV22 (2026-10-13)

CV21 stopped here after US2, and CV22 changed the ground under this Delivery Story:

- **The MCP server is TypeScript.** CV22.DS9 ported US2's server, and CV22.DS10
  deleted the Python original. The manifest launches `mirror mcp` through
  `plugins/mirror-mind/mcp/launch.sh`.
- **The plugin no longer assumes a checkout.** Its hooks run the installed
  `mirror-hook` (CV22.DS10.US3). That resolves the finding in the inbound change
  below.
- **TS4 has partial evidence.** On 2026-10-09 a real Claude Code 2.1.283 session
  loaded the plugin from a scratch npm install and reached Mirror Mode through its
  SessionStart hook (CV22.DS10.US3, route 3). That is an older Claude Code than the
  one installed now, so [DS12](../cv21-ds12-runtime-re-baseline/index.md) TS1
  re-measures it.
- **US3 is untouched.** The plugin wires no status line today.

The scope and done condition below still name `pyproject.toml` and the Python
server. They are the June text. DS12's decision restates what remains.

---

## Scope

- A canonical Claude-format plugin directory with a validating
  `.claude-plugin/plugin.json` manifest (version synced to `pyproject.toml`).
- The Claude-tuned skill set bundled into the plugin, generated from
  `.claude/skills/` with a drift guard. S1b brought the four formerly Pi-only
  skills (`discard`, `explore`, `soul`, `update`) to Claude parity, so the plugin
  now carries all 25 skills.
- The four lifecycle hooks (`SessionStart`, `UserPromptSubmit` inject + log,
  `Stop` end+backup) carried by the plugin and portable to plugin-relative paths.
- The Mirror MCP server exposing the command surface + on-demand identity context.
- `statusLine` wired to `python -m memory welcome --status-line`.
- An isolated smoke test proving plugin load + skill discovery + hook firing +
  MCP reachability against a temporary database, with the production DB checksum
  unchanged.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV21.DS2.US1](cv21-ds2-us1-claude-plugin-conversion/index.md) | Claude plugin conversion | User Story | The 21 Claude-tuned skills + lifecycle hooks become a canonical Claude plugin (generated from `.claude/skills/`, drift-guarded) that passes `claude plugin validate`; isolated load smoke test | ✅ Done |
| [CV21.DS2.US1b](cv21-ds2-us1b-claude-skill-parity/index.md) | Claude skill parity | User Story | The four Pi-only skills (`discard`, `explore`, `soul`, `update`) are authored as Claude-tuned skills so the plugin reaches full 25-skill parity | ✅ Done |
| [CV21.DS2.US2](cv21-ds2-us2-mirror-mcp-server/index.md) | Mirror MCP server | User Story | `python -m memory mcp` serves the command surface + on-demand identity context over a zero-dependency stdio JSON-RPC server; declared as an `mcpServers` entry in the manifest; isolated stdio smoke | ✅ Done |
| CV21.DS2.TS4 | Reference-runtime smoke test | Technical Story (integration) | The full package (plugin, hooks, MCP) loads and runs in a real Claude Code session. Closed 2026-10-13 on CI's smoke and CV21.DS12.TS1's live session (2.1.296) | ✅ Done |
| [CV21.DS2.TS5](cv21-ds2-ts5-hook-commands-quote-the-plugin-root/index.md) | Hook commands quote the plugin root | Technical Story | The four hook commands quote `${CLAUDE_PLUGIN_ROOT}`, as Claude Code 2.1.296's validator asks (CV21.DS12.TS1, static 1), and the hook timeouts are the seconds the runtimes read them as | ✅ Done |
| [CV21.DS2.US6](cv21-ds2-us6-the-mcp-server-starts-wherever-the-plugin-is-installed/index.md) | The MCP server starts wherever the plugin is installed | User Story | The `mcpServers` entry starts on Codex and Grok from an entry that names no `${CLAUDE_PLUGIN_ROOT}` (CV21.DS12.TS2 L6); Grok's attachment is DS10's (TS4 L6) | ✅ Done |
| [CV21.DS2.US7](cv21-ds2-us7-mirror-mode-s-explicit-form-works-from-every-runtime-s-skill-syntax/index.md) | Mirror Mode's explicit form works from every runtime's skill syntax | User Story | The inject hook recognizes `/mm:mirror`, `/mirror-mind:mm-mirror`, `/mirror-mind:mm:mirror`, `$mirror-mind:mm:mirror`, `/mm-mirror`, and `$mm-mirror` (CV21.DS12.TS1 L4, TS2 L10, TS4 L5) | ✅ Done |
| [CV21.DS2.US8](cv21-ds2-us8-every-runtime-s-session-is-logged-under-its-own-name-replies-included/index.md) | Every runtime's session is logged under its own name, replies included | User Story | The shared hooks detect their runtime (`claude_code`, `codex`, `grok_build`), log a Mirror turn as its question, and log replies from Stop's `last_assistant_message` beside their prompts (CV21.DS12.TS2 L7, L8, L11; TS4 L7, L8) | ✅ Done |

**Reshaped by CV21.DS12 (2026-10-13), [decision](../../../decisions.md#cv21-converges-on-the-canonical-plugin-with-a-native-layer-for-antigravity-and-shared-hooks-that-know-their-runtime).**
DS2 becomes the canonical plugin made ready for every runtime that takes it as it is: Claude
Code, Codex, and Grok. TS5 and US6–US8 come from the re-baseline's findings.
**CV21.DS2.US3 (plugin status line) is dropped.** On Claude Code 2.1.296 a manifest
`statusLine` is an "Unknown field … ignored at load time", and a plugin-root
`settings.json` status line did not show in a live session (CV21.DS12.TS1, static 3 and L7).
The status line becomes a documented user step in DS11.

---

## Non-goals

- No per-runtime implementation (Codex E4–E5, Antigravity E7, Grok E10 consume
  this package; they are out of scope here).
- No forced migration of Claude users off standalone `.claude/`; both paths work.
- No automatic per-turn Mirror Mode injection *through MCP* — E1 proved MCP is
  pull-based; automatic injection stays in the runtime hooks.
- No marketplace publishing or public distribution channel (later epic / CV).
- No change to the Python `memory` core behavior beyond adding the `mcp`
  command surface.

---

## Done Condition

CV21.DS2 is done when:

- a canonical Claude-format plugin bundling the full `mm-*` skill set + lifecycle
  hooks passes `claude plugin validate`;
- the Mirror MCP server (`python -m memory mcp`) serves the command surface +
  on-demand context and validates as a portable `mcpServers` entry;
- the plugin `statusLine` renders Mirror's status line on Claude;
- an isolated smoke test proves the package loads and runs equivalently to the
  standalone `.claude/` integration, with the production DB checksum unchanged;
- the runtime interface contract and decisions log note the plugin as the
  recommended Claude packaging, with standalone `.claude/` retained.

---

## Inbound Change — CV22.DS9.TS2 (2026-09-18)

CV22 flipped the MCP server this epic authored to TypeScript. Recorded here
because the manifest is E2's artifact, and DS9's decision D2 asked for the change
to be visible from the owning epic rather than only from CV22's packages.

**What CV22 changed:** the `mcpServers.mirror-mind` entry in `build_manifest()`,
and nothing else. The command was `python3` with args `-m memory mcp`; it is now
`${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh`, a hand-authored plugin file beside
`hooks/`, which `exec`s the TypeScript server or — with `MIRROR_TS_MCP=0` — the
Python one. `claude plugin validate` accepts the variable in `mcpServers.command`.

**What CV22 did not change:** plugin structure, skill generation, hooks,
versioning, the drift guard's contract, or propagation to other runtimes. Those
remain E2's and the later runtime epics'. CV22.DS10 deletes the launcher and
repoints the entry at the npm bin, so the manifest deliberately carries no
repository path today.

**One finding for this epic.** S1's D5 records the plugin contract as "`memory`
is installed and importable, so `python3 -m memory` resolves without a repo cwd".
Measured on the author's machine on 2026-09-18, it is not: from `/tmp`, bare
`python3 -c "import memory"` fails with `ModuleNotFoundError`, so the hooks and
the pre-flip MCP entry do not run there. CV22 made this visible rather than
causing it, and its Python fallback branch restores exactly that status quo.
Fixing the contract (or documenting the install step it needs) belongs to CV21.

## Discovered Issues

Surfaced while planning S1:

- Standalone and plugin Claude skill directories now use Windows-safe `mm-*`
  filesystem names while preserving `name: "mm:*"` in each `SKILL.md`.
- `.claude/skills/mm-help` references a `mm:save` command that has no skill
  directory — a dangling reference in the standalone help skill.

## References

- [CV21 — Runtime Expansion II](../index.md)
- [CV21.DS1 Unified Plugin & MCP Spike](../cv21-ds1-unified-plugin-mcp-spike/index.md)
- [Convergence decision](../../../decisions.md#cv21-converges-on-a-canonical-plugin-plus-mcp-server-bridged-by-import)
- [Runtime Interface Contract](../../../../product/specs/runtime-interface/index.md)
- Claude Code plugins: <https://docs.claude.com/en/docs/claude-code/plugins>
