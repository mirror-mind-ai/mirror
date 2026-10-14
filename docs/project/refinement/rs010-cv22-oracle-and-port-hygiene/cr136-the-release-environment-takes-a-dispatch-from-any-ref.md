[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR136 — The `release` environment takes a dispatch from any ref, so a branch's own copy of `publish.yml` can stage

## Problem

`.github/workflows/publish.yml` runs on `workflow_dispatch` in the GitHub environment
`release`. That environment has one protection rule, a required reviewer, and no
deployment-branch policy, so a dispatch on any branch or tag can run in it.

Every dispatch runs the copy of `publish.yml` on the chosen ref
([the publish decision](../../decisions.md#the-npm-package-is-published-by-staging-from-ci-with-provenance-and-a-maintainer-approves-with-2fa)).
npm's trusted publisher matches the three facts the decision names: the repository,
the workflow file, and the environment. None of them is a ref. So someone with write
access can push a branch whose `publish.yml` drops the retired-surface tripwire and the
pack guard, and dispatch it. Once the reviewer approves the job, it stages whatever
that branch holds, with the identity npm trusts.

## Expected Behavior

GitHub refuses a dispatch from any ref the project has not named for releases or
rehearsals, before the reviewer is asked. Which refs to name is the decision to take
first. The candidates:

- release tags (`v*`), the ref `release:promote` prints for the dispatch;
- wherever rehearsals run. The 2026-10-10 rehearsal used a branch.

If the project keeps every ref open instead, the decision records why, and the
reviewer's step names the ref to check. The job's name already shows it:
`stage <ref> as <tag>`.

## Impact

Low today. A dispatch needs write access, the reviewer must approve the job, and
nothing becomes public without `npm stage approve` and 2FA. The provenance statement of
anything staged names the commit it was built from. The gap is that both human gates
are judgments, and the guards the release depends on live in the file a dispatch
chooses. A deployment policy would make the first gate partly mechanical.

## Plan Or Decision

Pending. Captured 2026-10-14 from
[CR125's panel review](cr125-the-publish-route-moves-stable-and-leaves-latest-on-the-placeholder.md#panel-review-2026-10-14),
from the security-engineer lens, at the Navigator's request. It is unassigned, and
Current Focus is unchanged.

The fix is a repository setting, not a file. Whoever applies it records the `gh api`
output from before and after the change here, and a dispatch from a ref outside the
policy, refused, as the evidence.

## Evidence

- 2026-10-14, `gh api repos/mirror-mind-ai/mirror/environments/release --jq '{name,
  protection_rules: [.protection_rules[] | {type}], deployment_branch_policy}'`:
  `{"deployment_branch_policy":null,"name":"release","protection_rules":[{"type":"required_reviewers"}]}`.
- `.github/workflows/publish.yml`: `on: workflow_dispatch`, `environment: release`, job
  name `stage ${{ github.ref_name }} as ${{ inputs.dist_tag }}`.
- The publish decision: "Every dispatch runs the file from the chosen ref."

## Outcome

Pending.
