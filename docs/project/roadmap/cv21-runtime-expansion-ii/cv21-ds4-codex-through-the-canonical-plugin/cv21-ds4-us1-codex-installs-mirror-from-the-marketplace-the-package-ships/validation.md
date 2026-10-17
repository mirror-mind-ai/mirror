# Validation — CV21.DS4.US1

## Status

Passed

## Automated Checks

- npm test 3223 pass 0 fail; typecheck, lint, checkPackContents (482 files), checkDocLinks, checkSkillCommandParity, checkRetiredSurfaces, buildClaudePlugin --check clean; smoke_npm_package 80/0 with step 10 (wrapper) unchanged

Checks status: passed

## E2E

Decision: required

Evidence: route.sh codex on the installed Codex 0.162.1 (/opt/homebrew/bin/codex), scratch HOME and CODEX_HOME, no model call: install from the shipped marketplace at a path outside HOME with a space, cache at 0.33.4, 25/25 skills with no skills link, MCP server listed, clean removal; route.sh workspace: a project's marketplace file is ignored, nothing installed or enabled

## Navigator Validation

Route: bash route.sh all from the story package: static (what init prints, scratch install), codex (install and removal on the real binary), workspace (unprompted project marketplace)

Navigator accepted: yes

Expected observation: Codex block of exactly two commands with the package path quoted and no old wiring named; plugin installed, listed, cached at the plugin's version; prompt skill count equal to the plugin's; mirror-mind in codex mcp list; removal leaves no cache files or config entry; project marketplace file installs and enables nothing

Pass condition: Every route check green: Navigator run 28 passed, 0 failed, 2026-10-17 12:36 UTC

Fail condition: Any old wiring named by init, marketplace add refused, skill count below the plugin's, no server, removal leaving cache or config entry, or a plugin installed or enabled from a project file with no user action

## Missing Evidence

- none
<!-- ariad-seal sha256:4555b51bf41fbd760dbb339399caf43e114683d5bab5fc98801f6d4002e99f84 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
