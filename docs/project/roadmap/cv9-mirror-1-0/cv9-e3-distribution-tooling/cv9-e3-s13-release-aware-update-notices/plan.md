[< CV9.E3.S13](index.md)

# Plan — CV9.E3.S13 Release-Aware Update Notices

## Current State

`runtime update --check`, `runtime update --dry-run`, and `runtime update` already distinguish update channels and can compare the local checkout with the configured channel ref. The visible language still centers on commit hashes and commit logs. That is right for `main`, but too low-level for `stable`.

Release notes already exist in `docs/releases/` and can be parsed by `read_release_note()`. The missing piece is reading the release note that belongs to the target update ref, not only the currently checked-out commit.

## Design

Add a small release-metadata layer inside `src/memory/cli/runtime.py`:

- keep the existing Markdown parser for release-note text;
- add a git-ref reader that can read `docs/releases/index.md` and the latest release note from a ref such as `origin/stable` without checking it out;
- compare parsed release versions against the installed package version, so equal or older notes are not advertised as an available release;
- attach optional release metadata to update availability, dry-run, and update result rendering.

Rendering rules:

- `stable` prefers release language: `Release available: vX.Y.Z — Title`, optional digest, then preview/update commands;
- `runtime update --check` remains honest: because it uses `git ls-remote` and does not fetch, it may know a remote commit is newer while release details are unavailable locally;
- `runtime update --dry-run` is no-network and can show release details only if the local upstream ref already contains them;
- successful `runtime update` shows `Installed release` after fast-forward if release notes are present in the new checkout;
- commit summaries remain as fallback and stay primary for `main` dogfooding.

## Scope Boundaries

Do not contact GitHub or parse remote files over the network. Do not change the safety pipeline, backup sequence, migration behavior, or fast-forward policy. Do not create or promote `v0.9.0` in this story.

## Test Approach

Unit tests should cover rendering and metadata lookup without real network access:

- release note parsing from a mocked git ref;
- stable dry-run with a newer target release;
- stable update check with update available but no fetched release detail;
- successful stable update rendering with an installed release block;
- main-channel rendering still using commit-oriented fallback.

Manual smoke should use temporary git repositories or mocked local refs where possible, avoiding the production database and production clone.

## Documentation Updates

Update:

- `REFERENCE.md`, to explain release-aware stable notices and the no-fetch/no-network boundary;
- this story's `test-guide.md` with validation commands;
- `docs/process/worklog.md` and the CV9.E3 index when the story closes.
