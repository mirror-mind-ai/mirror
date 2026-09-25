[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR102 — The Claude Code `mm-build` skill carries no activation boundary, journey binding, or Ariad section

## Problem

Builder Mode has two skill variants, and they no longer describe the same mode:

| Runtime | Skill it reads | Size |
|---|---|---|
| Pi | `.pi/skills/mm-build/SKILL.md` | 1019 lines |
| Codex, Gemini CLI | `.agents/skills/mm-build`, a link to the Pi copy | the same file |
| Claude Code, in a checkout | `.claude/skills/mm-build/SKILL.md` | 108 lines |
| Claude Code, installed plugin | `plugins/mirror-mind/skills/mm-build/SKILL.md` | byte-identical to `.claude` |

The 108-line variant covers loading a journey, reading project docs, keeping
them current, setting `project_path`, and finalizing the session. It has none
of these:

- the **Builder Activation Boundary**: loading a journey is context, not
  consent to change files;
- the transition-surface rules;
- **Journey Binding** (CR008): every `build` command after `build load`
  carries `--journey <slug>`;
- **Adopted Method** and **Ariad Runtime Behavior**: the lifecycle commands,
  the verbatim surface transport protocol, Refinement composition, cadence,
  and preauthorization.

The Pi copy gained its Ariad section on 2026-06-12, and the Claude variant
never followed. [CR071](cr071-collapse-the-triplicated-skill-command-references.md)
compared the variants on 2026-09-09. It recorded three deliberate differences:
frontmatter name, Usage section, and example language. The missing sections are
not among them. The skill-parity gate compares entry points only for the
commands each copy documents, so it cannot see a section that one copy lacks.

Found while closing CR008. That CR's skill change (`0924c1dc`) reached Pi,
Codex, and Gemini CLI through `.pi`. It reached nothing on Claude Code, because
the Claude variant documents no lifecycle command to change.

## Expected Behavior

Builder Mode behaves the same way for the same journey in every runtime. The
activation boundary and journey binding apply everywhere. For an
Ariad-adopted journey, the lifecycle commands apply too, and their surfaces
pass through verbatim. Where a runtime is meant to differ, the difference is a
recorded decision with its reason, and the parity gate knows about it.

How the variants are then kept in step is part of the fix. CR071 rejected
generating the copies from one source as "a larger machine than the problem".
A gap of more than 900 lines is a new fact for that trade-off.

## Impact

Medium. A Claude Code user on an Ariad-adopted journey gets Builder Mode
without Ariad. There are no lifecycle commands to follow, no rule that
surfaces pass through verbatim, and no activation boundary in the skill, so
whatever the agent improvises is unguided. Since CR008, a lifecycle command
improvised without `--journey` refuses rather than binding another journey,
so that failure is loud rather than silent.

The missing activation boundary is the sharper gap. Nothing in the Claude Code
skill says that loading a journey is not consent to change files.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Captured by
the Navigator's decision while closing
[CR008](../rs001-ariad-runtime-trust/cr008-bind-lifecycle-commands-to-active-journey.md).

## Evidence

- Measured 2026-09-25. `.pi/skills/mm-build/SKILL.md` is 43,778 bytes and 1019
  lines, with top-level parts `Base Builder Mode Behavior` (sections 1–7,
  including 1.1 Transition Surface, 1.2 Journey Binding, and 3 Builder
  Activation Boundary), `Adopted Method Behavior`, and
  `Ariad Runtime Behavior`. `.claude/skills/mm-build/SKILL.md` is 3,455 bytes
  and 108 lines, with sections 1–6 only. `plugins/mirror-mind/skills/mm-build/SKILL.md`
  is byte-identical to it.
- `.agents/skills/mm-build` links to `../../.pi/skills/mm-build`, and Codex and
  Gemini CLI discover skills there
  ([getting started](../../../getting-started.md),
  [runtime interface](../../../product/specs/runtime-interface/index.md)).
- `git log -S'# Ariad Runtime Behavior' -- .pi/skills/mm-build/SKILL.md`: first
  `befad51f` (2026-06-12, "Add Ariad pull and prepare lifecycle"). The `.claude`
  copy was last changed by `2a597fc5` (2026-09-16), for its invocation only.
- `ts/scripts/checkSkillCommandParity.ts`: what it checks, and what it
  deliberately does not.

## Outcome

Open.
