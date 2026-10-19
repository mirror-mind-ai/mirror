# Validation — CV21.DS5.US2

## Status

Passed

## Automated Checks

- npm test 3365 tests, 3362 pass, 0 fail, 3 skipped (32 new, failing first); typecheck and lint clean; checkPackContents, checkDocLinks, buildClaudePlugin --check clean; smoke_npm_package 70/0; smoke_claude_plugin steps 1-2 pass, step 3 CR142 on this machine; route.sh static 5/0

Checks status: passed

## E2E

Decision: required

Evidence: route.sh on the installed claude 2.1.296, codex 0.163.0, agy 1.4.2, grok 1.0.62 from the shipped package in scratch homes, no model, no login: probe 4/0 (Grok refuses any plugin install without --trust; Codex caches per version), generate 15/0, wire 8/0 (the printed step run as printed, the runtime's reader lists the skill on all four), change 42/0 (added/changed/removed, each one generation; diagnose names every stale copy and no Claude finding; the printed reinstalls bring each copy level; after removal no runtime lists it), two-homes 4/0, diagnose 4/0 (dangling link, two Grok copies, a never-produced version), cost (136 bytes per extension in Codex's prompt), untouched 1965 entries by hash. Evidence table in evidence/table.tsv; summary in test-guide.md.

## Navigator Validation

Route: bash route.sh setup, probe, generate, wire, change, two-homes, diagnose, cost, static, clean, untouched; expected observations per step in test-guide.md

Navigator accepted: yes

Expected observation: The generated plugin is exactly the planned four files at 0.1.1, held on an unchanged install; each runtime lists the skill after its printed step; each transition advances the version by one with diagnose naming the stale copies and the reinstall bringing them level; two homes beside each other; the real configuration unchanged

Pass condition: Every route step green on the four installed runtimes; the tests first, then green; the records written; untouched by hash

Fail condition: A runtime not listing the skill after its printed step; a version advancing by other than one; a stale copy diagnose does not name; a write to the real configuration

## Missing Evidence

- none
<!-- ariad-seal sha256:35306426484bd7d5bfc6944d0874257ddd6a1913dd37c08f25c8a334aeee8e95 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
