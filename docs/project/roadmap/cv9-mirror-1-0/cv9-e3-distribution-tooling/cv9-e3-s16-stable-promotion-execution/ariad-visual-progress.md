[< CV9.E3.S16](index.md)

# Ariad Visual Progress Experiment

## Visual Grammar

Taxonomy cards:

- `🟪[CV9]` for Capability Value cards
- `🟦[E3]` for Epic cards
- `🟩[S16]` for Story cards

Ariad checkpoint states:

- `✓` done
- `◉` current
- `○` pending
- `✕` blocked

## Transition View

```text
Completed
🟩[S15] Release Promotion Checklist / Doctor
Status: Done
Commit: 71f0b09

Integrated into
🟦[E3] Distribution & Tooling

Unlocked
- Promotion readiness is inspectable before mutation.
- The system can distinguish warnings from blockers before stable advancement.

Moving next
🟩[S15] Release Doctor  ──unlocks──>  🟩[S16] Stable Promotion Execution Path

Why
The doctor can now say whether promotion is safe. The next coherent move is to implement the controlled path that performs promotion when the doctor passes.
```

## Bird's-Eye Map

```text
🟪[CV9]  Mirror Mind 1.0
  🟦[E3]   Distribution & Tooling
    🟩[S16]  Stable Promotion Execution Path
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
| 🟩[S17] | 🟩[S16] Stable Promotion Path  |       |          | 🟩[S15] Release Doctor         |
|         |                                |       |          | 🟩[S14] Release Notes Parity   |
+---------+--------------------------------+-------+----------+--------------------------------+
```

## Plan View Components

- Transition View
- Bird's-Eye Map
- Command Shape
- Safety Rules
- Stage Model
- Validation Route

## Visualization Notes

- The movement line from S15 to S16 made the transition legible in a way the hierarchy alone did not.
- For transition summaries, use `Moving next` with an arrow and a verb naming what the completed story unlocks.
- Navigator feedback at commit checkpoint: the Bird's-Eye Map should show epic progress, for example a progress bar and percentage of stories completed inside the epic. This would make `🟦[E3]` more than a parent label; it becomes a visible progress container.
- Navigator open question: release visualization is missing. Maestro may need to know which release is being built. Sometimes release intent is known at the start, for example `v0.9.0 Self-Update Done`; sometimes it may emerge only after a story/epic collapses. Future visualization should support both: an optional `Release Intent` card at plan time and a `Release Candidate` card at transition/close time.

## Next Visualization Experiment

Add epic progress to Bird's-Eye Map:

```text
🟪[CV9]  Mirror Mind 1.0
  🟦[E3]   Distribution & Tooling  Stories: 16/17  ███████░ 94%
    🟩[S16]  Stable Promotion Execution Path
```

Add release context when known:

```text
Release Intent
[known] v0.9.0 — Self-Update Done
Scope: 🟩[S13] + 🟩[S14] + 🟩[S15] + 🟩[S16] + 🟩[S17]
State: building
```

If not known:

```text
Release Intent
[emergent] no version selected yet
Likely boundary: story patch, epic minor, or CV major after coherence review
Decision point: transition or close
```
