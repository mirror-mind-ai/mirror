[< Parent](../index.md)

# CV20.DS7.US1 — Define Delivery Story Release Intent

**Status:** 🟡 Planned
**Type:** User Story

---

## Outcome

Builder can optionally record release intent at the Delivery Story level, so the Navigator and Driver know whether the DS is expected to create a release boundary before child stories are implemented.

Release intent does not authorize commit, push, tag creation, stable promotion, or release publication.

## Story Statement

As a Navigator,
I want to optionally define release intent for a Delivery Story,
So that Builder can track whether the DS is expected to produce a release boundary without confusing intent with authorization.

## Acceptance Behavior

```text
Given a Delivery Story has been pulled or expanded
When the Navigator defines release intent
Then Builder records the intent at the Delivery Story level
And the intent is visible in the story context
And no push or release action is authorized by that intent
```

```text
Given a Delivery Story has no planned release intent
When the Navigator marks release intent as none or undecided
Then Builder records that state explicitly
And future release progress/collapse surfaces can distinguish planned, none, and undecided intent
```

```text
Given release intent has been recorded
When Builder displays the active Delivery Story context
Then Builder shows that release intent is informational/planning state
And still requires separate authorization for commit, push, and release actions
```

## Scope

- Define the minimal release intent states for a Delivery Story, such as planned, none, and undecided.
- Add a narrow runtime or documentation surface for recording/revealing release intent at DS level.
- Keep release intent attached to the Delivery Story or parent delivery boundary, not to a single User Story.
- State explicitly that release intent is not release authorization.
- Prepare data/wording that later DS6 stories can use for progress and collapse surfaces.

## Out Of Scope

- Showing a release progress bar after each child story Done; this belongs to CV20.DS7.US2.
- Deciding prepare/defer/no-release at DS collapse; this belongs to CV20.DS7.US3.
- Resolving generic commit/push/release policies; this belongs to CV20.DS7.TS1.
- Implementing push checkpoint/autopush behavior; this belongs to CV20.DS7.US4.
- Implementing release publication, tags, stable promotion, or release automation.
- Implementing DS8 method preference overrides or `.ariad/config.yml`.

## Validation

- Automated validation covers any changed runtime or CLI behavior.
- Documentation/process validation confirms DS-level release intent is separate from release authorization.
- Navigator-visible validation demonstrates that release intent can be defined, omitted, or left undecided without allowing push or release actions.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
