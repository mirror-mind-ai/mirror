[< Roadmap](../index.md)

# CV17 — Soul Mode

**Status:** 🟡 Planned

**Source exploration:** Mirror Soul Mode, Ritual and Visual Grammar

---

## What This Is

CV17 gives Mirror a native experiential mode for inner life. Soul Mode is not a productivity surface, a reading feature, or a generic reflective chat with icons. It is a ritual listening regime whose attractor is:

```text
remembering who I am
```

The user enters through a simple opening, answers freely, and Mirror listens for the living matter in the day. When enough matter appears, Mirror offers situated possible listenings, opens the selected rite, conducts the conversation through that voice, matures a fruit across turns, and lets the user harvest and optionally save one journal entry.

Soul Mode emerged from the Passagem exploration. Passagem began as guided philosophical reading for waiting intervals, then shifted into a rite of passage through a fragment. CV17 preserves that discovery: Passagem belongs inside Soul Mode as one possible rite, not as the whole product.

---

## Product Boundary

```text
Mirror Mode reflects.
Explorer Mode preserves uncertainty.
Builder Mode executes commitment.
Soul Mode turns the day toward the inner life.
```

Soul Mode should be explicit and visible. It should not silently intercept ordinary Mirror conversations. It should not become a form. It should not write journal entries until the user chooses to harvest and confirms saving.

The first release validates the minimal ritual grammar, not the full ecosystem of voices, fragments, poetry, and wisdom curation.

---

## Community Promise

Mirror can already remember, reflect, explore, and build. Soul Mode adds a different movement: a user can enter a small ritual space, let the day speak, listen to the center, the shadow, a wisdom idea, or beauty, and leave with a fruit that can be preserved.

The promise is not that Mirror gives better advice. The promise is that Mirror can help the user cross a state without turning inner life into a task list.

---

## Delivery Arc

| Code | Delivery Story | Outcome | Status |
|------|----------------|---------|--------|
| [CV17.DS1](cv17-ds1-soul-mode-activation-entry/index.md) | Soul Mode activation and entry surface | A user can explicitly enter Soul Mode for a journey or session and see the ritual entry surface | ✅ Done |
| [CV17.DS2](cv17-ds2-living-field-possible-listenings/index.md) | Living field and possible listenings | Mirror can conduct the opening conversation, recognize enough living matter, and render situated Possible Listenings | ✅ Done |
| [CV17.DS3](cv17-ds3-active-rite-minimal-voices/index.md) | Active listening lenses and minimal voices | Choosing Self Voice or Shadow Voice renders a listening surface with what the voice says and a Mirror bridge back to the conversation | ✅ Done |
| [CV17.DS4](cv17-ds4-fruit-in-maturation/index.md) | Fruit in maturation | Soul Mode maintains one fruit in session state and can thicken it across user turns without writing to the journal | ✅ Done |
| [CV17.DS5](cv17-ds5-harvest-journal-record/index.md) | Harvest and journal record | The user can harvest the matured fruit and optionally save exactly one journal entry | ✅ Done |
| [CV17.DS6](cv17-ds6-release-feedback-runway/index.md) | Pre-release usage adjustments, packaging, and feedback runway | The first Soul Mode release is tuned from real Pi usage, documented, validated, and leaves Wisdom, Beauty, Passagem, and richer curation for feedback-driven expansion | ✅ Done |

The sequencing follows the product grammar discovered in exploration. Entry comes before detection. Possible Listenings come before active rites. Active rites come before fruit state. Fruit state comes before journal persistence. Release packaging closes the first usable slice without pretending to complete the full Soul Mode ecosystem.

---

## Canonical First-Slice Flow

```text
Mode Entry
  → Listening To The Living Field
  → Possible Listenings
  → Rite Entry
  → Conversation Inside The Rite
  → Fruit In Maturation
  → Harvested Fruit
  → Optional Journal Record
```

The first surface is:

```text
Soul Mode
╭────────────────────────────────────────╮
│   ✦  IN ORDER TO                            │
│                                        │
│   remember who you are              │
│                                        │
│   ▹  START BY ANSWERING                │
│                                        │
│   how is your day going today?               │
╰────────────────────────────────────────╯
```

---

## First Slice Principles

- Natural language is the user interface. Commands are contained runtime resources.
- Soul Mode activation sets a visible ritual lens; it does not silently start from ordinary Mirror Mode.
- Possible Listenings are situated in the user’s last turn, not generic menu options.
- Choosing a listening opens the rite immediately.
- The first implementation supports Self Voice and Shadow Voice as minimal active rites.
- Harvesting is incremental: one fruit matures across turns.
- The journal is not a log. It receives one entry only after harvest and confirmation.
- Passagem, Wisdom Voice, Beauty Voice, and Return To Center should remain architecturally possible without being fully implemented in the first slice.

---

## Conscious Non-Goals For The First Release

- No hidden hook-based detection of Soul Mode intent.
- No automatic conversion from Mirror Mode into Soul Mode.
- No full library of philosophical, poetic, or literary fragments.
- No complete Wisdom Voice or Beauty Voice implementation.
- No multiple fruits per session.
- No rich visual UI beyond textual surfaces.
- No journal writing before the user asks to harvest and confirms saving.
- No attempt to implement Passagem again as a standalone product.

---

## Open Design Questions

- Should Soul Mode be a first-class operating mode in the runtime lifecycle or a Mirror Mode ritual lens with its own state?
- Where should `fruit_in_progress` live: runtime state, conversation metadata, durable session table, or a new service store?
- Should maturity detection for Possible Listenings begin as LLM-guided instruction, explicit heuristic, or manual command?
- How should the user correct a fruit in maturation?
- Can the user switch rites while preserving the same fruit?
- What icon should Return To Center use, since ◌ collides with Mirror Mode?
- Which journal memory type and metadata should represent a harvested Soul Mode fruit?

---

## Done Condition

CV17 first release is done when a user can explicitly enter Soul Mode, see the ritual entry surface, answer freely, receive situated Possible Listenings when living matter appears, choose at least Self Voice or Shadow Voice, enter the selected rite immediately, mature one fruit across turns, harvest it, optionally save one journal entry, and exit without the experience turning into a form, a productivity feature, or a conversation log.

---

## References

- Mirror Soul Mode handoff
- Product design proposal
- Handoff info
