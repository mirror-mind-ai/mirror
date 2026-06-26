import pytest

from memory import MemoryClient
from memory.builder.delivery_cursor import (
    BuilderDeliveryCursor,
    clear_delivery_cursor,
    get_delivery_cursor,
    render_delivery_cursor_sync_report,
    set_delivery_cursor,
)
from memory.config import default_db_path_for_home


def _store(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    client = MemoryClient(env="test", db_path=db_path)
    return client, client.store


def test_get_delivery_cursor_returns_none_when_empty(tmp_path):
    _client, store = _store(tmp_path)

    assert get_delivery_cursor(store, "sandbox-pet-store") is None


def test_set_and_get_delivery_cursor(tmp_path):
    _client, store = _store(tmp_path)

    cursor = set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        last_delivery_event="template_preparation",
    )

    assert cursor == BuilderDeliveryCursor(
        journey="sandbox-pet-store",
        method="ariad",
        active_item=None,
        active_checkpoint=None,
        pending_confirmation=None,
        last_delivery_event="template_preparation",
    )
    assert get_delivery_cursor(store, "sandbox-pet-store") == cursor


def test_set_and_get_delivery_story_lifecycle_state(tmp_path):
    _client, store = _store(tmp_path)

    cursor = set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        child_work_items=("CV20.DS5.US1", "CV20.DS5.TS1"),
        aggregate_checkpoint_status=("plan:pending", "validation:not_started"),
    )

    assert cursor.child_work_items == ("CV20.DS5.US1", "CV20.DS5.TS1")
    assert cursor.aggregate_checkpoint_status == ("plan:pending", "validation:not_started")
    assert get_delivery_cursor(store, "sandbox-pet-store") == cursor


def test_set_delivery_cursor_is_idempotent(tmp_path):
    _client, store = _store(tmp_path)

    first = set_delivery_cursor(store, journey="sandbox-pet-store", method="ariad")
    second = set_delivery_cursor(store, journey="sandbox-pet-store", method="ariad")

    assert second == first
    assert get_delivery_cursor(store, "sandbox-pet-store") == first


def test_delivery_cursor_separates_journeys(tmp_path):
    _client, store = _store(tmp_path)

    set_delivery_cursor(store, journey="one", method="ariad", active_item="CV1")
    set_delivery_cursor(store, journey="two", method="ariad", active_item="CV2")

    one = get_delivery_cursor(store, "one")
    two = get_delivery_cursor(store, "two")
    assert one is not None
    assert two is not None
    assert one.active_item == "CV1"
    assert two.active_item == "CV2"


def test_clear_delivery_cursor(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(store, journey="sandbox-pet-store", method="ariad")

    clear_delivery_cursor(store, "sandbox-pet-store")

    assert get_delivery_cursor(store, "sandbox-pet-store") is None


def test_delivery_cursor_rejects_empty_journey_or_method(tmp_path):
    _client, store = _store(tmp_path)

    with pytest.raises(ValueError, match="journey"):
        set_delivery_cursor(store, journey=" ", method="ariad")
    with pytest.raises(ValueError, match="method"):
        set_delivery_cursor(store, journey="sandbox-pet-store", method=" ")


def test_render_delivery_cursor_sync_report():
    cursor = BuilderDeliveryCursor(
        journey="sandbox-pet-store",
        method="ariad",
        active_item=None,
        active_checkpoint=None,
        pending_confirmation=None,
        last_delivery_event="template_preparation",
    )

    rendered = render_delivery_cursor_sync_report(cursor)

    assert "Builder Delivery Cursor Synced" in rendered
    assert "journey\nsandbox-pet-store" in rendered
    assert "method\nariad" in rendered
    assert "active item\nnone" in rendered
    assert "last delivery event\ntemplate_preparation" in rendered
    assert "child work items\nnone" in rendered
    assert "aggregate checkpoint status\nnone" in rendered
    assert "No story lifecycle work was executed" in rendered
