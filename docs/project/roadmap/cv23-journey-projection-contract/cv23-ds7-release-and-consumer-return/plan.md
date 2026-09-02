# Delivery Story Plan — CV23.DS7

**Journey:** mirror-mind-development
**Method:** ariad
**Navigator Flow Unit:** delivery_story
**Status:** Approved under explicit release authorization

## Delivery Story

Release and Consumer Return

## Objective

Package CV23 as `v0.31.10`, push `main`, require green central CI, promote and
publish the stable release, back up and update the installed runtime, run the
unchanged installed probe in isolation, and publish a complete payload-free
`mirror-return.json`.

## Child Work Packages

- CV23.DS7.US1

## Scope and Sequence

1. Prepare patch release `v0.31.10`, preserving `v1.0.0` for the established CV9
   public-readiness boundary and following the repository's post-`v0.31.9`
   patch sequence.
2. Synchronize Mirror, Frame, Claude plugin, and lockfile versions; write the
   canonical narrative release note naming contract
   `mirror.journey-projections@1.0` and Extension API `1.1`; update release,
   roadmap, and worklog indexes.
3. Re-run local release gates and `runtime release-doctor` before publishing.
4. Commit release preparation, push `main`, and wait for the Tests and Docs
   workflows for that exact commit to finish green.
5. Promote the exact commit to tag `v0.31.10` and `stable`, then publish a GitHub
   Release from the committed release note. Verify tag, stable, and GitHub
   Release all resolve to the same commit and their CI is green.
6. Inspect the configured installed runtime, create and verify a production
   backup before update, and record a bounded backup reference. This release has
   no schema migration, so record `migrationStatus: not_required`.
7. Update through the real stable-channel runtime installer/updater, then verify
   installed version and capability discovery from the installed checkout.
8. Run the unchanged consumer probe against that installed executable with a
   fresh isolated Mirror home. Persist only its synthetic JSON result artifact.
9. Recheck immutable acceptance hashes and self-tests. Create the consumer-owned
   `mirror-return.json` beside `RETURN-CONTRACT.md` with exact release, CI,
   backup, installation, probe, fixture, and no-deviation evidence; set `gate`
   to `open` only when every requirement is true.
10. Close DS7/CV23 after the external return exists, commit the post-release
    roadmap evidence, push `main`, and verify CI again. The release tag remains
    bound to the immutable release commit; the closure commit is bookkeeping
    after installed acceptance.

## Safety and Stop Rules

- Stop with the gate blocked on any failed local check, CI workflow, release
  doctor, tag/stable mismatch, backup verification, update, installed discovery,
  immutable hash, probe check, or normative deviation.
- Never run the probe against production data. `production-return` means the
  installed executable plus a new isolated home.
- Do not write secrets, environment dumps, production DB content, private Journey
  content, prompts, transcripts, or full local paths into `mirror-return.json`.
- Do not edit the acceptance kit except to create the explicitly required return
  record and result artifact.
- Do not recreate or move an existing mismatched tag. Do not force-push `main`,
  `stable`, or tags.

## Acceptance Behavior

- `origin/main`, `origin/stable`, tag `v0.31.10`, and GitHub Release identify the
  intended immutable release commit according to their documented roles.
- Central Tests and Docs workflows are green for the release commit.
- A verified backup predates the installed update; no migration is required.
- The installed runtime reports `0.31.10`, contract `1.0`, Extension API `1.1`,
  and all five operations.
- The unchanged installed probe exits `0`, reports `passed`, includes all eight
  checks, matches snapshot `op-probe-0001` and source revision
  `sha256:probe-operational-revision`, and uses no production data.
- `mirror-return.json` is complete, payload-free, has no known deviation, and
  opens the gate.

## Validation Route

Driver validates exact SHAs, GitHub Actions URLs/conclusions, GitHub Release
metadata, backup verification, installed checkout/version/capability, unchanged
hashes/16 self-tests, installed probe JSON, return schema completeness, and final
clean worktrees. Navigator has explicitly authorized push, release, installation,
and return publication for this story.

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
