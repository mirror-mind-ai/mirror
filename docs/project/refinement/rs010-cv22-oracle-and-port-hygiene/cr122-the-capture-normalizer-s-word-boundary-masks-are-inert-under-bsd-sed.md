[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR122 — The capture normalizer's word-boundary masks are inert under BSD `sed`

## Problem

`scripts/capture_family_outputs.sh` is the migration's one before/after instrument on a
real database: it hashes each command family's normalized output so two captures taken
weeks apart can be diffed. Its normalizer masks what legitimately varies between runs —
timestamps, relative ages, UUIDs, the version, the commit, the branch — with `sed -E`.
Four of those masks (`<TIME>`, `<AGO>`, `<UUID>`, `<VERSION>`) are written with `\b`,
which GNU `sed` honors and BSD `sed` (macOS) does not: on the machine every capture has
been taken on, the four patterns never match, and the version, bare times, relative ages,
and UUIDs reach the hash as written.

Found at CV22.DS10.US3 plateau 6 (2026-10-09), reading `--dump runtime-version` for the
route-4 replay: `Version: 0.31.14` was in the normalized stream where `<VERSION>` should
have been. The `--selftest` cannot see it — two runs seconds apart carry the same version,
time, and ids — which is the class of flaw the script's own header warns about.

## Expected Behavior

Every mask applies on every `sed` the script may run under. A capture taken before a
version bump and replayed after it differs in nothing but the families whose answers
changed; a family that prints the version, a bare `HH:MM`, a relative age, or a UUID
hashes the same on both sides.

## Impact

None so far: the plateau-0 capture (TS5 and US3 alike) and every replay were taken on
one machine at one version, so the inert masks masked nothing that differed. The day two
captures straddle a version bump — the CV22 release gate's own replay, if it takes one on
the production clone — every family printing the version diffs at once, and the
instrument reports a change where there is none. The `\b` form also hides that the four
masks are untested: a self-test under both seds would have caught it at TS5 plateau 0.

## Plan Or Decision

Captured, unassigned. The fix is small: write the four masks without `\b` — either the
BSD forms `[[:<:]]`/`[[:>:]]` chosen by `sed --version` probing, or a portable rewrite
that anchors on the characters around the token (`(^|[^0-9A-Za-z])` …
`([^0-9A-Za-z]|$)`) — and add to `--selftest` a fixture line carrying all four token
kinds that must normalize to the four placeholders. Prefer the portable rewrite: one
pattern, no probing. Re-take the baseline capture at the baseline commit afterwards, as the
script's header already requires whenever the normalizer changes.

## Evidence

```text
# tmp/us3 replay, 2026-10-09, macOS (BSD sed), --dump runtime-version:
Mirror runtime version

Version: 0.31.14          # should read <VERSION>
Install: clone (<REPO>)
…
```

`sed -E 's/\b[0-9]+\.[0-9]+\.[0-9]+\b/<VERSION>/g' <<< 'Version: 0.31.14'` prints the input
unchanged on macOS and `Version: <VERSION>` on Linux.

## Outcome

Pending.
