import pytest

from memory import MemoryClient
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.lifecycle import BuilderLifecycleItem, pull_lifecycle_item
from memory.builder.release_intent import (
    inspect_release_intent,
    render_release_intent_report,
    set_release_intent,
)
from memory.config import default_db_path_for_home


def _store(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    client = MemoryClient(env="test", db_path=default_db_path_for_home(mirror_home))
    return client, client.store


@pytest.mark.parametrize("intent", ["planned", "none", "undecided"])
def test_set_release_intent_records_ds_level_non_authorizing_state(tmp_path, intent):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS7.US1",
        active_item_level="user_story",
        last_delivery_event="plan_approved",
    )

    report = set_release_intent(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        intent=intent,
    )

    assert report.delivery_story == "CV20.DS7"
    assert report.intent == intent
    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor.release_intent_delivery_story == "CV20.DS7"
    assert cursor.release_intent == intent
    rendered = render_release_intent_report(report)
    assert "<<<ARIAD:RELEASE_INTENT>>>" in rendered
    assert intent in rendered
    assert "does not authorize commit, push, tag" in rendered
    assert "creation, stable promotion, release publication, or" in rendered
    assert "remote mutation." in rendered


def test_release_intent_distinguishes_not_recorded_from_none(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS7.US1",
        active_item_level="user_story",
    )

    missing = inspect_release_intent(store, journey="sandbox-pet-store", method="ariad")
    set_release_intent(store, journey="sandbox-pet-store", method="ariad", intent="none")
    explicit_none = inspect_release_intent(store, journey="sandbox-pet-store", method="ariad")

    assert missing.intent == "not_recorded"
    assert explicit_none.intent == "none"


def test_release_intent_rejects_unknown_state_and_non_ds_item(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20",
        active_item_level="cv",
    )

    with pytest.raises(ValueError, match="active Delivery Story boundary"):
        set_release_intent(store, journey="sandbox-pet-store", method="ariad", intent="planned")

    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS7.US1",
        active_item_level="user_story",
    )
    with pytest.raises(ValueError, match="planned, none, or undecided"):
        set_release_intent(store, journey="sandbox-pet-store", method="ariad", intent="release-now")


def test_release_intent_survives_pulls_within_ds_and_clears_on_other_ds(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS7.US1",
        active_item_level="user_story",
    )
    set_release_intent(store, journey="sandbox-pet-store", method="ariad", intent="planned")

    same_ds = pull_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        item=BuilderLifecycleItem(
            code="CV20.DS7.US2",
            title="Show Release Intent Progress",
            level="user_story",
            why_now="next child",
        ),
    )
    other_ds = pull_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        item=BuilderLifecycleItem(
            code="CV20.DS8.US1",
            title="Record debt",
            level="user_story",
            why_now="next DS",
        ),
    )

    assert same_ds.cursor.release_intent == "planned"
    assert same_ds.cursor.release_intent_delivery_story == "CV20.DS7"
    assert other_ds.cursor.release_intent is None
    assert other_ds.cursor.release_intent_delivery_story is None
