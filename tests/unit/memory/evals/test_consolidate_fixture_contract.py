"""Unit tests for evals.consolidate's deterministic parts (CV9.E2.S23).

Covers the fixture factory and the field-coverage check. No live LLM call
anywhere in this file — the five live probes are exercised only via
`python -m memory eval consolidate`.
"""

import pytest
from evals.consolidate import _consolidate_memory

from memory.intelligence.consolidate import _format_cluster

pytestmark = pytest.mark.unit


class TestConsolidateMemoryFixtureContract:
    """Memory is a real Pydantic model, so structural drift is prevented by
    the type system itself. What this proves: every field the fixture sets
    actually flows through the real _format_cluster() into the prompt text."""

    def test_fixture_fields_appear_in_formatted_output(self):
        mem = _consolidate_memory(
            id="drift-guard-id",
            title="Drift Guard Title",
            content="Drift guard content marker.",
            context="Drift guard context marker.",
            memory_type="pattern",
            layer="self",
            created_at="2026-03-15T00:00:00+00:00",
        )
        formatted = _format_cluster([mem])
        assert "Drift Guard Title" in formatted
        assert "pattern" in formatted
        assert "self" in formatted
        assert "2026-03-15" in formatted
        assert "Drift guard content marker." in formatted
        assert "Drift guard context marker." in formatted


class TestConsolidateMemoryFactory:
    def test_defaults_produce_a_valid_memory(self):
        mem = _consolidate_memory()
        assert mem.memory_type == "decision"
        assert mem.layer == "ego"

    def test_overrides_apply(self):
        mem = _consolidate_memory(memory_type="tension", layer="self")
        assert mem.memory_type == "tension"
        assert mem.layer == "self"

    def test_two_calls_are_independent(self):
        a = _consolidate_memory(title="A", id="id-a")
        b = _consolidate_memory(title="B", id="id-b")
        assert a.title == "A"
        assert b.title == "B"
        assert a.id != b.id
