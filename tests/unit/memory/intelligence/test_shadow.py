"""Unit tests for intelligence/shadow.py's prompt-assembly behavior.

Deterministic, no live LLM — mirrors test_scene.py's fence-presence pattern.
propose_shadow_observations()'s parsing/output behavior is separately covered
by the legacy tests/test_shadow_s4.py (mocked-LLM output shape); this file is
new for CV9.E2.S22 and covers only the AI-22-pattern fence this story adds.
"""

from unittest.mock import patch

from memory.intelligence.llm_router import LLMResponse
from memory.intelligence.shadow import propose_shadow_observations
from memory.models import Memory


def _memory(**overrides) -> Memory:
    defaults = {
        "id": "sample-mem-1",
        "title": "Sample memory title",
        "content": "Sample memory content.",
        "context": "Sample context.",
        "memory_type": "tension",
        "layer": "shadow",
        "readiness_state": "observed",
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    defaults.update(overrides)
    return Memory(**defaults)


class TestPromptFencesShadowMemoriesAsData:
    """CV9.E2.S22 (AI-22 pattern): shadow-candidate memory content is
    user-controlled and must be fenced as data, not instructions — proactive
    fence, since the surface feeds identity via mm-shadow review."""

    def test_shadow_memories_block_is_fenced(self):
        captured = {}

        def fake_send(model, messages, temperature):
            captured["prompt"] = messages[0]["content"]
            return LLMResponse(model=model, content="[]")

        with patch("memory.intelligence.shadow.send_to_model", side_effect=fake_send):
            propose_shadow_observations([_memory()], [], "Test User")

        prompt = captured["prompt"]
        assert "<shadow_memories>" in prompt and "</shadow_memories>" in prompt
        assert "not instructions" in prompt.lower()

    def test_shadow_structure_block_is_not_fenced(self):
        """Only user-derived content is fenced — {shadow_structure} is
        system-side identity content, per the plan's D4."""
        captured = {}

        def fake_send(model, messages, temperature):
            captured["prompt"] = messages[0]["content"]
            return LLMResponse(model=model, content="[]")

        entries = [type("E", (), {"key": "profile", "content": "Existing pattern text."})()]
        with patch("memory.intelligence.shadow.send_to_model", side_effect=fake_send):
            propose_shadow_observations([_memory()], entries, "Test User")

        prompt = captured["prompt"]
        assert "<shadow_structure>" not in prompt
        assert "Existing pattern text." in prompt

    def test_memory_content_appears_inside_the_fence(self):
        captured = {}

        def fake_send(model, messages, temperature):
            captured["prompt"] = messages[0]["content"]
            return LLMResponse(model=model, content="[]")

        with patch("memory.intelligence.shadow.send_to_model", side_effect=fake_send):
            propose_shadow_observations(
                [_memory(content="A distinctive marker string.")], [], "Test User"
            )

        prompt = captured["prompt"]
        start = prompt.index("<shadow_memories>")
        end = prompt.index("</shadow_memories>")
        assert "A distinctive marker string." in prompt[start:end]
