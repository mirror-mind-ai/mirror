[< CV9.E3.S15](index.md)

# Ariad Visual Progress Experiment

This story starts with the transition view learned at S14 close, then continues with the taxonomy-card grammar.

## Visual Grammar

Taxonomy cards:

- `🟪[CV9]` for Capability Value cards
- `🟦[E3]` for Epic cards
- `🟩[S15]` for Story cards

Ariad checkpoint states:

- `✓` done
- `◉` current
- `○` pending
- `✕` blocked

## Transition View

```text
Completed
🟩[S14] Release Notes Skill Parity
Status: Done
Commit: e56ed30

Integrated into
🟦[E3] Distribution & Tooling

Unlocked
- Release notes are visible across runtime skill surfaces.
- Stable update notices and release-note access now speak to users in release terms.

Remaining
🟩[S15] Release Promotion Checklist / Doctor
🟩[S16] Stable Promotion Execution Path
🟩[S17] Fresh User Stable Update Smoke

Recommended next
🟩[S15] Release Promotion Checklist / Doctor

Why
After release communication is visible, the next missing capability is a repeatable preflight before anyone promotes stable.
```

## Bird's-Eye Map

```text
🟪[CV9]  Mirror Mind 1.0
  🟦[E3]   Distribution & Tooling
    🟩[S15]  Release Promotion Checklist / Doctor
```

## Ariad Stage Ribbon

```text
Ariad: ✓ Plan | ✓ Implement | ✓ Validate | ✓ Review | ✓ Coherence | ◉ Commit
Flow:   Backlog | Ready | Doing | Validate | ◉ Done
Progress: ███████░ 88%
```

## Horizontal Flow Board

```text
+---------+--------------------------------+-------+----------+--------------------------------+
| Backlog | Ready                          | Doing | Validate | Done                           |
+---------+--------------------------------+-------+----------+--------------------------------+
| 🟩[S16] | 🟩[S15] Release Doctor         |       |          | 🟩[S14] Release Notes Parity   |
| 🟩[S17] |                                |       |          | 🟩[S13] Release-Aware Notices  |
+---------+--------------------------------+-------+----------+--------------------------------+
```

## Plan View Components

- Bird's-Eye Map
- Transition View
- Scope Boundary
- Proposed Command Shape
- Risk/Exit-Code Question
- Validation Route

## Visualization Notes

- Transition View is now a distinct view, not a checkpoint detail.
- Plan View benefits from showing both the parent map and the previous-story transition, because this explains why the next story is coherent.
- The horizontal board is more useful at the story level when it shows adjacent stories, while the task list remains inside the plan.
- Navigator feedback at commit checkpoint: the phrase “S15 implemented and validated. We are at the commit checkpoint.” felt good. It combines completed story state with current Ariad checkpoint in one compact transition sentence. Future Maestro checkpoint summaries should try this pattern: `<Story> implemented and validated. We are at the <checkpoint> checkpoint.`
- Navigator feedback after close: Bird's-Eye Map alone is not enough for a “next movement” summary. It locates the next story, but does not show motion. Transition summaries need arrow, state, and rationale. Adopt the compact motion pattern: `Moving next: 🟩[S15] Release Doctor  ──unlocks──>  🟩[S16] Stable Promotion Execution Path`.
