# Review — CV22.DS10.US3

## Status

Reviewed

## Debt Findings

- Handoff review (2026-10-09): P1, a fresh install's first seed exited 1 on the empty ego/constraints template -- PAID at this review (62de848c: one language rule, the package smoke now expects a clean seed); P2, every page advertises npm install -g mirror-mind while the name is unpublished and free -- deferred; N1, the capture normalizer's \b masks are inert under BSD sed -- captured as CR122; N2/N3, the plugin smoke's missing-bin case and two hookBin tests cannot run on a machine with a global link -- captured as CR123; N4 (old release notes in the tarball name Python) and N5 (the Pi local-path package follows one Node prefix) accepted and documented; Q1 CR121, Q2 the Python-era updater's last hop (D12/F20), Q3 the Frame's three downloaders -- release-gate questions, recorded

## Debt Decision

defer

## Defer Reason

P2 is a registry action -- publishing the name -- that this story's non-goals keep for the release gate; the two debts are captured as CR122 and CR123 in RS010 with plans, and neither touches product behavior (an instrument's normalizer; a smoke's isolation)

## Revisit Trigger

the CV22 release gate's publish step (P2: publish promptly with --provenance and a granular token); CR122 before any capture is taken across a version bump; CR123 the next time a plateau's local verification is read against the standing note about the linked machine

## Missing Decision

- none
<!-- ariad-seal sha256:f1f75d7cb060fdfa40b0cd30be09ae82de1e97cc7f0a60b79bdb1cffba704aec — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
