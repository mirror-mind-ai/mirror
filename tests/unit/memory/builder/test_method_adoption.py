import pytest

from memory import MemoryClient
from memory.builder.method_adoption import (
    BuilderMethodAdoption,
    clear_adopted_method,
    get_adopted_method,
    set_adopted_method,
)
from memory.config import default_db_path_for_home


def _client(tmp_path) -> MemoryClient:
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    return MemoryClient(env="test", db_path=db_path)


def test_get_adopted_method_returns_none_when_empty(tmp_path) -> None:
    client = _client(tmp_path)

    assert get_adopted_method(client.store, "builder-mode-evolution") is None


def test_set_adopted_method_can_be_read_back(tmp_path) -> None:
    client = _client(tmp_path)

    adoption = set_adopted_method(client.store, "builder-mode-evolution", "ariad")

    assert adoption == BuilderMethodAdoption(
        journey="builder-mode-evolution",
        method="ariad",
    )
    assert get_adopted_method(client.store, "builder-mode-evolution") == "ariad"


def test_set_adopted_method_is_idempotent_for_same_journey_and_method(tmp_path) -> None:
    client = _client(tmp_path)

    first = set_adopted_method(client.store, "builder-mode-evolution", "ariad")
    second = set_adopted_method(client.store, "builder-mode-evolution", "ariad")

    assert first == second
    assert get_adopted_method(client.store, "builder-mode-evolution") == "ariad"


def test_rejects_empty_journey(tmp_path) -> None:
    client = _client(tmp_path)

    with pytest.raises(ValueError, match="journey"):
        set_adopted_method(client.store, " ", "ariad")

    with pytest.raises(ValueError, match="journey"):
        get_adopted_method(client.store, " ")


def test_rejects_empty_method(tmp_path) -> None:
    client = _client(tmp_path)

    with pytest.raises(ValueError, match="method"):
        set_adopted_method(client.store, "builder-mode-evolution", " ")


def test_clear_adopted_method_removes_readable_method(tmp_path) -> None:
    client = _client(tmp_path)
    set_adopted_method(client.store, "builder-mode-evolution", "ariad")

    clear_adopted_method(client.store, "builder-mode-evolution")

    assert get_adopted_method(client.store, "builder-mode-evolution") is None


def test_different_journeys_keep_separate_adopted_methods(tmp_path) -> None:
    client = _client(tmp_path)

    set_adopted_method(client.store, "builder-mode-evolution", "ariad")
    set_adopted_method(client.store, "other-journey", "ariad")
    clear_adopted_method(client.store, "other-journey")

    assert get_adopted_method(client.store, "builder-mode-evolution") == "ariad"
    assert get_adopted_method(client.store, "other-journey") is None
