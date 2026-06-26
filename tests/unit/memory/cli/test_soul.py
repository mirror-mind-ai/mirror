"""Tests for Soul Mode CLI context loader."""

import json

import numpy as np

from memory import MemoryClient
from memory.cli import soul
from memory.config import default_db_path_for_home
from memory.models import Conversation, Message
from memory.services.operating_mode import get_active_mode

JOURNEY_CONTENT = """# Mirror Soul Mode
**Status:** active

## Description
A journey for Soul Mode behavior.
"""


def test_soul_load_activates_soul_mode_for_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mem.set_identity("journey", "soul-mode", JOURNEY_CONTENT)
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_load("soul-mode")

    state = get_active_mode(mem.store)
    assert state is not None
    assert state.mode == "Soul Mode"
    assert state.journey == "soul-mode"
    assert state.label == "☾ Soul Mode"
    persona, journey = mem.store.get_global_sticky_defaults()
    assert persona is None
    assert journey == "soul-mode"
    assert mem.store.list_recent_conversation_summaries(limit=10) == []
    out = capsys.readouterr().out
    assert "☾  SOUL MODE ACTIVE" in out
    assert "✦  IN ORDER TO" in out
    assert "remember who you are" in out
    assert "▹  START BY ANSWERING" in out
    assert "how is your day going today?" in out


def test_soul_load_can_activate_without_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_load()

    state = get_active_mode(mem.store)
    assert state is not None
    assert state.mode == "Soul Mode"
    assert state.journey is None
    persona, journey = mem.store.get_global_sticky_defaults()
    assert persona is None
    assert journey is None
    out = capsys.readouterr().out
    assert "☾  SOUL MODE ACTIVE" in out
    assert "active journey" not in out


def test_soul_load_rejects_unknown_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    try:
        soul.cmd_load("unknown")
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "journey 'unknown' not found" in capsys.readouterr().err


def test_soul_listen_renders_possible_listenings(capsys):
    soul.cmd_listen(
        self_description="recognize the principle that wants to be preserved",
        shadow_description="listen to the part that wants to be necessary",
        wisdom_description="be crossed by an idea about value and recognition",
        beauty_description=None,
    )

    out = capsys.readouterr().out
    assert "✧  POSSIBLE LISTENINGS" in out
    assert "✦ Self Voice" in out
    assert "recognize the principle" in out
    assert "◐ Shadow Voice" in out
    assert "listen to the part" in out
    assert "♢ Wisdom Voice" in out
    assert "be crossed by an idea" in out
    assert "Say if you want to hear one of" in out
    assert "or just continue the" in out
    assert "conversation." in out
    assert "FRUIT IN MATURATION" not in out
    assert "HARVESTED FRUIT" not in out


def test_soul_listen_rejects_empty_option_set(capsys):
    try:
        soul.cmd_listen()
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "at least one listening option" in capsys.readouterr().err


def test_soul_rite_renders_self_voice(capsys):
    soul.cmd_rite("self")

    out = capsys.readouterr().out
    assert "✦  SELF VOICE LISTENING" in out
    assert "the voice says" in out
    assert "usefulness can remain a gift" in out
    assert "what remains true without proof" not in out
    assert "FRUIT IN MATURATION" not in out
    assert "HARVESTED FRUIT" not in out


def test_soul_rite_renders_shadow_voice(capsys):
    soul.cmd_rite("shadow")

    out = capsys.readouterr().out
    assert "◐  SHADOW VOICE LISTENING" in out
    assert "if they depend on me" in out
    assert "the protection inside control" not in out


def test_soul_rite_renders_wisdom_voice_without_listening_for(capsys):
    soul.cmd_rite(
        "wisdom",
        utterance=(
            "Listen.\n\n"
            "The mountain does not descend to bargain with the valley.\n\n"
            "What is rooted does not ask the wind for permission."
        ),
        listening_for="the lesson already present",
    )

    out = capsys.readouterr().out
    assert "♢  WISDOM VOICE LISTENING" in out
    assert "The mountain does not descend" in out
    assert "What is rooted does not ask" in out
    assert "listening for" not in out
    assert "the lesson already present" not in out


