# Review — CV22.DS7.TS3

## Status

Reviewed

## Debt Findings

- D-1 Ambient environment leaks into parity artifacts (four instances across three stories; the fourth escaped to CI) — captured as CR065 under RS010. D-2 _front_door_error_findings raises an uncaught TypeError on a naive timestamp, crashing a read-only diagnostic; unreachable with the current writer, and the TS port deliberately does not reproduce it — captured as CR066 under RS010. D-3 YAML-parser divergences D1/D2 (PyYAML error text inside the manifest health note; YAML 1.1 vs 1.2 scalar resolution) — bounded, recorded in the golden and the module header, reachable only through a broken manifest, and self-closing when Python retires in DS10: no action. D-4 Model-pin probe is inconclusive until DS8 — by design in the approved Plan and already a recorded DS8 input: no action. Also rediscovered, already captured: CR058 (the runtime-diagnose web test's wall-clock budget) explains the one local Python test failure carried through this story.

## Debt Decision

defer

## Defer Reason

CR065 and CR066 are hygiene work on the harness and on the Python oracle, not parity work for this story. RS010 exists precisely so findings like these are not fixed inside a parity story: a story graded by byte-equality cannot change either core silently without breaking its own evidence, and the moving-target rule requires the authority to change first with the port following. Both are captured, unassigned, and ordered in the canonical file-first index.

## Revisit Trigger

CR065: the next parity generator or probe added to ts/parity/, or any further ambient-environment leak found in a corpus. CR066: any change to the front-door log format or its writer, or a second consumer of front-door.log.

## Missing Decision

- none
