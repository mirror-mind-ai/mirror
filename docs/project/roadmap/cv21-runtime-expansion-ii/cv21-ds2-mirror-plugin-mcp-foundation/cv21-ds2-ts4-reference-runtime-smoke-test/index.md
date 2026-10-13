[< CV21.DS2 Mirror Plugin & MCP Foundation](../index.md)

# CV21.DS2.TS4 — Reference-runtime smoke test

**Status:** ✅ Done
**Type:** Technical Story
**Delivery Story:** CV21.DS2 — Mirror Plugin & MCP Foundation
**Renamed from:** CV21.E2.S4, in the CV21 Ariad taxonomy migration (2026-10-13).

---

## Technical Story

In order to know the canonical plugin works on its reference runtime before DS2 changes
it,
as the Driver of CV21,
I want end-to-end evidence that the plugin (hooks and MCP server included) loads and runs
on Claude Code as the standalone `.claude/` setup does,
so that DS2's remaining stories start from a proven baseline.

## Outcome

The reference-runtime smoke is closed on recorded evidence:
- CI's isolated smoke, all six sections;
- a fresh local run;
- CV21.DS12.TS1's live session on Claude Code 2.1.296.

What lies outside it is named.

## Acceptance Behavior

```text
Given the plugin as plugins/mirror-mind ships it in v0.32.1
When CI's smoke job runs scripts/smoke_claude_plugin.sh
Then all six sections pass, the production databases are byte-for-byte unchanged among them

Given the installed Claude Code 2.1.296 and a scratch configuration and Mirror home
When a real session loads the plugin (CV21.DS12.TS1)
Then its hooks fire, the Operating Instructions and per-turn context reach the model,
  Mirror Mode answers through the plugin, and the MCP server's 7 tools are available
And the real runtime configuration and Mirror databases are untouched

Given the generated plugin and the standalone .claude/ skills
When buildClaudePlugin.ts --check runs
Then they are in sync
```

## Scope

- Evidence from runs that already exist, plus one fresh local run of the smoke.

## Out Of Scope

- Code changes.
- CR123, the missing-bin case on a linked machine.
- Sibling stories TS5, US6, US7, and US8.

## Evidence

Recorded on 2026-10-13 at `515aad9a`. No code changed between CI's run below and this
commit, only docs.

| # | Claim | Run | Result |
|---|-------|-----|--------|
| 1 | The plugin manifest passes `claude plugin validate` | local, `bash scripts/smoke_claude_plugin.sh`, 2026-10-13 16:13 UTC, Claude Code 2.1.296 (`~/.local/bin/claude`); also CV21.DS12.TS1, static 1 | ✓ locally. CI skips it: "claude not found — skipping manifest validation" |
| 2 | The installed plugin's hooks fire and reach the configured Mirror home through `mirror-hook` | CI run [38304396661](https://github.com/mirror-mind-ai/mirror/actions/runs/38304396661) (`smoke` job, `d74b573d`, 2026-10-12), and the local run | ✓ both |
| 3 | The user-prompt hook logs `interface='claude_code'` | same two runs | ✓ both |
| 4 | The MCP launcher starts the server through the `mirror` bin | same two runs; `tools/list` answers 7 tools in CV21.DS12.TS1, static 7 | ✓ both |
| 5 | With `mirror-hook` gone, the turn is not failed, one `hooks.log` line lands, and `runtime diagnose` reports it | CI run 38304396661 | ✓ in CI. Locally ✗ on CR123's known case: the global `/opt/homebrew/bin/mirror-hook` is found by the wrapper's fallback |
| 6 | The production databases are unchanged | CI run 38304396661 | Vacuous in CI ("no production DB found — nothing to guard", 0 checked). Not reached locally, because the script stops at 5 |
| 7 | In a real session the hooks fire, the Operating Instructions and per-turn context reach the model, Mirror Mode answers through the plugin, and the 7 MCP tools are available | CV21.DS12.TS1 live, 2026-10-13 14:18–14:25 UTC, Claude Code 2.1.296, scratch config and Mirror home | ✓ (L1–L3, L6) |
| 8 | The real runtime configuration and Mirror databases are untouched by that session | CV21.DS12's `route.sh untouched`, 2026-10-13 15:06 UTC: the configs match their 315-entry baseline, and no real database holds a DS12 canary or probe prompt | ✓ content-level, not a byte checksum |
| 9 | The plugin's skills match the standalone `.claude/skills/` | `node ts/scripts/buildClaudePlugin.ts --check`, 2026-10-13 | ✓ "Claude plugin and Pi-sourced Claude skills are in sync." |

**Deviation from the Plan's wording.** The approved Plan says CI passes "all six
sections, the production databases byte-for-byte unchanged among them". CI skips
section 1 (claimed by the local run instead) and checks no production database in
section 6. No smoke run therefore proves the production databases byte-for-byte
unchanged. That claim rests on row 8, a content-level check of the real databases after
the live session. The Navigator decides at Validation whether that suffices.

## Validation

See [test-guide.md](test-guide.md).