def test_soul_rite_rejects_wisdom_without_utterance(capsys):
    try:
        soul.cmd_rite("wisdom")
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "Wisdom Voice requires" in capsys.readouterr().err


def test_soul_rite_renders_beauty_voice_without_listening_for(capsys):
    soul.cmd_rite(
        "beauty",
        utterance=(
            "A small lamp remains lit.\n\nIt does not deny the dark; it gives the dark a room."
        ),
        listening_for="the form of aliveness",
    )

    out = capsys.readouterr().out
    assert "✺  BEAUTY VOICE LISTENING" in out
    assert "A small lamp remains lit" in out
    assert "It does not deny the dark" in out
    assert "listening for" not in out
    assert "the form of aliveness" not in out


def test_soul_rite_rejects_beauty_without_utterance(capsys):
    try:
        soul.cmd_rite("beauty")
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "Beauty Voice requires" in capsys.readouterr().err


def test_soul_rite_rejects_unsupported_voice(capsys):
    try:
        soul.cmd_rite("unknown")
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "unsupported active rite voice" in capsys.readouterr().err


def test_soul_close_renders_closing_rite(capsys):
    soul.cmd_close(
        harvested="A clear fruit became visible.",
        echoes="A quiet sentence still echoes.",
        remains_open="A question about belonging remains open.",
        integration="This may later belong to Self.",
    )

    out = capsys.readouterr().out
    assert "☾  CLOSING RITE" in out
    assert "what was harvested" in out
    assert "A clear fruit became visible." in out
    assert "what still echoes" in out
    assert "A quiet sentence still echoes." in out
    assert "what remains open" in out
    assert "A question about belonging remains" in out
    assert "what may want integration" in out
    assert "This may later belong to Self." in out
    assert "Harvest saved to journal" not in out


def test_soul_close_rejects_empty_closing_rite(capsys):
    try:
        soul.cmd_close()
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "at least one closing section" in capsys.readouterr().err


def test_soul_review_renders_integration_proposal(capsys):
    soul.cmd_review(
        journal="The fruit was saved as journal.",
        self_material="Commitment may belong to truth rather than image management.",
        shadow="A part fears being seen as careless without over-availability.",
        ego="Staying late can become image management.",
        persona="The committed professional persona may overperform availability.",
        leave_open="How to sustain measure under uncertain gaze.",
    )

    out = capsys.readouterr().out
    assert "☾  INTEGRATION PROPOSAL" in out
    assert "origin" in out
    assert "The fruit was saved as journal." in out
    assert "self" in out
    assert "Commitment may belong to truth" in out
    assert "shadow" in out
    assert "A part fears being seen" in out
    assert "ego behavior" in out
    assert "Staying late can become image" in out
    assert "persona" in out
    assert "committed professional persona" in out
    assert "leave open" in out
    assert "How to sustain measure" in out
    assert "proposal only — nothing changed" in out
    assert "journey" not in out.lower()


def test_soul_review_rejects_empty_review(capsys):
    try:
        soul.cmd_review()
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "at least one integration review section" in capsys.readouterr().err


def test_soul_propose_renders_enrichment_proposal(capsys):
    soul.cmd_propose(
        "self",
        origin="Soul Mode harvest 88ae2650",
        current="Existing Self material.",
        proposed="Commitment belongs to truth, not image management.",
        why="This names a principle that may deserve to remain.",
    )

    out = capsys.readouterr().out
    assert "✦  SELF ENRICHMENT PROPOSAL" in out
    assert "self/soul" in out
    assert "Soul Mode harvest" in out
    assert "Existing Self material." in out
    assert "Commitment belongs to truth" in out
    assert "proposal only — no identity changed" in out


def test_soul_propose_requires_persona_key(capsys):
    try:
        soul.cmd_propose(
            "persona",
            origin="Soul Mode harvest",
            proposed="A professional persona pattern.",
            why="It belongs to presentation style.",
        )
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "persona proposals require --key" in capsys.readouterr().err


