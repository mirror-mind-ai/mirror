[< CV9.E3.S18](index.md)

# Ariad Visual Progress Experiment

## Visual Grammar

Taxonomy cards:

- `🟪[CV9]` for Capability Value cards
- `🟦[E3]` for Epic cards
- `🟩[S18]` for Story cards

Ariad checkpoint states:

- `✓` done
- `◉` current
- `○` pending
- `✕` blocked

## Transition View

```text
Completed
🟩[S17] Fresh User Stable Update Smoke
Status: Done
Release: v0.9.0 — Self-Update Done

Integrated into
🟦[E3] Distribution & Tooling

Unlocked
- Stable self-update works from v0.8.0 to v0.9.0 in a fresh-user-shaped clone.
- Dogfooding now exposes the opening UX gap: users need to see release availability when they open Mirror.

Moving next
🟩[S17] Fresh User Smoke  ──reveals──>  🟩[S18] Welcome and Status Bar Release Awareness
```

## Bird's-Eye Map

```text
🟪[CV9]  Mirror Mind 1.0
  🟦[E3]   Distribution & Tooling  Stories: 17/18  ███████░ 94%
    🟩[S18]  Welcome and Status Bar Release Awareness
```

## Release Intent

```text
Release Intent
[emergent] patch or follow-up release after v0.9.0
Scope: 🟩[S18]
State: planned
```

## Ariad Stage Ribbon

```text
Ariad: ✓ Plan | ✓ Implement | ✓ Validate | ✓ Review | ✓ Coherence | ◉ Commit
Flow:   Backlog | Ready | Doing | Validate | ◉ Done
Progress: ███████░ 88%
```

## Horizontal Flow Board

```text
+---------+------------------------------------------+-------+----------+--------------------------------+
| Backlog | Ready                                    | Doing | Validate | Done                           |
+---------+------------------------------------------+-------+----------+--------------------------------+
|         | 🟩[S18] Welcome/Status Release Awareness |       |          | 🟩[S17] Fresh User Smoke       |
|         |                                          |       |          | 🟩[S16] Stable Promotion Path  |
+---------+------------------------------------------+-------+----------+--------------------------------+
```

## Plan View Components

- Transition View
- Bird's-Eye Map with epic progress
- Release Intent
- Product UX target
- Policy principles
- Implementation slices
- Product decisions

## Visualization Notes

- S18 is a follow-up story revealed by dogfooding, not part of the original S13–S17 release intent.
- Release Intent is emergent here: the story may become a patch release or remain unreleased until the next coherent arc.
- This is a useful example for Maestro: release visualization must support both known release arcs and post-release follow-up stories.
- Navigator decisions: 6h TTL is acceptable; remote welcome checks should be disableable; status bar should read cache only; welcome owns refresh; version inference can use remote tags while title uses local release notes when available.
