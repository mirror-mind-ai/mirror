"""Tests for Soul Mode surfaces."""

import pytest

from memory.surfaces.soul import (
    SoulListeningOption,
    render_active_rite,
    render_fruit_in_maturation,
    render_harvested_fruit,
    render_possible_listenings,
)


def test_possible_listenings_renders_situated_voice_options():
    rendered = render_possible_listenings(
        [
            SoulListeningOption(
                voice="self",
                description="recognize the principle that wants to be preserved",
            ),
            SoulListeningOption(
                voice="shadow",
                description="listen to the part that wants to be necessary",
            ),
            SoulListeningOption(
                voice="wisdom",
                description="be crossed by an idea about value and recognition",
            ),
            SoulListeningOption(
                voice="beauty",
                description="let beauty open presence around this tiredness",
            ),
        ]
    )

    assert "Soul Mode" in rendered
    assert "✧  POSSIBLE LISTENINGS" in rendered
    assert "✦ Self Voice" in rendered
    assert "recognize the principle" in rendered
    assert "◐ Shadow Voice" in rendered
    assert "listen to the part" in rendered
    assert "♢ Wisdom Voice" in rendered
    assert "be crossed by an idea" in rendered
    assert "✺ Beauty Voice" in rendered
    assert "let beauty open presence" in rendered
    assert "Say if you want to hear one of" in rendered
    assert "or just continue the" in rendered
    assert "conversation." in rendered


def test_possible_listenings_requires_at_least_one_option():
    with pytest.raises(ValueError, match="at least one"):
        render_possible_listenings([])


def test_possible_listenings_rejects_empty_descriptions():
    with pytest.raises(ValueError, match="descriptions must not be empty"):
        render_possible_listenings([SoulListeningOption(voice="self", description=" ")])


def test_possible_listenings_rejects_unknown_voice():
    with pytest.raises(ValueError, match="unknown listening voice"):
        render_possible_listenings([SoulListeningOption(voice="unknown", description="listen")])


def test_active_rite_renders_self_voice_defaults():
    rendered = render_active_rite("self")

    assert "Soul Mode" in rendered
    assert "✦  SELF VOICE LISTENING" in rendered
    assert "the voice says" in rendered
    assert "usefulness can remain a gift" in rendered
    assert "when it stops being payment for" in rendered
    assert "listening for" in rendered
    assert "what remains true without proof" in rendered
    assert "FRUIT IN MATURATION" not in rendered


def test_active_rite_renders_shadow_voice_defaults():
    rendered = render_active_rite("shadow")

    assert "◐  SHADOW VOICE LISTENING" in rendered
    assert "if they depend on me, they cannot" in rendered
    assert "forget me" in rendered
    assert "the protection inside control" in rendered
    assert "HARVESTED FRUIT" not in rendered


def test_active_rite_renders_custom_utterance_and_focus():
    rendered = render_active_rite(
        "self",
        utterance="silence is not exile",
        listening_for="the fact before the fear",
    )

    assert "silence is not exile" in rendered
    assert "the fact before the fear" in rendered


def test_active_rite_preserves_paragraph_breaks_in_voice_response():
    rendered = render_active_rite(
        "self",
        utterance=(
            "The silence is being treated as exile.\n\n"
            "But silence is only silence before fear turns it into a sentence."
        ),
        listening_for="the fact before the fear",
    )

    assert "The silence is being treated as" in rendered
    assert "exile." in rendered
    assert "But silence is only silence before" in rendered
    assert "fear turns it into a sentence." in rendered
    assert "│                                        │" in rendered


def test_active_rite_renders_wisdom_voice_utterance_without_listening_for():
    rendered = render_active_rite(
        "wisdom",
        utterance=(
            "Listen.\n\n"
            "The mountain does not descend to bargain with the valley.\n\n"
            "What is rooted does not ask the wind for permission."
        ),
        listening_for="the lesson already present",
    )

    assert "♢  WISDOM VOICE LISTENING" in rendered
    assert "The mountain does not descend" in rendered
    assert "What is rooted does not ask" in rendered
    assert "listening for" not in rendered
    assert "the lesson already present" not in rendered


def test_active_rite_requires_wisdom_voice_utterance():
    with pytest.raises(ValueError, match="Wisdom Voice requires"):
        render_active_rite("wisdom")


def test_active_rite_renders_beauty_voice_defaults():
    rendered = render_active_rite("beauty")

    assert "✺  BEAUTY VOICE LISTENING" in rendered
    assert "there is still care in the way this" in rendered
    assert "hurts" in rendered
    assert "the form of aliveness" in rendered


def test_active_rite_rejects_unsupported_voice():
    with pytest.raises(ValueError, match="unsupported active rite voice"):
        render_active_rite("unknown")


def test_fruit_in_maturation_renders_provisional_fruit():
    rendered = render_fruit_in_maturation(
        "Belonging cannot be bought by becoming necessary before anyone asks."
    )

    assert "❦  FRUIT IN MATURATION" in rendered
    assert "Belonging cannot be bought by" in rendered
    assert "becoming necessary before anyone" in rendered
    assert "asks." in rendered
    assert "continue if you want to mature more" in rendered
    assert "or say you wish to harvest" in rendered
    assert "HARVESTED FRUIT" not in rendered


def test_fruit_in_maturation_rejects_empty_fruit():
    with pytest.raises(ValueError, match="fruit must not be empty"):
        render_fruit_in_maturation(" ")


def test_harvested_fruit_renders_final_fruit():
    rendered = render_harvested_fruit(
        "Usefulness can remain a gift only when it stops being payment for belonging."
    )

    assert "❦  HARVESTED FRUIT" in rendered
    assert "Usefulness can remain a gift only" in rendered
    assert "when it stops being payment for" in rendered
    assert "belonging." in rendered
    assert "save to journal?" in rendered
    assert "FRUIT IN MATURATION" not in rendered


def test_harvested_fruit_rejects_empty_fruit():
    with pytest.raises(ValueError, match="fruit must not be empty"):
        render_harvested_fruit(" ")
