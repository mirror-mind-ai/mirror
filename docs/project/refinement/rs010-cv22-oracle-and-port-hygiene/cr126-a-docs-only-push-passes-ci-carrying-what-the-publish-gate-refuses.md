[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR126 — A docs-only push passes CI carrying what the publish gate refuses

## Problem

The retired-surface tripwire (`ts/scripts/checkRetiredSurfaces.ts`) runs in the Tests
workflow and in the publish workflow. The Tests workflow is path-filtered and does not
run for a push that touches only documentation; the Docs workflow runs for those pushes
and does not run the tripwire. So a documentation commit that names a retired surface
outside the history prefixes is green on CI and refused at publication.

On 2026-10-11 the `v0.32.0` tag was created on such a commit: a sentence added to
`docs/getting-started.md` after the upgrade rehearsal named the retired interpreter
invocation literally. The Docs workflow passed, the tag was created, and the publish
workflow's tripwire refused it. The release shipped as `v0.32.1`.

## Expected Behavior

A push that CI reports green can be tagged and published. Whichever workflow runs for a
docs-only push runs the retired-surface tripwire, or the Tests workflow's path filter
includes the documentation paths the tripwire reads.

## Impact

One tag wasted and one patch version spent; nothing public affected. The same gap
reopens with every docs-only commit that lands between the last green Tests run and a
tag, which is the usual shape of a release's final commits.

## Plan Or Decision

Pending. Add the tripwire step to the Docs workflow, since it reads files and needs no
build; keep it in Tests and publish as they are. One step, one workflow file. Captured
without selecting; Current Focus unchanged.

## Evidence

- Publish run 38170650729 on `v0.32.0` (`78dd5836`): `retired-surface check: RESIDUE
  FOUND — python-core-mentions: docs/getting-started.md:385 mentions \`uv run python\``.
- Docs run 38167802370 on the same commit: success. No Tests run for that commit.
- `.github/workflows/docs.yml`, `.github/workflows/tests.yml` (`paths:`),
  `.github/workflows/publish.yml` (`Retired-surface tripwire`).
- [v0.32.1 release note](../../../releases/v0.32.1.md).

## Outcome

Pending.
