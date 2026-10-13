# Review — CV21.DS2.TS4

## Status

Reviewed

## Debt Findings

- The runtime smokes' production-database guard checks zero databases in CI (runners have no Mirror home), and on a machine with a global mirror-hook the plugin smoke stops at CR123's case before reaching it; the isolation it asserts is proven nowhere for the plugin smoke. Captured as CR128 (RS010).

## Debt Decision

defer

## Defer Reason

Navigator decision (2026-10-13): the product is not at risk (smokes run in scratch homes by design) and TS4's claim rests on DS12's content-level check; the fix belongs with CR123's override, outside DS2's runtime stories.

## Revisit Trigger

When CR123 or CR128 is planned, or before any story next cites the smokes' production guard as evidence.

## Missing Decision

- none
<!-- ariad-seal sha256:692d6766846eebb38a9c6d202566c0ccee5ba2ca0fe59f89ed90664a9b1bb946 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
