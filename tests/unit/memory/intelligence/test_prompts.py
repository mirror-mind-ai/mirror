"""Unit tests for shared prompt-assembly helpers in intelligence/prompts.py."""

import pytest

from memory.intelligence.prompts import fence_untrusted

pytestmark = pytest.mark.unit


class TestFenceUntrusted:
    """CV9.E2.S22: the shared delimiter convention across extraction
    (<transcript>), scene (<scene_data>), and shadow (<shadow_memories>) —
    extracted once the third fenced surface fired the rule-of-three."""

    def test_wraps_body_in_matching_tags(self):
        assert fence_untrusted("transcript", "hello") == "<transcript>\nhello\n</transcript>"

    def test_different_tag_produces_different_delimiter(self):
        assert fence_untrusted("scene_data", "x") == "<scene_data>\nx\n</scene_data>"

    def test_empty_body_still_fences(self):
        assert fence_untrusted("t", "") == "<t>\n\n</t>"

    def test_multiline_body_preserved_inside_fence(self):
        result = fence_untrusted("t", "line one\nline two")
        assert result == "<t>\nline one\nline two\n</t>"
