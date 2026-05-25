[< CV9.E3.S13](index.md)

# Ariad Visual Progress Experiment

This note records visual devices used during the story so Maestro can later learn from a real Driver/Navigator session.

## Legend

Stage colors are textual for now:

- 🟦 Plan, discovery and design collapse
- 🟨 Implement, code and tests in motion
- 🟪 Validate, automated and manual evidence
- 🟩 Close, docs, coherence, commit
- 🟥 Blocked, needs Navigator decision or repair

Card states:

- ⬜ Not started
- 🟨 In progress
- ✅ Done
- ⛔ Blocked

Progress bars use eight cells: `████░░░░`.

## Current Ariad Stage

```text
🟩 CLOSE
Plan ✅  | Implement ✅ | Validate ✅ | Review ✅ | Coherence ✅ | Commit 🟨
Progress: ███████░ 88%
```

## Story Board

| Card | State | Notes |
|------|-------|-------|
| Frame S13 story and plan | ✅ | Story folder, plan, and test guide created before implementation. |
| Add release metadata model | ✅ | Runtime carries optional release metadata through availability, dry-run, and update result. |
| Read release notes from git refs | ✅ | Added no-checkout `git ls-tree` plus `git show` reader for local refs such as `origin/stable`. |
| Render stable release-aware notices | ✅ | Stable dry-run and update result prefer release language; check stays conservative. |
| Add focused tests | ✅ | Added tests for ref parsing, stable rendering, dry-run metadata, and installed release output. |
| Update public docs | ✅ | REFERENCE documents the stable release-aware notice boundary. |
| Validate and close | ✅ | Story-scoped automated validation passed; manual smoke is blocked/attention-needed because this dev clone is intentionally dirty and ahead of stable. Story docs, epic index, REFERENCE, and worklog updated. |

## Observations for Future Maestro Visualization

- A small board embedded in the story folder is enough to make state visible without needing a UI.
- The most useful axis is not only task completion, but Ariad stage progression. The stage ribbon prevents “busy coding” from hiding the lifecycle.
- The board should distinguish product cards from process cards. Here, “render stable release-aware notices” is product-visible; “update public docs” is coherence work.
- Percent progress is approximate and should be treated as a narrative signal, not a metric of truth.
- A useful visual distinction emerged: validation can be green for automated story checks while manual smoke is yellow because the local scenario is not the product scenario. The board should show both instead of flattening them into pass/fail.
- Navigator feedback: the current board made story-local progress visible, but lacked a bird's-eye map of `CV → Epic → Story`. Future visualizations should start with the containing value stream before zooming into task cards.
- Navigator feedback: horizontal flow may be more natural than vertical/checklist display. Next cycle should experiment with lanes such as `Backlog → Ready → Doing → Validate → Done`, with cards visibly moving sideways through Ariad stages.

## Next Visualization Experiment

Try a two-level view:

```text
CV9 Mirror Mind 1.0
  -> CV9.E3 Distribution & Tooling
     -> CV9.E3.S13 Release-Aware Update Notices
```

Then a horizontal board:

```text
+---------+--------+------------+----------+------+
| Backlog | Ready  | Doing      | Validate | Done |
+---------+--------+------------+----------+------+
|         |        |            | S13      | S12  |
+---------+--------+------------+----------+------+
```

The hypothesis is that Ariad needs both altitude and motion: altitude to show where the story sits in the larger structure, motion to make flow perceptible as work changes state.

## Validation Snapshot

```text
Automated checks: ✅ 99 passed, ruff clean, format clean, story mypy clean, diff whitespace clean
Manual smoke:     🟨 stable check reports local_ahead, dry-run blocked by dirty dev tree
Risk posture:     ✅ expected for dev clone, no production mutation attempted
```
