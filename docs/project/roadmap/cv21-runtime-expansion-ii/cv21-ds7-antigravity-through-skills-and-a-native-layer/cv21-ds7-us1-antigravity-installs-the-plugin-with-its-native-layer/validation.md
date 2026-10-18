# Validation — CV21.DS7.US1

## Status

Passed

## Automated Checks

- node --test: 3286 pass 0 fail (6 new claudePlugin layer cases incl. the derivation test and the byte-identical negative control; wiring counts + the Antigravity block with no-succession and no-promise pins; packContents requires plugins/mirror-mind/hooks.json); npx biome check clean

Checks status: passed

## E2E

Decision: required

Evidence: Live against agy 1.4.2 (moved from DS12.TS3's 1.3.4) in a scratch HOME via the committed route.sh: the real plugin staged with 25 skills, our root hooks.json skeleton intact, mcp_config.json and rules/AGENTS.md beside it, mcpServers 1 processed, hooks 1 processed. The probe (evidence/, 5 files) settled the packaging shape: a root plugin.json marker makes agy treat the directory as a native plugin; without it install converts the Claude surfaces and overwrites the layer's hooks file. Gemini coexistence confirmed: agy writes only .gemini/config/; settings.json untouched

## Navigator Validation

Route: 1) route.sh stage: the staged tree listed with all layer files and 25 skills. 2) the wiring renders the one-step Antigravity block against the real install root. 3) git status over plugins/mirror-mind/: additions only; no Claude/Codex-read file changed

Navigator accepted: yes

Expected observation: agy plugin install stages skills plus the agy-native layer intact; mirror init prints at most two steps; the Claude and Codex surfaces are byte-identical with the layer present

Pass condition: all layer files staged unconverted, one install step, additions only in the plugin directory

Fail condition: a layer file missing or transformed, Claude's hooks staged over ours, more steps than Gemini CLI's two, or any Claude/Codex-read file changed

## Missing Evidence

- none
<!-- ariad-seal sha256:25fcf9885b4c4f8d3056f8d49a6e054aa39800fb52eea1aad51e61cee1b28a8b — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
