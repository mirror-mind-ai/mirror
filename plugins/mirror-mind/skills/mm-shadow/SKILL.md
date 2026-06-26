---
name: "mm:shadow"
description: Surfaces and promotes shadow-layer observations into the structural shadow identity layer
user-invocable: true
---

# mm-shadow

Shadow as structural cultivation — CV7.E4.S4.

The mirror has an across-conversation view that Vinícius doesn't. Shadow work is where
that view becomes useful: recurring tensions, avoidances, contradictions, and blind spots
that repeat across conversations but haven't been seen from the outside. This skill
surfaces them with provenance, grounds each observation in specific memories, and writes
accepted observations to the structural shadow layer — where they can then compose into
the prompt on turns that touch shadow material.

**Asymmetric activation:** Shadow surfaces only when reception's `touches_shadow` axis
fires AND the structural layer has confirmed content. It surfaces with provenance
("this has come up in 3 contexts"), never as a bare verdict.

---

## Usage

```
/mm:shadow                             — scan and surface observations
/mm:shadow apply <proposal_id>         — accept an observation into the shadow layer
/mm:shadow reject <proposal_id>        — reject (source memories unchanged)
/mm:shadow list [--status pending|accepted|rejected]
/mm:shadow show                        — show current structural shadow layer content
```

---

## 1. Show current shadow layer (orientation)

```bash
uv run python -m memory shadow show
```

---

## 2. Scan for candidate observations

```bash
uv run python -m memory shadow scan [--limit 50]
```

Scans memories where:
- `layer='shadow'`
- `memory_type IN ('tension', 'pattern')`
- `readiness_state IN ('observed', 'candidate')` — includes memories advanced by mm-consolidate

Calls the LLM (Gemini Flash) once with the full pool to surface 1-3 grounded observations.
Each observation is stored as a pending `shadow_observation` in the `consolidations` table.

**The LLM will return nothing when there is insufficient evidence.** That is correct behavior
— the cost of false positive shadow surfacing is high.

---

## 3. Present each observation to Vinícius

For each observation, show:
- The pattern name (title)
- The grounded observation text with evidence note
- The source memory IDs

Ask: **accept / edit / reject?**

---

## 4. Apply or reject

**Accept:**
```bash
uv run python -m memory shadow apply <proposal_id>
```

**Accept with edited content:**
```bash
uv run python -m memory shadow apply <proposal_id> \
  --content "User-revised observation text"
```

**Reject:**
```bash
uv run python -m memory shadow reject <proposal_id>
```

What happens on acceptance:
- Observation is appended to `identity.shadow.profile`
- Source memories advance to `readiness_state='acknowledged'`
- Provenance is recorded in the `consolidations` table

Rejected proposals leave the shadow layer and source memories unchanged.

---

## 5. List history

```bash
uv run python -m memory shadow list [--status pending|accepted|rejected]
```

---

## Composition behavior (automatic)

Once the shadow layer has content, it composes into Mirror Mode prompts when:
- Reception's `touches_shadow` axis is True (the turn involves existential tension,
  avoidance, psychological patterns, or shadow-adjacent themes)
- AND `MEMORY_RECEPTION=1` is set (the default)

The shadow section includes a provenance framing note. It never surfaces as a bare
verdict — always grounded in evidence.
