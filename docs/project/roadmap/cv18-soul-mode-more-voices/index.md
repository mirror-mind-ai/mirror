[< Roadmap](../index.md)

# CV18 — Soul Mode More Voices

**Status:** ✅ Done

**Previous release:** [CV17 — Soul Mode](../cv17-soul-mode/index.md)

---

## What This Is

CV18 expands Soul Mode from the first ritual into a fuller listening constellation. CV17 proved the minimal cycle: enter Soul Mode, listen to the living field, receive Possible Listenings, hear Self or Shadow, mature a fruit, harvest it, and optionally save one journal entry.

CV18 adds the voices the ritual already implies but the user cannot yet hear: Wisdom Voice and Beauty Voice.

The release is organized by user-visible deliverables. Prompts, rendering, command grammar, and Possible Listenings changes belong inside the voice stories that make them usable. They are not separate delivery stories.

---

## Product Boundary

Soul Mode remains a ritual listening mode, not a productivity assistant and not an identity-mutating engine.

Wisdom Voice and Beauty Voice are listening lenses. The user still converses with Mirror. Mirror listens through the selected voice and renders what that lens hears.

The release should not introduce psyche-layer enrichment, closing integration rites, rich UI, or automatic journal/identity mutation. Those belong to later integration work.

---

## Community Promise

A user can enter Soul Mode and hear more of the inner constellation. Self and Shadow are no longer the only active lenses. Wisdom can reveal the discernment already present in the experience. Beauty can reveal where life still has form, delicacy, and aliveness.

The promise is not that Mirror gives better advice. The promise is that Mirror can help the user listen through more dimensions of the soul without collapsing the ritual into solving.

---

## Delivery Arc

| Code | Delivery Story | Outcome | Status |
|------|----------------|---------|--------|
| [CV18.DS1](cv18-ds1-wisdom-voice/index.md) | Wisdom Voice | A user can hear Wisdom Voice inside Soul Mode as a real listening lens | ✅ Done |
| [CV18.DS2](cv18-ds2-beauty-voice/index.md) | Beauty Voice | A user can hear Beauty Voice inside Soul Mode as a real listening lens | ✅ Done |
| [CV18.DS3](cv18-ds3-refinements-pre-release/index.md) | Refinements Pre-Release | Real use of the expanded voice constellation is tuned before publication | ⏭️ Cancelled — refinements completed inside DS1/DS2 validation |
| [CV18.DS4](cv18-ds4-release-packaging/index.md) | Release Packaging | v0.25.0 is documented, validated, tagged, and published | ✅ Done |

---

## First Flow Target

```text
Soul Mode Entry
  → Listening To The Living Field
  → Possible Listenings with Self, Shadow, Wisdom, and Beauty
  → Selected Voice Listening Card
  → Mirror bridge back to the conversation
  → Fruit In Maturation remains available
  → Harvest remains confirmation-only
```

---

## Voice Principles

- Voices are listening lenses, not separate agents.
- Voice content appears inside the ritual card under `the voice says`.
- Mirror's interpretive bridge remains outside the card.
- The voices should reveal what is happening, not command the user.
- Wisdom Voice must not become generic advice.
- Beauty Voice must not become shallow positivity.
- No voice mutates identity, journal, or project state automatically.

---

## Conscious Non-Goals

- No Closing Rite or psyche-layer integration in this release.
- No automatic Self or Shadow identity enrichment.
- No identity mutation.
- No rich web Soul Mode UI.
- No Passagem curation.
- No Wisdom/Beauty fragment library.
- No multiple fruits.
- No Return To Center implementation.

## Post-Release Roadmap Decision

After CV18 validation, Passagem, Return To Center, Closing Day / Daily Soul Ritual, and additional new voices were removed from the active roadmap. Source-library work remains dormant: it should only return if there is a strong API/provider approach, not as a local Mirror-maintained library.

The remaining Soul Mode horizon is integration first, then Web Soul Mode UI.

---

## Done Condition

CV18 is done when a user can enter Soul Mode, reach Possible Listenings, choose Wisdom Voice or Beauty Voice, receive a coherent listening card in the same ritual grammar as Self and Shadow, continue the ritual without operational side effects, and complete release validation for `v0.25.0 — Soul Mode More Voices`.

---

## References

- [CV17 — Soul Mode](../cv17-soul-mode/index.md)
- Mirror Soul Mode handoff
- Product design proposal
