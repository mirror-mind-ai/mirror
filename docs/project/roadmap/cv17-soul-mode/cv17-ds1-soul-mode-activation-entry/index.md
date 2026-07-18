[< CV17](../index.md)

# CV17.DS1 — Soul Mode Activation And Entry Surface

**Status:** ✅ Done

**Placement:** CV17 first Soul Mode behavior story

**User-visible outcome:** A user can explicitly enter Soul Mode and see the ritual entry surface that frames the experience around remembering who they are.

---

## Why This Exists

Soul Mode needs an explicit threshold before any rite, voice, fruit, or journal behavior can be trustworthy. The user should not have to infer that the conversation has changed regime. The entry surface marks that the next interaction is not ordinary Mirror Mode and not Builder work.

The first surface discovered in exploration separates horizon and action:

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

## Scope

- Define Soul Mode as an explicit enterable lens for the runtime.
- Add or extend the contained CLI operation needed for activation.
- Render the Mode Entry surface exactly enough for first-slice validation.
- Set the active journey or session context when applicable.
- Update the Pi skill contract so natural-language activation uses the contained operation.
- Ensure activation is context setup only and does not write journal entries or start a rite.

---

## Non-goals

- No Possible Listenings detection.
- No active rites.
- No fruit state.
- No journal persistence.
- No full Passagem, Wisdom Voice, or Beauty Voice behavior.
- No automatic hidden conversion from Mirror Mode into Soul Mode.

---

## Acceptance Behavior

Given the user asks to enter Soul Mode, Mirror activates the Soul Mode lens and renders the Mode Entry surface.

Given Soul Mode is active, the user can answer “how is your day going today?” as ordinary language, without needing to know a command grammar.

Given Soul Mode activation runs, it does not create a journal record, open a rite, or infer a harvest.

Given another explicit mode is active, Soul Mode activation should make the transition visible rather than silently mixing lenses.

---

## References

- [CV17 Soul Mode](../index.md)
- Product Design Proposal
