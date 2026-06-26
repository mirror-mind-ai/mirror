"""Tests for Soul Mode surfaces."""

import pytest

from memory.surfaces.soul import (
    SoulListeningOption,
    render_active_rite,
    render_closing_rite,
    render_enrichment_proposal,
    render_fruit_in_maturation,
    render_harvested_fruit,
    render_identity_change_applied,
    render_integration_review,
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
    assert "listening for" not in rendered
    assert "what remains true without proof" not in rendered
    assert "FRUIT IN MATURATION" not in rendered


def test_active_rite_renders_shadow_voice_defaults():
    rendered = render_active_rite("shadow")

    assert "◐  SHADOW VOICE LISTENING" in rendered
    assert "if they depend on me, they cannot" in rendered
    assert "forget me" in rendered
    assert "the protection inside control" not in rendered
    assert "HARVESTED FRUIT" not in rendered


def test_active_rite_renders_custom_utterance_and_focus():
    rendered = render_active_rite(
        "self",
        utterance="silence is not exile",
        listening_for="the fact before the fear",
    )

    assert "silence is not exile" in rendered
    assert "the fact before the fear" not in rendered


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


def test_active_rite_converts_escaped_newlines_in_voice_response():
    rendered = render_active_rite(
        "wisdom",
        utterance="Escuta.\\n\\nA árvore lembra a raiz.",
    )

    assert "Escuta." in rendered
    assert "A árvore lembra a raiz." in rendered
    assert "\\n" not in rendered
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


def test_active_rite_renders_beauty_voice_utterance_without_listening_for():
    rendered = render_active_rite(
        "beauty",
        utterance=(
            "A small lamp remains lit.\n\nIt does not deny the dark; it gives the dark a room."
        ),
        listening_for="the form of aliveness",
    )

    assert "✺  BEAUTY VOICE LISTENING" in rendered
    assert "A small lamp remains lit" in rendered
    assert "It does not deny the dark" in rendered
    assert "listening for" not in rendered
    assert "the form of aliveness" not in rendered


def test_active_rite_requires_beauty_voice_utterance():
    with pytest.raises(ValueError, match="Beauty Voice requires"):
        render_active_rite("beauty")


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
    assert "save to journal as it is" in rendered
    assert "or change anything first?" in rendered
    assert "FRUIT IN MATURATION" not in rendered


def test_harvested_fruit_rejects_empty_fruit():
    with pytest.raises(ValueError, match="fruit must not be empty"):
        render_harvested_fruit(" ")


def test_closing_rite_renders_all_sections():
    rendered = render_closing_rite(
        harvested="A clear fruit became visible.",
        echoes="A quiet sentence still echoes.",
        remains_open="A question about belonging remains open.",
        integration="This may later belong to Self.",
    )

    assert "☾  CLOSING RITE" in rendered
    assert "what was harvested" in rendered
    assert "A clear fruit became visible." in rendered
    assert "what still echoes" in rendered
    assert "A quiet sentence still echoes." in rendered
    assert "what remains open" in rendered
    assert "A question about belonging remains" in rendered
    assert "what may want integration" in rendered
    assert "This may later belong to Self." in rendered
    assert "save to journal?" not in rendered


def test_closing_rite_omits_empty_sections():
    rendered = render_closing_rite(harvested="A clear fruit.", echoes=" ")

    assert "☾  CLOSING RITE" in rendered
    assert "what was harvested" in rendered
    assert "A clear fruit." in rendered
    assert "what still echoes" not in rendered
    assert "what remains open" not in rendered
    assert "what may want integration" not in rendered


def test_closing_rite_requires_at_least_one_section():
    with pytest.raises(ValueError, match="at least one closing section"):
        render_closing_rite()


def test_closing_rite_converts_escaped_newlines():
    rendered = render_closing_rite(harvested="First line.\\n\\nSecond line.")

    assert "First line." in rendered
    assert "Second line." in rendered
    assert "\\n" not in rendered
    assert "│                                        │" in rendered


def test_integration_review_renders_all_sections():
    rendered = render_integration_review(
        journal="The fruit was saved as journal.",
        self_material="Commitment may belong to truth rather than image management.",
        shadow="A part fears being seen as careless without over-availability.",
        ego="Staying late can become image management.",
        persona="The committed professional persona may overperform availability.",
        leave_open="How to sustain measure under uncertain gaze.",
    )

    assert "☾  INTEGRATION PROPOSAL" in rendered
    assert "origin" in rendered
    assert "The fruit was saved as journal." in rendered
    assert "self" in rendered
    assert "Commitment may belong to truth" in rendered
    assert "shadow" in rendered
    assert "A part fears being seen" in rendered
    assert "ego behavior" in rendered
    assert "Staying late can become image" in rendered
    assert "persona" in rendered
    assert "committed professional persona" in rendered
    assert "leave open" in rendered
    assert "How to sustain measure" in rendered
    assert "proposal only — nothing changed" in rendered


def test_integration_review_omits_empty_sections():
    rendered = render_integration_review(self_material="A possible Self principle.", shadow=" ")

    assert "☾  INTEGRATION PROPOSAL" in rendered
    assert "self" in rendered
    assert "A possible Self principle." in rendered
    assert "shadow" not in rendered
    assert "origin" not in rendered
    assert "proposal only — nothing changed" in rendered


def test_integration_review_requires_at_least_one_section():
    with pytest.raises(ValueError, match="at least one integration review section"):
        render_integration_review()


def test_enrichment_proposal_renders_self_proposal():
    rendered = render_enrichment_proposal(
        "self",
        key="soul",
        origin="Soul Mode harvest 88ae2650",
        current="Existing Self material.",
        proposed="Commitment belongs to truth, not image management.",
        why="This names a principle that may deserve to remain.",
    )

    assert "✦  SELF ENRICHMENT PROPOSAL" in rendered
    assert "target" in rendered
    assert "self/soul" in rendered
    assert "origin" in rendered
    assert "Soul Mode harvest" in rendered
    assert "current" in rendered
    assert "Existing Self material." in rendered
    assert "proposed" in rendered
    assert "Commitment belongs to truth" in rendered
    assert "why this may belong" in rendered
    assert "This names a principle that may" in rendered
    assert "deserve to remain." in rendered
    assert "proposal only — no identity changed" in rendered


def test_enrichment_proposal_renders_supported_layer_icons():
    assert "◐  SHADOW ENRICHMENT PROPOSAL" in render_enrichment_proposal(
        "shadow", key="profile", origin="O", current=None, proposed="P", why="W"
    )
    assert "◇  EGO ENRICHMENT PROPOSAL" in render_enrichment_proposal(
        "ego", key="behavior", origin="O", current=None, proposed="P", why="W"
    )
    assert "◈  PERSONA ENRICHMENT PROPOSAL" in render_enrichment_proposal(
        "persona", key="professional", origin="O", current=None, proposed="P", why="W"
    )


def test_enrichment_proposal_rejects_missing_content():
    with pytest.raises(ValueError, match="proposal content must not be empty"):
        render_enrichment_proposal(
            "self",
            key="soul",
            origin="Soul Mode harvest",
            current=None,
            proposed=" ",
            why="Because.",
        )


def test_identity_change_applied_renders_confirmed_update():
    rendered = render_identity_change_applied(
        "self",
        key="soul",
        content="Commitment belongs to truth, not image management.",
    )

    assert "✦  SELF IDENTITY UPDATED" in rendered
    assert "target" in rendered
    assert "self/soul" in rendered
    assert "applied" in rendered
    assert "Commitment belongs to truth" in rendered
