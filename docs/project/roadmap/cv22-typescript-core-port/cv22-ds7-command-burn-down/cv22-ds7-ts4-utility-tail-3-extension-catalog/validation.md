# Validation — CV22.DS7.TS4

## Status

Passed

## Automated Checks

- TS suite 2,255 pass; tsc clean; biome clean (one pre-existing warning); Python extension + CLI suites green; ruff clean; four new goldens regenerate identically under BOTH CI interpreters; ext_bindings and extension_install write probes green on a real-DB copy; both-engine catalog smoke (12 steps, no gate) green; oracle drift clean with four new modules; skill parity clean; 50 mutants killed across the story

Checks status: passed

## E2E

Decision: required

Evidence: ext <id> <subcommand> is decided by code Mirror does not own, so it was run against REAL extensions: all seven installed extensions load and list through the TS dispatcher and the compat host with byte-identical output on a copy of the Navigator's home, and ext session-export folder list ran on the untouched real home with identical output and exit code

## Navigator Validation

Route: On the real home: (1) extensions list, ext list, list all, inspect llm-calls --summary diffed between engines; (3) ext session-export folder list diffed, plus the front-door.log line; (5) identity edit ego behavior with the Navigator's own EDITOR on a copy then the real home. Steps 2, 6, 7 on copies of the same home via ts/parity/ts4_home_copy_route.ts; step 4 is the CI smoke

Navigator accepted: yes

Expected observation: Byte-identical stdout and exit codes on the read diff and the dispatch; front-door.log carrying 'ext ts exit=0 leaf=session-export' with no argument text; identity edit saving an edit, writing nothing when the buffer is unchanged, and refusing empty content

Pass condition: Identical bytes and exit codes; no extension argument in the log; the editor seam saves, skips, and refuses without losing content

Fail condition: Any byte difference, any argument text in front-door.log, or identity content lost by the editor seam

## Missing Evidence

- none
