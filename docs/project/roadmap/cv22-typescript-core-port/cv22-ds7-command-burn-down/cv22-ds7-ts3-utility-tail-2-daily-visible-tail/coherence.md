# Coherence — CV22.DS7.TS3

## Status

Coherent

## Process Alignment

Ariad lifecycle followed end to end: Plan approved before implementation; six resumable plateaus, one commit each with the handoff in the commit body per this journey's single-owner operating model; the plan-stage multi-persona panel's blocking inputs all honoured (read-only-by-test git module, recorded diagnose divergence, spawn spy on the status line, byte-compatible cache JSON, argv-only git invocation, no live provider). Stop conditions were respected rather than worked around: navigator_decision_needed was raised twice before writing code (the Python/Node version lines, then the manifest validator with its D1/D2 divergences) and scope_change_detected once, each answered by the Navigator before proceeding. Validation accepted by the Navigator on a live Pi session; Debt Review deferred with CR065 and CR066 captured file-first.

## Project Alignment

Authored state now matches the shipped state, after Coherence found three drifts and fixed them: the DS7 candidate row still said Planned, still listed latest/pending as subcommands, and was the only ops-tail row without a link to its package; docs/project/decisions.md still carried the same latest/pending error in the canonical 2026-09-07 decision entry the plan asked to correct; and the DS10 package inherited it while crediting the read half to TS1 instead of TS3. Burn-down ledger carries the pre-flip and flip entries, ops tail 2/6 to 3/6, and the corrected runtime branch-coverage table. Story package complete: index, plan, test-guide, validation, review. CI gate carries all five generators; oracle baseline registers cli/runtime.py, cli/welcome.py, extensions/migrations.py. mm-welcome and mm-release-notes invoke the front door. Everything committed and pushed; CI green on all five jobs.

## Product Alignment

welcome (card and per-turn status line) and runtime status|version|diagnose|release-notes answer from TypeScript by default, with MIRROR_TS_WELCOME=0 and MIRROR_TS_RUNTIME_READS=0 reverting independently. Behaviour is byte-identical to the oracle except the one intended change the story exists for: runtime diagnose no longer reports core_migration_unknown 017_journey_parent_column on installs that have run the TS engine, taking the exit code from 1 to 0 on the Navigator's real home. The per-turn status line no longer pays a Python start and spawns nothing at all, enforced by a PATH-shim spy. DS10's updater and release machinery stay on Python by explicit refusal, never by inheritance.

## Local Guide Differences

- none

## Missing Coherence

- none
