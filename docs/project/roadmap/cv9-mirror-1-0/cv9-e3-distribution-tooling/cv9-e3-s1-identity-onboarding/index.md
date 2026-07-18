[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S1 — Zero-Friction Identity Onboarding

**Status:** ✅ Done  
**Epic:** CV9.E3 Distribution & Tooling

---

## User-Visible Outcome

A new user types their name once. The mirror works immediately — not after
editing YAML files, not after reading documentation about what to put where.
The first session is already personal enough to be useful. Identity deepens
over time through use, not through upfront configuration.

---

## Problem

The current onboarding flow has a structural gap between installation and
activation. The sequence is:

```
clone → install → memory init → [edit YAML files] → seed → use
```

That middle step — editing YAML files — is unguided, open-ended, and entirely
unsupported. The user is handed a directory of template files containing
placeholders like `[your name]`, `Describe the user's current reality`, and
`Examples: truth over comfort`. There is no pull, no constraint, no content
that works before editing.

The consequences observed across real installs:

1. **The mirror doesn't work until identity is filled in.** A freshly seeded
   placeholder identity produces a generic, impersonal session. The mirror
   doesn't feel like a mirror — it feels like a chatbot with extra steps.

2. **Filling in identity requires a kind of reflection most people aren't ready
   for at install time.** The soul file asks "who are you at the deepest level?"
   on day one, before the person has seen what the mirror can do. The friction
   isn't technical — it's existential.

3. **The persona catalog is too narrow.** Only three personas ship by default:
   writer, thinker, engineer. All three skew toward a developer/intellectual
   profile. Personas are one of the main reasons people want to try the mirror
   — but the default set doesn't reflect the breadth of what the mirror can do.

4. **The framing is wrong.** The current narrative says: configure identity
   first, then use the mirror. The correct narrative is: start with a working
   mirror, let identity sharpen through use. The current flow positions identity
   as a tax to pay before value is delivered. It should be a process that
   begins at first use and continues indefinitely.

---

## Approach

### 1. Name only at init

`memory init <name>` followed by `memory seed` must produce a fully working
mirror with zero manual edits. The name is the only input required to
bootstrap a personal identity.

Everything else — soul, behavior, operational identity, personas, journeys —
ships with real, usable content that works for most people out of the box.

### 2. Templates as editorial products

The current templates are fill-in forms. They need to become opinionated,
well-written content that can stand alone.

The target: identity that feels grounded and usable from the first session,
without being so specific that it feels like someone else's skin. The natural
Mirror Mind adopter — a reflective, growth-oriented person who wants
continuity of thought and uses AI as a thinking partner — is a real person
with a recognizable profile. The templates should be written for that person,
not for a hypothetical average user.

**Derivation strategy:** The new templates will be derived from Vinícius's
existing database identity, which has been refined through sustained real-world
use. The goal is not to copy it — it is to extract what is universal from
what is biographical.

| Layer | Derivation approach |
|-------|---------------------|
| `self/soul.yaml` | Keep philosophical operating principles (worldview, operating frequency). Strip biographical facts, personal history, and domain-specific context. |
| `ego/behavior.yaml` | Keep behavioral postures (don't accelerate urgency, don't simulate certainty, hold position). Strip Big Five calibrations, which are personal. Replace with guidance to calibrate to the user's profile as it emerges. |
| `ego/identity.yaml` | Keep the framing of mirror as intellectual peer, not assistant. Strip role-specific content (entrepreneur, educator). |
| `user/identity.yaml` | Keep the schema. Populate only with the user's name. All other fields remain empty for the user to fill progressively. |
| Personas | Keep the architectural structure of each persona file. Rebuild content for each domain from scratch — persona content is the most personal layer and does not transfer. |

The editorial judgment throughout: **which elements are the user's specific
expression of universal truths, and which are biographical facts?** Only the
former belongs in the templates.

### 3. Expanded persona catalog

Personas are the most immediate evidence that the mirror can adapt to the
user's domain. A narrow default catalog limits the first impression.

The new default persona set:

| Persona | Domain |
|---------|--------|
| `writer` | Writing, editing, voice, publishing |
| `thinker` | Ideas, decisions, conceptual clarity, framing |
| `engineer` | Software, systems, debugging, architecture |
| `therapist` | Emotional processing, patterns, inner work, psychological insight |
| `strategist` | Business positioning, decisions, trade-offs, competitive thinking |
| `coach` | Accountability, goals, habits, momentum, behavioral change |
| `researcher` | Inquiry, synthesis, evidence, analysis |
| `teacher` | Pedagogy, explanation, curriculum, mentoring |
| `doctor` | Health, body, symptoms, medical literacy |
| `financial` | Money, budgeting, investment, financial decisions |
| `designer` | Product, UX, visual design, creative work |
| `prompt-engineer` | Prompt design, LLM system architecture, AI behavior, Mirror self-improvement |

Each persona file must include: a clear identity section, a philosophy and
approach section, routing keywords sufficient for the detection system, and a
response format section. Quality is more important than quantity — a weak
persona erodes trust in the system.

### 4. Progressive enhancement as the native growth path

The docs and first-run messaging must frame identity refinement as the
intended path, not a workaround for a bad initial setup.

The narrative shifts from:

> "Fill in your identity before the mirror works."

To:

> "The mirror starts with a working generic identity. Use it. When something
> feels off or generic, refine it — one layer at a time, at your own pace."

The existing mechanisms already support this:

- `/mm-identity edit` for direct edits to any identity layer
- `/mm-consolidate` for promoting memory patterns into structural identity
- `/mm-seed --force` for reseeding from updated YAML files

What's missing is a clear narrative in the getting-started docs that makes
this path obvious and intentional. The onboarding success checklist should
explicitly include: *"your first session will use generic identity — that's
expected and correct."*

---

## Scope

**In scope:**

- Rewrite all templates under `templates/identity/` as editorial products.
- Add 9 new persona files to `templates/identity/personas/`.
- Verify that `memory init <name>` + `memory seed` produces a working mirror
  with no manual edits.
- Update `docs/getting-started.md` to reflect the new onboarding flow and
  the progressive enhancement narrative.
- Update `README.md` onboarding section.

**Out of scope:**

- A guided interview or conversational seeding flow (considered and deferred —
  the editorial template approach solves the immediate problem with lower
  complexity).
- Automatic identity refinement from usage patterns (the consolidation
  mechanism already handles this).
- Changes to the `memory init` or `memory seed` CLI commands beyond confirming
  they work correctly with the new templates.
- Localization or multi-language templates.

---

## Done Condition

- `memory init <name>` followed by `memory seed` produces a working mirror
  with no manual YAML editing. First session is useful.
- All template files under `templates/identity/` contain real, opinionated
  content — no placeholder text, no fill-in instructions.
- 12 personas ship in `templates/identity/personas/`, each with routing
  keywords, a clear identity, and a response format.
- `docs/getting-started.md` describes the zero-edit onboarding path and
  frames progressive identity enhancement as the intended growth mechanism.
- `README.md` onboarding section is consistent with the new flow.
- The identity templates pass a qualitative review: they produce a session
  that feels personal and grounded, not generic.

---

## See also

- [CV9.E3 Distribution & Tooling](../index.md)
- [Getting Started](../../../../../getting-started.md)
- [Templates](../../../../../../templates/identity/)
