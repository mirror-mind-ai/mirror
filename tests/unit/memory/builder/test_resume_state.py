from memory import MemoryClient
from memory.builder.delivery_cursor import set_delivery_cursor
from memory.builder.method_adoption import set_adopted_method
from memory.builder.resume_state import read_builder_resume_state
from memory.config import default_db_path_for_home


def _store(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    client = MemoryClient(env="test", db_path=db_path)
    return client, client.store


def test_resume_state_requires_adoption(tmp_path):
    _client, store = _store(tmp_path)

    state = read_builder_resume_state(store, "sandbox-pet-store")

    assert state.resumable is False
    assert state.reason == "adoption_required"
    assert state.adopted_method is None
    assert state.cursor is None
    assert state.allowed_next_actions == ("adopt_method", "inspect_method")


def test_resume_state_requires_cursor_after_adoption(tmp_path):
    _client, store = _store(tmp_path)
    set_adopted_method(store, "sandbox-pet-store", "ariad")

    state = read_builder_resume_state(store, "sandbox-pet-store")

    assert state.resumable is False
    assert state.reason == "cursor_sync_required"
    assert state.adopted_method == "ariad"
    assert state.cursor is None
    assert state.allowed_next_actions == ("sync_cursor", "inspect_method")


def test_resume_state_reads_adopted_method_and_cursor(tmp_path):
    _client, store = _store(tmp_path)
    set_adopted_method(store, "sandbox-pet-store", "ariad")
    cursor = set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        last_delivery_event="template_preparation",
    )

    state = read_builder_resume_state(store, "sandbox-pet-store")

    assert state.resumable is True
    assert state.reason is None
    assert state.adopted_method == "ariad"
    assert state.cursor == cursor
    assert "pull_next_story" in state.allowed_next_actions


def test_resume_state_pending_confirmation_constrains_next_actions(tmp_path):
    _client, store = _store(tmp_path)
    set_adopted_method(store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        pending_confirmation="navigator_approval",
    )

    state = read_builder_resume_state(store, "sandbox-pet-store")

    assert state.resumable is True
    assert state.allowed_next_actions == ("answer_pending_confirmation", "inspect_method")
