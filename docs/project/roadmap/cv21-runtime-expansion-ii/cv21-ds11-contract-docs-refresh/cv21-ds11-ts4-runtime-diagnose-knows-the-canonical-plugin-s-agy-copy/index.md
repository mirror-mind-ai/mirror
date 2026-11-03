[< Parent](../index.md)

# CV21.DS11.TS4 — `runtime diagnose` knows the canonical plugin's agy copy

**Status:** ✅ Done
**Type:** Technical Story
**Delivery Story:** CV21.DS11 — Contract & Docs Refresh

---

## Technical Story

In order to pay the debt DS5.US2's Debt Review deferred to DS11,
As the engineering team,
I want `runtime diagnose` and the post-update hint to report an Antigravity copy of the
canonical plugin that is behind the installed package, with the command that brings it
level, built by the same function as the line `mirror init` prints,
So that an agy user whose copy an npm update left behind is told so, as Codex and Grok
users already are.

## Outcome

agy stages its own copy of the plugin, and an npm update leaves it where it was.
Measured in DS11's scratch `HOME` on agy 1.4.7 (`~/.local/bin/agy`), 2026-10-24:
`agy plugin install` of the v0.36.2 plugin staged
`.gemini/config/plugins/mirror-mind/`, whose `.claude-plugin/plugin.json` read 0.36.2 —
the file `agyPluginCopyState` had been proven on only for the extensions plugin.
`mirror runtime diagnose` from this tree (0.36.3) then reported
`agy_plugin_copy_behind` (copied 0.36.2 < installed 0.36.3) with
`agy plugin install "<pkg>/plugins/mirror-mind"`; running that command replaced the
copy with 0.36.3, and diagnose reported nothing for agy.

- `pluginWiringFindings` (`ts/src/runtime/diagnose.ts`) gains the agy branch in
  Codex's shape: behind is a warning; current, ahead, a copy with no manifest, no
  copy, no `HOME`, and no install root are silence. `.gemini` is read from `HOME`, as
  the extensions plugin's reader reads it; no variable was added.
- `postUpdateHints` (`ts/src/runtime/update.ts`) gains the matching line.
- `agyPluginInstallCommand(root)` (`ts/src/runtime/wiring.ts`) is the one spelling:
  `init`'s Antigravity step, the finding, and the hint all call it.
- REFERENCE's `runtime diagnose` and `runtime update` paragraphs and the contract's
  Antigravity wiring row name the finding and the command. DS5's index row for US2
  records the debt paid here.

## Acceptance Behavior

```text
Given a home whose agy staged the canonical plugin at an older version than the install
When the user runs mirror runtime diagnose, or an update lands
Then agy_plugin_copy_behind names the copy, both versions, and the install command
     with the install's own path, and the post-update hint names the same command
And after that command runs, diagnose reports nothing for agy
And a current, ahead, or absent copy reports nothing
```

## Scope

- The finding, the hint, and the shared install command, test-first.
- REFERENCE, the contract's wiring row, and DS5's US2 row.

## Out Of Scope

- A duplicated or dangling agy copy: agy stages by plugin name, one copy, and no such
  failure has been measured.
- Any change to the extensions plugin's agy finding (`ext_plugin_agy_copy_stale`).

## Validation

Tests written first and seen failing: `ts/test/runtime/pluginWiring.test.ts` (the
finding, its silences, the extensions plugin's copy kept apart, the one command) and
`ts/test/runtime/update.test.ts` (the hint). They sit beside the Codex and Grok
plugin findings' tests, in `pluginWiring.test.ts`, where `pluginWiringFindings` is
tested; `diagnose.test.ts` holds none of them. The live route is DS11's
`route.sh agy` (test guide, step 4).
