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

Deferred. Captured 2026-10-14 from
[CR125's panel review](cr125-the-publish-route-moves-stable-and-leaves-latest-on-the-placeholder.md#panel-review-2026-10-14),
from the security-engineer lens, at the Navigator's request. It is unassigned, and
Current Focus is unchanged.

The fix is a repository setting, not a file. Whoever applies it records the `gh api`
output from before and after the change here, and a dispatch from a ref outside the
policy, refused, as the evidence.

Deferred 2026-10-16 by the Navigator: other priorities come first. No ref policy was
chosen and no revisit trigger was named, so the status stays `captured` rather than
`parked`. Current Focus is unchanged. The re-check under Evidence widens the fix: a
policy on the environment alone does not stop someone who can write to the repository.

## Evidence

- 2026-10-14, `gh api repos/mirror-mind-ai/mirror/environments/release --jq '{name,
  protection_rules: [.protection_rules[] | {type}], deployment_branch_policy}'`:
  `{"deployment_branch_policy":null,"name":"release","protection_rules":[{"type":"required_reviewers"}]}`.
- `.github/workflows/publish.yml`: `on: workflow_dispatch`, `environment: release`, job
  name `stage ${{ github.ref_name }} as ${{ inputs.dist_tag }}`.
- The publish decision: "Every dispatch runs the file from the chosen ref."

Re-checked 2026-10-16 at the Navigator's request. Nothing has changed since capture.
The re-check also recorded what the capture did not:

- The query above returns the same output. The environment's `updated_at` is
  `2026-10-10T12:18:56Z`, and
  `gh api .../environments/release/deployment-branch-policies` returns 404.
  `publish.yml`'s trigger, environment, and job name are unchanged.
- `gh api repos/mirror-mind-ai/mirror/environments/release`: `can_admins_bypass: true`.
  The one rule, `required_reviewers`, names one reviewer, `viniciusteles`, with
  `prevent_self_review: false`, so the reviewer can approve their own dispatch. No
  wait timer.
- `gh api repos/mirror-mind-ai/mirror/collaborators`: two, `viniciusteles` and
  `alissonvale`, both `admin`. `.../teams`: none. Everyone who can dispatch is an
  admin, and GitHub lets an admin bypass the environment's protection rules, so the
  reviewer is not a hard gate. That qualifies Impact's "the reviewer must approve the
  job". Whether the bypass also covers a deployment-branch policy is untested.
- `gh api repos/mirror-mind-ai/mirror/rulesets`: `[]`. `.../branches/main/protection`:
  404, `Branch not protected`. Either admin can push a `v*` tag to any commit,
  including one whose `publish.yml` drops the guards, and can push to `main`. A `v*`
  policy alone would stop a dispatch from the wrong ref by accident, not on purpose. A
  gate that holds against a writer would also need a ruleset limiting who can create
  or move `v*` tags, and `can_admins_bypass: false`.

## Outcome

Pending.
