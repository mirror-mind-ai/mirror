# Validation — CV9.DS8.TS2

## Status

Passed

## Automated Checks

- npm run typecheck; npm run lint (one pre-existing warning); git diff --check; npm test (3488 tests, 3485 pass, 3 pre-existing skips, 0 fail), also with no mirror on the PATH; checkRetiredSurfaces, checkPackContents, checkDocLinks, checkSkillCommandParity, buildClaudePlugin --check; migrate_on_open, conversation_lifecycle, builder_lifecycle smokes; smoke_claude_plugin steps 1-5 (step 6 fails on this machine before and after: the npm-linked /opt/homebrew/bin/mirror-hook answers the removal probe)

Checks status: passed

## E2E

Decision: not_required

Evidence: Fixture- and command-level in TS2 by plan; the live runtime walks belong to US4 (Claude Code, Codex), US5 (Pi), TS6 (Antigravity). The command route ran live on a copy of vinicius-dev's database (reception + one embedding per delta turn).

## Navigator Validation

Route: test-guide.md Navigator Validation, five steps on a scratch MIRROR_HOME copy of vinicius-dev: (1) quiet turn, (2) explicit form, (3) another domain, (4) same domain, (5) CLAUDE_CODE_SESSION_ID-named load then doorman. Walked by the Navigator 2026-10-24 22:47-22:53 against the checkout's bin.

Navigator accepted: yes

Expected observation: (1) empty stdout, no S row, no backups/ dir; (2) line 'full ... sign ◇ therapist', transition surface, full folder, S=1|1|therapist|mirror; (3) line 'delta (persona: cfo · journey: mirror) ... sign ◇ cfo', persona/cfo, five memories, no identity layer, S.persona=cfo, llm_calls +1 (embedding, session S), memory_access_log +0, front-door.log doorman memory_scores=0.421,0.393,0.392,0.385,0.381; (4) line names cfo, no persona section, persona unchanged; (5) row C=1|therapist|mirror, doorman named by the environment alone delivers a writer delta

Pass condition: Every step's observed output and rows match the expected observation

Fail condition: Any printed block or row on the quiet turn; a missing delivered line; an identity layer in a delta; two ledger rows or any memory_access_log growth per delta; persona unchanged on a domain change or changed on the same domain; no C row

## Missing Evidence

- none
<!-- ariad-seal sha256:0425a59e40757067617b31dcca08ac817a94c68afa9a0f3e124ae00d850d606d — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
