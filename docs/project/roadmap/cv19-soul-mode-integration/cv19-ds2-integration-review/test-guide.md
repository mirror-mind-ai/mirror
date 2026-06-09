[< Story](index.md)

# Test Guide — CV19.DS2 Integration Proposal

## Automated Tests

Run:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py -q
```

Expected:

- Integration Proposal renders with provided sections.
- Empty sections are omitted.
- At least one section is required.
- The proposal-only footer renders.
- Existing Soul Mode voice, fruit, harvest, and closing tests still pass.

## CLI Smoke

Run:

```bash
uv run python -m memory soul review \
  --origin "The fruit was already saved as journal." \
  --self "Commitment may need to belong to truth, not image management." \
  --shadow "A part fears being seen as careless without over-availability." \
  --ego "Staying late can become image management." \
  --persona "The committed professional persona may overperform availability." \
  --open "How to sustain measure under uncertain gaze."
```

Expected output includes:

```text
☾  INTEGRATION PROPOSAL
origin
self
shadow
ego behavior
persona
leave open
proposal only — nothing changed
```

Expected absence:

- no journal save;
- no identity mutation;
- no journey identity category;
- no project mutation.

## Pi Manual Validation

After Closing Rite, say naturally:

```text
sim, quero olhar o que pode permanecer
```

Expected:

- Mirror renders Integration Proposal.
- Mirror renders the final multi-layer proposal text.
- Mirror asks: `Quer registrar assim na sua identidade? Ou, se quiser, também podemos ajustar o que quiser.`
- Mirror does not mutate identity until the user confirms registration.
- If the user asks for adjustment, Mirror renders an adjusted Integration Proposal before applying anything.
