# Validation — CV22.DS7.US6

## Status

Passed

## Automated Checks

- TS suite 1502 green; 5 golden corpora byte-identical under Python 3.10/3.12/3.14; 11 real-DB-copy write probes overall_match true (incl. soul_state, soul_apply, soul_harvest_save); ritual lifecycle smoke 161 checks run with NO gate in its environment; oracle-drift tripwire clean; typecheck, biome, ruff clean

Checks status: passed

## E2E

Decision: required

Evidence: Live Pi session on the flipped default: front-door.log shows 'soul ts exit=0' at 21:24:26 with zero fell_back markers, the operating-mode row written by TS in Python's JSON dialect, and a clean shutdown backup through the front door. SCOPE LIMIT, explicitly accepted by the Navigator: the live session exercised Soul Mode ENTRY only - one soul invocation - so the fruit/harvest state machine and the listen/close renderers have not run in a live session. They are covered by the goldens, the write probes, and the both-engine smoke. The front-door log records command and engine only, never the subcommand, so the leaf identity is inferred from /mm-soul and the mode row rather than read from the log.

## Navigator Validation

Route: Ten paired comparisons through both engines on the real home (listen, rite, close, review, propose, prompt self/wisdom/beauty, and two refusal paths), the identity write applied to two copies of the live database and diffed, the MIRROR_TS_SOUL=0 revert, and a live Pi Soul Mode session after the flip

Navigator accepted: yes

Expected observation: Every paired surface byte-identical with matching exit codes; identity document and audit row identical across the two copies; revert reaching Python; 'soul ts' in the log with no fell_back

Pass condition: All ten comparisons identical, both copy diffs True, revert logs python, zero fell_back markers

Fail condition: Any surface difference, any write divergence between the copies, any fell_back marker, or a live embedding call outside the replay configuration

## Missing Evidence

- none
