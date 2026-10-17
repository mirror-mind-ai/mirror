# Validation — CV21.DS4.TS5

## Status

Passed

## Automated Checks

- npm test: 3257 pass 0 fail (incl. the new codex-wrapper retired-surfaces row); biome check clean; generate_hook_wrappers.sh --check in sync; packContents 'this repository packs clean'; smoke_npm_package.sh 78 pass 0 fail; smoke_gemini_cli and smoke_mirror_mcp pass; smoke_claude_plugin fails identically on the unmodified baseline (pre-existing, split to its own item)

Checks status: passed

## E2E

Decision: required

Evidence: scripts/smoke_npm_package.sh: packed this tree, installed from nothing into a scratch prefix, exercised mirror/mirror-hook/plugin/MCP; 78 pass 0 fail; no codex wiring file in the 494-entry tarball

## Navigator Validation

Route: 1) residue sweep: filtered git grep returned only the exempted getting-started guidance, the guard's own seeds, its self-test, and wiring.test's negative assertion; unfiltered pass read with eyes, all else history. 2) npm pack --dry-run: 494 entries, zero codex wiring files. 3) getting-started and the runtime interface contract read Codex as marketplace add + plugin add, no wrapper step

Navigator accepted: yes

Expected observation: no live surface names codex-mirror.sh, codex-hooks, codex:session-*, or backfill-codex-session; the tarball ships no codex wiring; the docs name the marketplace install and nothing else

Pass condition: zero live matches, zero wiring files in the tarball, two-step install in the docs

Fail condition: any live match in code, guards' active paths, CI, or user-facing docs; a wiring file in the tarball; a wrapper step surviving in a doc

## Missing Evidence

- none
<!-- ariad-seal sha256:71a9bb9fbfe8812da9468fedb15098c1a67f2776246b61e1a76cbf68bd8a4eaf — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
