"""Tests for Soul Mode prompt composition."""

from memory import MemoryClient
from memory.config import default_db_path_for_home
from memory.services.soul_prompt import (
    compose_soul_beauty_voice_prompt,
    compose_soul_self_voice_prompt,
    compose_soul_wisdom_voice_prompt,
)


def _mem(tmp_path):
    mirror_home = tmp_path / ".mirror" / "alisson-vale"
    return MemoryClient(db_path=default_db_path_for_home(mirror_home))


def test_self_voice_prompt_injects_user_self_identity(tmp_path):
    mem = _mem(tmp_path)
    mem.set_identity(
        "self",
        "soul",
        "# Alma\n\nDiante da urgência, não acelero. Diante do silêncio, não preencho.",
    )

    prompt = compose_soul_self_voice_prompt(mem)

    assert "# Soul Mode — Self Voice Prompt" in prompt
    assert "Diante da urgência, não acelero" in prompt
    assert "Diante do silêncio, não preencho" in prompt
    assert "A one-line aphorism is too thin" in prompt
    assert "{user_self_identity}" not in prompt


def test_self_voice_prompt_uses_fallback_when_identity_is_missing(tmp_path):
    mem = _mem(tmp_path)

    prompt = compose_soul_self_voice_prompt(mem)

    assert "No user Self identity layer is available yet" in prompt
    assert "{user_self_identity}" not in prompt


def test_wisdom_voice_prompt_is_canonical():
    prompt = compose_soul_wisdom_voice_prompt()

    assert "# Soul Mode — Wisdom Voice Prompt" in prompt
    assert "philosophers, sacred books" in prompt
    assert "5 to 8 compact paragraphs" in prompt
    assert "Do not include a separate `listening for` section" in prompt
    assert "You are the Ancestral Voice" in prompt
    assert "Do not explain. Affirm." in prompt
    assert "central image, metaphor, symbol" in prompt
    assert "Mirror's normal tone" in prompt
    assert "who said it, where it appears" in prompt
    assert "fabricate citation details" in prompt
    assert "recommend a next step" in prompt


def test_beauty_voice_prompt_is_canonical():
    prompt = compose_soul_beauty_voice_prompt()

    assert "# Soul Mode — Beauty Voice Prompt" in prompt
    assert "form of aliveness" in prompt
    assert "4 to 6 compact paragraphs" in prompt
    assert "Do not include a separate `listening for` section" in prompt
    assert "poetry, literature, music" in prompt
    assert "Mirror's normal tone" in prompt
    assert "force positivity" in prompt
