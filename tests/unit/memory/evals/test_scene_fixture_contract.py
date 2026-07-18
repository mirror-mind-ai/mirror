"""Unit tests for evals.scene's deterministic parts (CV9.E2.S20).

Covers the golden-fixture drift guard, the `_scene(...)` factory, and the
`_mentions(...)` helper. No live LLM call anywhere in this file — the six
live probes themselves are exercised only via `python -m memory eval scene`
(see test-guide.md).
"""

import pytest
from evals.scene import _GOLDEN_SCENE_BASE, _mentions, _scene

from memory.surfaces.workspace import WorkspaceSurface

pytestmark = pytest.mark.unit


class TestGoldenSceneDriftGuard:
    """CV9.E2.S20 D2 — the fixture's shape must track the real read model.

    WorkspaceSurface._scene_model() takes journeys/conversations/memories/tasks
    as method arguments, not `self` state, and every helper it calls (
    _scene_journey_item, _scene_location_path, _scene_nearby, _scene_signals,
    _scene_fallback) is pure over its arguments except _scene_journey_item,
    which is only invoked per item in a non-empty `journeys` list. With every
    list empty, no service attribute is ever touched, so no stubbing is
    required.
    """

    def test_golden_scene_matches_real_scene_model_shape(self):
        surface = WorkspaceSurface(journeys=None, conversations=None, memories=None, tasks=None)
        real_scene = surface._scene_model(
            mode="global",
            journeys=[],
            selected_journey=None,
            conversations=[],
            memories=[],
            tasks=[],
        )
        real_scene.pop("synthesis", None)  # production always pops this before
        # calling generate_scene_synthesis (web/server.py:_generate_scene_synthesis)

        assert set(real_scene.keys()) == set(_GOLDEN_SCENE_BASE.keys())


class TestSceneFactory:
    def test_default_call_matches_golden_base_defaults(self):
        scene = _scene()
        assert scene["mode"] == "global"
        assert scene["selectedJourneyId"] is None
        assert scene["journeyMap"] == _GOLDEN_SCENE_BASE["journeyMap"]
        assert scene["signals"] == _GOLDEN_SCENE_BASE["signals"]

    def test_mode_and_selected_journey_id_are_overridable(self):
        scene = _scene(mode="focused", selected_journey_id="sample-journey-alpha")
        assert scene["mode"] == "focused"
        assert scene["selectedJourneyId"] == "sample-journey-alpha"

    def test_empty_overrides_produce_empty_lists_not_none(self):
        scene = _scene(journey_map=[], signals=[])
        assert scene["journeyMap"] == []
        assert scene["signals"] == []

    def test_omitted_overrides_fall_back_to_golden_base(self):
        scene = _scene(mode="focused")
        assert scene["journeyMap"] == _GOLDEN_SCENE_BASE["journeyMap"]
        assert scene["signals"] == _GOLDEN_SCENE_BASE["signals"]

    def test_returned_scenes_do_not_share_mutable_state(self):
        first = _scene()
        first["journeyMap"].append({"id": "mutated-in-place"})
        second = _scene()
        assert second["journeyMap"] == _GOLDEN_SCENE_BASE["journeyMap"]

    def test_golden_base_itself_is_never_mutated_by_factory_calls(self):
        before = len(_GOLDEN_SCENE_BASE["signals"])
        scene = _scene()
        scene["signals"].append({"kind": "task", "title": "mutated", "journey": ""})
        assert len(_GOLDEN_SCENE_BASE["signals"]) == before


class TestMentionsHelper:
    def test_matches_in_title(self):
        assert _mentions({"title": "A Global Orientation"}, "global") is True

    def test_matches_in_summary(self):
        assert _mentions({"summary": "This covers thin signals."}, "thin") is True

    def test_matches_in_next(self):
        assert _mentions({"next": "Uncertain next move."}, "uncertain") is True

    def test_matches_inside_output_signals_list(self):
        payload = {"signals": ["Sample conversation one", "Sample memory one"]}
        assert _mentions(payload, "memory one") is True

    def test_is_case_insensitive(self):
        assert _mentions({"title": "GLOBAL Scene"}, "global") is True

    def test_no_match_returns_false(self):
        assert _mentions({"title": "Focused Scene", "summary": "grounded"}, "global") is False

    def test_any_of_multiple_tokens_matches(self):
        payload = {"summary": "Signals are limited right now."}
        assert _mentions(payload, "thin", "limited", "uncertain") is True

    def test_empty_payload_returns_false_without_raising(self):
        assert _mentions({}) is False
        assert _mentions({}, "global") is False
