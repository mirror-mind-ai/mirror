[< CV21.DS12 Runtime Re-Baseline](../index.md)

# CV21.DS12.TS5 — Extension surface re-grounding

**Status:** 🟢 In Progress — measured, awaiting TS6's decision
**Type:** Technical Story (spike)
**Delivery Story:** CV21.DS12 — Runtime Re-Baseline

---

## Technical Story

In order to keep CV21's promise that user-owned extensions work on every runtime,
as the Driver of CV21,
I want the extension surface measured against the TypeScript extension contract and the
npm package,
so that the extension work in DS5, DS7, and DS10 starts from how an extension actually
reaches each runtime today.

## Outcome

For the reference extension `review-copy`, it is known which runtimes it reaches today,
by what path, and what gap remains. The June assessment in the CV21 index is superseded
by this one.

## Acceptance Behavior

```text
Given review-copy installed into a scratch Mirror home from the npm-era package
When each runtime's skill discovery is asked, without a model call
Then the findings state, per runtime, whether the extension is reached and by which path
And the gap is stated as a choice for TS6
```

## Scope

- `mirror extensions install`, catalogs, and `expose-claude`, in the scratch home.
- Skill discovery by Grok (`grok inspect --json`) and Codex (`codex debug prompt-input`),
  plus agy's documented roots.

## Out Of Scope

- Adding runtime blocks, consumers, or exposure commands. That is DS5, DS7, and DS10.

## Evidence

Measured 2026-10-13 (10:24–10:28 UTC) with `bash route.sh extensions` on the scratch
install of v0.32.1: codex 0.162.1 (`/opt/homebrew/bin/codex`) and grok 1.0.52
(`~/.grok/bin/grok`). agy 1.3.4's roots come from its embedded guide, in
`evidence/agy-strings.txt`.

## The Contract Today

- An extension declares a `runtimes:` map in `skill.yaml`. `review-copy` declares
  `claude` (`ext:review-copy`) and `pi` (`ext-review-copy`).
- `mirror extensions install` copies the extension into the Mirror home. For each
  declared runtime it writes `runtime/skills/<runtime>/<command>/SKILL.md` and an
  `extensions.json` catalog.
- Only two runtimes have a consumer. For Claude Code, `mirror extensions expose-claude
  --target-root <dir>` writes `<dir>/.claude/skills/<command>/`. For Pi, the
  `mirror-logger` extension reads the `pi` catalog.

## Findings

| # | Finding | How it was measured | Result |
|---|---------|---------------------|--------|
| 1 | Install writes catalogs only for the runtimes a manifest declares: `claude` and `pi` for `review-copy` | `mirror extensions install review-copy` | ✓ claude, pi. None for codex, antigravity, grok |
| 2 | `expose-claude --target-root ~` makes the extension a personal Claude Code skill (`~/.claude/skills/ext-review-copy/`) | `mirror extensions expose-claude` | ✓ written |
| 3 | **Grok finds it there.** Grok's Claude compatibility scans `~/.claude/skills/` | `grok inspect --json` | ✓ Grok gets user extensions through the Claude path, with no Grok step |
| 4 | **`~/.agents/skills/` is read by both Codex and Grok** at user level | the same skill copied there; `codex debug prompt-input`, `grok inspect --json` | ✓ Codex, ✓ Grok |
| 5 | agy's global skill root is `~/.gemini/config/skills/`. `.agents/skills/` is its workspace root | agy's embedded guide (migration table, lines 42861–42864) | Neither `~/.claude/skills/` nor `~/.agents/skills/` reaches agy at user level |
| 6 | **DS1's plan to bundle extensions into the canonical plugin's `skills/` no longer fits.** The plugin ships inside the npm package, shared and built once, while extensions belong to each Mirror home | the package layout (`plugins/mirror-mind` in `package.json` `files`) | User extensions need per-home exposure, not the shared plugin |

## The Gap, As A Choice For TS6

Reached today: Claude Code (`expose-claude`), Pi (catalog), Grok (through the Claude
path). Not reached: Codex, Antigravity. Candidate shapes, not decided here:

- **(a) Two exposure targets.**
  - `~/.agents/skills/` reaches Codex and Grok, as measured.
  - `~/.gemini/config/skills/` reaches agy, as documented.

  Each needs a runtime block in `skill.yaml`, or a decision that one `agents` block
  serves all of them.
- **(b) A per-home generated plugin.** Each Mirror home would generate a small
  Claude-format "extensions" plugin. Every runtime that takes the canonical plugin
  (Claude Code, Codex, Grok, and agy for skills) installs it the same way. This is
  convergence again, one level down.
- **(c) MCP prompts.** `prompt-skill` extensions would be served as MCP prompts by `mirror
  mcp`. They are pull-based, and agy does not take the plugin's MCP server today (TS3).

## Validation

`bash route.sh extensions` re-runs the measurement.
