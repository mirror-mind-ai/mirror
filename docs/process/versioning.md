[< Process](../index.md)

# Versioning

Mirror Mind uses `vMAJOR.MINOR.PATCH` versions. From the adoption of CV9.E5 onward, version bumps follow the progress taxonomy in the [Development Guide](development-guide.md).

This rule is **prospective**. Versions through `v0.7.0` are historical project facts. They remain valid tags and references, but they are not semantically reinterpreted by this document.

---

## The Rule

| Component | Increment when | Taxonomy level |
|---|---|---|
| MAJOR | A Capability Value is completed and release-ready | Value |
| MINOR | An Epic is completed and released without closing a CV | Progress |
| PATCH | A Story, maintenance fix, or small correction is released independently | Progress or Work |

The number says what level of work collapsed into a release. It does not encode which CV, epic, or story produced it. That identity belongs in the release note.

---

## Prospective Adoption

Mirror Mind reached `v0.7.0` before this versioning model was adopted. Earlier versions were pragmatic: they marked useful project moments, runtime expansion, documentation fixes, and public-readiness steps, but they were not governed by this taxonomy.

Therefore:

- Do not rewrite historical tags.
- Do not claim old versions were wrong.
- Do not create retroactive release notes as part of adopting this rule.
- Use the worklog and Git history as the historical record for pre-adoption versions.
- Apply this rule to future releases after CV9.E5.

Retroactive release notes may be written later if they become useful, but they are optional archival work, not a prerequisite for this process.

---

## CV9 and `v1.0.0`

CV9 is named **Mirror Mind 1.0** and exists to prepare the framework for public release. Even though CV0 through CV8 were completed before this versioning rule existed, CV9 closing is the first prospective major boundary under this process.

When CV9's done condition is met and the repository is release-ready, it may be released as `v1.0.0`.

That decision is not retroactive reinterpretation. It is a forward-looking product boundary: the framework crosses from pre-1.0 development into a stable public release.

---

## Parallel Work Across CVs

The version number does not encode roadmap position.

Multiple CVs may be in progress at the same time. A CV with a higher index may close before a lower-index CV. In that case, the version bump follows the level of completed value, not the CV number.

Consequences:

- MAJOR counts completed public value boundaries. It is not the active CV index.
- MINOR counts released epics since the last major boundary.
- PATCH covers isolated stories or maintenance releases that do not close an epic.
- The roadmap answers "where are we?". Release notes answer "what did this version mean?".

---

## Maintenance Work

Not all work belongs in the roadmap. Some changes are legitimate maintenance: typo fixes, CI adjustments, dependency updates, documentation reconciliations, internal cleanup, or process refinements.

Maintenance work may produce:

- no release, when it changes only internal process/project state;
- a PATCH release, when it changes observable behavior, packaging, runtime reliability, or public documentation in a way users should receive.

Maintenance should not be inflated into a CV, epic, or story just to fit the roadmap. The [Development Guide](development-guide.md) defines Work as a first-class category.

---

## Release Channels

Mirror Mind separates integration from published releases:

- `main` is the integration and dogfooding channel.
- `stable` is the user-facing release channel.

A push to `main` is not a release. `stable` advances only through release promotion after the release arc is closed, validated, versioned, documented, tagged, and published as a GitHub Release. Local clones choose the channel through `.mirror-update-channel`; missing or invalid values default to `stable`.

Git tags and the `stable` branch are the updater contract. GitHub Releases are the public release surface. Every promoted stable release should have a GitHub Release attached to the same tag, marked latest when it is the newest stable release, and using the repository release note as its body.

## Release Notes Are Required for Future Releases

Every future version after this adoption point should have a narrative release note under `docs/releases/vMAJOR.MINOR.PATCH.md`.

The release note names the actual CV, epic, story, or maintenance arc behind the number. See [Release Notes](release-notes.md).

---

## Edge Cases

### Multiple epics released together

If two epics close in one release, MINOR may increment by two. This should be rare because it makes the release narrative harder to read. Prefer one coherent release per epic unless there is a good reason to bundle.

### Hotfix before a major release

If a PATCH release happens just before a CV closes, publish the patch normally. The later CV release resets MINOR and PATCH in the usual semver pattern.

Example: `v0.8.1` followed by CV9 completion becomes `v1.0.0`, not `v1.0.1`.

### Process-only changes

A change that only updates process docs may not need a version bump. It should still be recorded in the worklog and committed with a clear message. If the process change affects public contribution behavior, a PATCH release may be justified.
