"""Tests for consult CLI behavior."""

import pytest

from memory import MemoryClient
from memory.config import default_db_path_for_home


def _seed_identity(mem):
    mem.set_identity("self", "soul", "soul")
    mem.set_identity("ego", "behavior", "behavior")
    mem.set_identity("ego", "identity", "ego")
    mem.set_identity("user", "identity", "user")


def test_consult_logs_call_to_ledger_with_fetched_cost(mocker, tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    _seed_identity(MemoryClient(env="test", db_path=db_path))

    mocker.patch("memory.services.observability.LOG_LLM_CALLS", True)
    mocker.patch("memory.services.observability.LOG_LLM_BODIES", False)

    def _fake_send(model_id, messages):
        return mocker.Mock(
            model=model_id,
            content="the reply",
            prompt='[{"role":"system","content":"SECRET IDENTITY CONTEXT"}]',
            prompt_tokens=1200,
            completion_tokens=300,
            latency_ms=88,
            generation_id="gen-1",
        )

    mocker.patch("memory.cli.consult.send_to_model", side_effect=_fake_send)
    mocker.patch("memory.cli.consult.fetch_generation_cost", return_value=0.0123)
    mocker.patch("memory.cli.consult.resolve_model", return_value="x-ai/grok-test")
    mocker.patch("memory.cli.consult.cmd_credits")

    from memory.cli.consult import main

    main(["grok", "hello", "--mirror-home", str(mirror_home)])

    reader = MemoryClient(env="test", db_path=db_path)
    rows = reader.store.get_llm_calls(role="consult")
    assert len(rows) == 1
    row = rows[0]
    assert row["model"] == "x-ai/grok-test"
    assert row["cost_usd"] == pytest.approx(0.0123)  # real fetched cost, not a static estimate
    assert row["prompt"] == ""  # identity context withheld in metadata mode
    assert row["response"] == ""
    assert row["prompt_tokens"] == 1200


def test_consult_off_mode_logs_nothing(mocker, tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    _seed_identity(MemoryClient(env="test", db_path=db_path))

    mocker.patch("memory.services.observability.LOG_LLM_CALLS", False)
    mocker.patch(
        "memory.cli.consult.send_to_model",
        return_value=mocker.Mock(
            model="m",
            content="ok",
            prompt="p",
            prompt_tokens=1,
            completion_tokens=1,
            latency_ms=1,
            generation_id="gen-1",
        ),
    )
    mocker.patch("memory.cli.consult.fetch_generation_cost", return_value=0.01)
    mocker.patch("memory.cli.consult.resolve_model", return_value="x-ai/grok-test")
    mocker.patch("memory.cli.consult.cmd_credits")

    from memory.cli.consult import main

    main(["grok", "hello", "--mirror-home", str(mirror_home)])

    reader = MemoryClient(env="test", db_path=db_path)
    assert reader.store.get_llm_calls(role="consult") == []


def test_consult_uses_context_from_explicit_mirror_home(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("self", "soul", "Scoped soul")
    mem.set_identity("ego", "behavior", "Scoped behavior")
    mem.set_identity("ego", "identity", "Scoped ego")
    mem.set_identity("user", "identity", "Scoped user")

    sent = {}

    def _fake_send(model_id, messages):
        sent["model_id"] = model_id
        sent["messages"] = messages
        return mocker.Mock(
            model=model_id,
            content="ok",
            prompt_tokens=None,
            completion_tokens=None,
            generation_id=None,
        )

    mocker.patch("memory.cli.consult.send_to_model", side_effect=_fake_send)
    mocker.patch("memory.cli.consult.resolve_model", return_value="openai/gpt-test")
    mocker.patch("memory.cli.consult.cmd_credits")

    from memory.cli.consult import main

    main(["openai", "What now?", "--mirror-home", str(mirror_home)])

    assert sent["model_id"] == "openai/gpt-test"
    assert "Scoped soul" in sent["messages"][0]["content"]
    captured = capsys.readouterr()
    assert "Consulting openai/gpt-test" in captured.out
    assert "ok" in captured.out


def test_consult_explicit_mirror_home_overrides_environment_selection(mocker, tmp_path):
    env_home = tmp_path / ".mirror" / "testuser"
    explicit_home = tmp_path / ".mirror" / "pati"

    env_mem = MemoryClient(env="test", db_path=default_db_path_for_home(env_home))
    env_mem.set_identity("self", "soul", "Env soul")
    env_mem.set_identity("ego", "behavior", "Env behavior")
    env_mem.set_identity("ego", "identity", "Env ego")
    env_mem.set_identity("user", "identity", "Env user")

    explicit_mem = MemoryClient(env="test", db_path=default_db_path_for_home(explicit_home))
    explicit_mem.set_identity("self", "soul", "Explicit soul")
    explicit_mem.set_identity("ego", "behavior", "Explicit behavior")
    explicit_mem.set_identity("ego", "identity", "Explicit ego")
    explicit_mem.set_identity("user", "identity", "Explicit user")

    sent = {}

    def _fake_send(model_id, messages):
        sent["messages"] = messages
        return mocker.Mock(
            model=model_id,
            content="ok",
            prompt_tokens=None,
            completion_tokens=None,
            generation_id=None,
        )

    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)
    mocker.patch("memory.cli.consult.send_to_model", side_effect=_fake_send)
    mocker.patch("memory.cli.consult.resolve_model", return_value="openai/gpt-test")
    mocker.patch("memory.cli.consult.cmd_credits")

    from memory.cli.consult import main

    main(["openai", "What now?", "--mirror-home", str(explicit_home)])

    system_prompt = sent["messages"][0]["content"]
    assert "Explicit soul" in system_prompt
    assert "Env soul" not in system_prompt