def test_soul_apply_requires_confirmation(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    try:
        soul.cmd_apply("self", proposed="New Self content.")
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "requires --confirm APPLY" in capsys.readouterr().err
    assert mem.get_identity("self", "soul") is None


def test_soul_apply_appends_identity_integration_after_confirmation(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mem.set_identity("self", "soul", "Existing Self material.")
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_apply(
        "self",
        proposed="I care for bonds without turning immediate availability into moral proof of love.",
        confirm="APPLY",
        origin="Soul Mode harvest",
    )

    out = capsys.readouterr().out
    assert "✦  SELF IDENTITY UPDATED" in out
    assert "self/soul" in out
    assert "I care for bonds" in out
    content = mem.get_identity("self", "soul")
    assert content is not None
    assert content.startswith("Existing Self material.")
    assert "## New Incorporated Principles" in content
    assert "- [" in content
    assert "I care for bonds" in content
    integrations = mem.store.list_identity_integrations(layer="self", key="soul")
    assert len(integrations) == 1
    assert integrations[0].content.startswith("I care for bonds")
    assert integrations[0].origin == "Soul Mode harvest"


def test_soul_fruit_set_stores_and_renders_fruit(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_fruit("set", "Belonging cannot be bought by becoming necessary.")

    out = capsys.readouterr().out
    assert "❦  FRUIT IN MATURATION" in out
    assert "Belonging cannot be bought by" in out
    assert "becoming necessary." in out
    assert "continue if you want to mature more" in out
    assert mem.store.list_recent_conversation_summaries(limit=10) == []


def test_soul_fruit_show_renders_stored_fruit(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_fruit("set", "First fruit.")
    capsys.readouterr()
    soul.cmd_fruit("show")

    assert "First fruit." in capsys.readouterr().out


def test_soul_fruit_set_replaces_previous_fruit(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_fruit("set", "First fruit.")
    soul.cmd_fruit("set", "Second fruit.")
    capsys.readouterr()
    soul.cmd_fruit("show")

    out = capsys.readouterr().out
    assert "Second fruit." in out
    assert "First fruit." not in out


def test_soul_fruit_clear_removes_stored_fruit(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_fruit("set", "A fruit.")
    capsys.readouterr()
    soul.cmd_fruit("clear")
    out = capsys.readouterr().out

    assert "Fruit in maturation cleared." in out


def test_soul_fruit_show_without_fruit_exits_cleanly(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    try:
        soul.cmd_fruit("show")
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")

    assert "No fruit in maturation." in capsys.readouterr().err


def test_soul_harvest_set_closes_fruit_and_renders_harvest(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_fruit("set", "A provisional fruit.")
    capsys.readouterr()
    soul.cmd_harvest("set", "A final fruit.")

    out = capsys.readouterr().out
    assert "❦  HARVESTED FRUIT" in out
    assert "A final fruit." in out
    assert "save to journal as it is" in out
    assert "or change anything first?" in out
    from memory.services.soul import get_fruit_in_maturation

    assert get_fruit_in_maturation(mem.store).fruit is None


def test_soul_harvest_save_creates_one_journal_entry(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)
    mocker.patch(
        "memory.services.memory.generate_embedding", return_value=np.array([0.0, 0.1, 0.2])
    )

    soul.cmd_harvest("set", "A final fruit.")
    capsys.readouterr()
    soul.cmd_harvest("save", journey="soul-mode")

    out = capsys.readouterr().out
    assert "Harvest saved to journal." in out
    entries = mem.get_by_type("journal")
    assert len(entries) == 1
    assert not entries[0].content.startswith("# A final fruit\n")
    assert entries[0].content.startswith("Esta entrada nasceu de uma colheita")
    assert "## Fruto" in entries[0].content
    assert "> A final fruit." in entries[0].content
    assert entries[0].title == "A final fruit"
    assert entries[0].layer == "self"
    assert entries[0].journey == "soul-mode"
    assert json.loads(entries[0].metadata or "{}") == {
        "format": "markdown",
        "origin": {
            "mode": "soul",
            "conversation_id": None,
            "conversation_uri": None,
        },
        "harvested_fruit": "A final fruit.",
    }

    try:
        soul.cmd_harvest("save", journey="soul-mode")
    except SystemExit as exc:
        assert exc.code == 1
    else:  # pragma: no cover
        raise AssertionError("expected SystemExit")
    assert len(mem.get_by_type("journal")) == 1


def test_soul_harvest_save_links_active_runtime_conversation(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)
    mocker.patch(
        "memory.services.memory.generate_embedding", return_value=np.array([0.0, 0.1, 0.2])
    )
    conv = mem.store.create_conversation(
        Conversation(id="conv-1", interface="pi", title="Soul conversation")
    )
    mem.store.add_message(
        Message(
            conversation_id=conv.id,
            role="user",
            content="há algo em mim que respira quando o pacto com o dia está claro",
        )
    )
    mem.store.add_message(
        Message(
            conversation_id=conv.id,
            role="assistant",
            content="A clareza me devolve corpo.",
        )
    )
    mem.store.upsert_runtime_session(
        "session-1",
        conversation_id=conv.id,
        interface="pi",
        active=True,
    )

    soul.cmd_harvest(
        "set",
        "Há algo em mim que respira quando o pacto com o dia está claro.",
    )
    capsys.readouterr()
    soul.cmd_harvest("save")

    entries = mem.get_by_type("journal")
    assert len(entries) == 1
    entry = entries[0]
    assert entry.conversation_id == "conv-1"
    assert entry.title == "Há algo em mim que respira quando o pacto com o dia está claro"
    assert "[Conversa originária](mirror://conversation/conv-1)" in entry.content
    assert "## Material vivo da conversa" in entry.content
    assert "há algo em mim que respira" in entry.content
    assert "A clareza me devolve corpo." in entry.content
    metadata = json.loads(entry.metadata or "{}")
    assert metadata["origin"] == {
        "mode": "soul",
        "conversation_id": "conv-1",
        "conversation_uri": "mirror://conversation/conv-1",
    }


def test_soul_harvest_decline_clears_without_journal(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_harvest("set", "A final fruit.")
    capsys.readouterr()
    soul.cmd_harvest("decline")

    assert "Harvest discarded without journal save." in capsys.readouterr().out
    assert mem.get_by_type("journal") == []


def test_soul_prompt_self_renders_composed_prompt(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    mem = MemoryClient(db_path=default_db_path_for_home(mirror_home))
    mem.set_identity("self", "soul", "# Alma\n\nDiante da urgência, não acelero.")
    mocker.patch("memory.cli.soul.MemoryClient", return_value=mem)

    soul.cmd_prompt("self")

    out = capsys.readouterr().out
    assert "# Soul Mode — Self Voice Prompt" in out
    assert "Diante da urgência, não acelero" in out
    assert "A one-line aphorism is too thin" in out
    assert "{user_self_identity}" not in out


def test_soul_prompt_wisdom_renders_canonical_prompt(capsys):
    soul.cmd_prompt("wisdom")

    out = capsys.readouterr().out
    assert "# Soul Mode — Wisdom Voice Prompt" in out
    assert "philosophers, sacred books" in out
    assert "5 to 8 compact paragraphs" in out
    assert "Do not include a separate `listening for` section" in out
    assert "You are the Ancestral Voice" in out
    assert "Do not explain. Affirm." in out
    assert "central image, metaphor, symbol" in out
    assert "Mirror's normal tone" in out
    assert "who said it, where it appears" in out
    assert "fabricate citation details" in out
    assert "recommend a next step" in out


def test_soul_prompt_beauty_renders_canonical_prompt(capsys):
    soul.cmd_prompt("beauty")

    out = capsys.readouterr().out
    assert "# Soul Mode — Beauty Voice Prompt" in out
    assert "form of aliveness" in out
    assert "4 to 6 compact paragraphs" in out
    assert "Do not include a separate `listening for` section" in out
    assert "poetry, literature, music" in out
    assert "Mirror's normal tone" in out
    assert "force positivity" in out
