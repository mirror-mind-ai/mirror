# Validation — CV21.DS5.TS4

## Status

Passed

## Automated Checks

- npm test: 3417 tests, 3414 pass, 0 fail, 3 skipped
- bash route.sh static (US3 package): 14 passed, 0 failed; the guard shown failing on an edited listing and on a listing without its path comment
- checkDocLinks, checkRetiredSurfaces (story files staged), checkSkillCommandParity, buildClaudePlugin --check, checkPackContents (497 files), git diff --check: all clean
- mirror extensions install review-copy into a scratch home: every printed wiring command verbatim in the contract's table and the authoring guide's step 7

Checks status: passed

## E2E

Decision: not_required

Evidence: Docs and a static check only. The live behaviour is US3's (2026-10-20: claude 2.1.304, codex 0.163.0, agy 1.4.3, grok 1.0.62, mirror-mind@0.36.0 from the registry), cited by version, binary, and date; not_required accepted by the Navigator at Plan approval, 2026-10-21

## Navigator Validation

Route: The six-step route in test-guide.md, run by the Navigator 2026-10-22: (1) the contract's table against the printed report, US3's Steps 3-4, and TS1's costs; (2) the contract's Claude Code section and login facts; (3) the extension docs, the authoring guide's diff, route.sh static; (4) review-copy's SKILL.md, its REFERENCE row, the ext:review-copy sweep; (5) Getting Started, REFERENCE's extensions and ext rows, README; (6) the CV21 pointer and the DS5 row

Navigator accepted: yes

Expected observation: Each surface carries the grid's value for each runtime and fact: the contract's table with the printed wiring and reinstall steps and US3's spellings, versions, binaries, and date; every other surface its part, linking the table; the guide's listings untouched; static 14 passed

Pass condition: Every grid cell found with its value, and the three single checks hold

Fail condition: A cell whose surface carries a different value, a value no source recorded, a changed listing, or a red check

## Missing Evidence

- none
<!-- ariad-seal sha256:df98d84baef760348d994cf8095ec0c7c357ff2b6ca6baf179d60451aa1a9cc4 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
