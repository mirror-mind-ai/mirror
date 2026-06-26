[< Story](index.md)

# Coherence — CV20.DS4.US3 Approval And Implementation Guard

## Process

This story closes the gap between Plan as a visible checkpoint and implementation as an allowed runtime phase. Approval is no longer conversational; it is a stored runtime event.

## Project

The Builder runtime now maintains a coherent sequence:

```text
Plan -> Plan Approved -> Implement Allowed
```

Implementation remains blocked when:

- no Builder delivery cursor exists;
- a Navigator confirmation is pending;
- the last delivery event is not `plan_approved`.

## Product

The Navigator can now approve a Plan and ask Builder to check implementation permission through deterministic Ariad surfaces. The blocked path explains which checkpoint is missing and preserves the no-mutation boundary.

## Validation Evidence

```text
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_lifecycle.py -q
50 passed
```

Final suite was run before commit for the previous Plan Done block. This story-specific validation covers the changed approval/guard behavior.

## Result

Coherent. The story can be marked Done.
