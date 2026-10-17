# Validation — CV21.DS4.TS6

## Status

Passed

## Automated Checks

- node --test: 3279 pass 0 fail (19 new pluginWiring cases incl. the semver trap, ahead-is-silence, strict-injection leak test, one-command-string assertion; 3 new postUpdateHints cases incl. the landed-version trap); frozen runtime-diagnose goldens byte-identical; npx biome check clean

Checks status: passed

## E2E

Decision: required

Evidence: Live against Codex 0.163.0 in a scratch CODEX_HOME: plugin added at 0.33.3; scratch package bumped to 0.33.5; re-add replaced the cache with 0.33.5 with no remove needed; same-version re-add idempotent; nothing leaked into the real ~/.codex (only pre-existing [projects] trust entries name mirror-mind). The message's wording is measured-truthful; the re-add-does-not-refresh stop condition did not trigger

## Navigator Validation

Route: 1) scratch CODEX_HOME with 0.1.0 cache: diagnose reported codex_plugin_cache_behind naming 0.1.0, 0.33.4, and codex plugin add mirror-mind@mirror-mind. 2) the live bump-and-re-add E2E above. 3) this machine (no Codex cache, real healthy Claude link): zero plugin-wiring findings - absence and health are silence

Navigator accepted: yes

Expected observation: a stale cache yields a warning naming both versions and the measured command; a successful update over a stale cache prints the same command; absence, health, current, and ahead stay silent; the goldens do not move

Pass condition: finding and hint fire only on behind, with the exact command that works on Codex 0.163.0; silence everywhere else; suite green

Fail condition: a finding or hint on absence/health/current/ahead; a command the installed Codex refuses; a moved golden; a reader consulting the process environment

## Missing Evidence

- none
<!-- ariad-seal sha256:404070c5b7ebc90d5331b1f178905aee2a4628930006d23288fc01504296fb24 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
