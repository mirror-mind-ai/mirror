"""Tests for durable Builder Workbench storage."""

import pytest

from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor


def test_create_and_list_refinement_stories_by_journey(store):
    first = store.create_refinement_story(journey="mirror", title="Builder polish")
    second = store.create_refinement_story(
        journey="mirror",
        title="Lifecycle safety",
        description="Protect plan artifacts",
        status="open",
        source="dogfood",
        provenance="CV20.DS6",
    )
    store.create_refinement_story(journey="other", title="Other work")

    stories = store.list_refinement_stories("mirror")

    assert [story.id for story in stories] == [first.id, second.id]
    assert stories[0].status == "draft"
    assert stories[0].position == 0
    assert stories[1].position == 1
    assert stories[1].description == "Protect plan artifacts"
    assert stories[1].source == "dogfood"
    assert store.list_refinement_stories("mirror", status="open") == (second,)


def test_create_and_attach_change_requests_with_stable_ordering(store):
    story = store.create_refinement_story(journey="mirror", title="Builder polish")
    unassigned = store.create_change_request(
        journey="mirror",
        title="Show roadmap after Done",
        body="Render a roadmap-position surface after Done.",
    )
    attached = store.create_change_request(
        journey="mirror",
        title="Preserve plan content",
        body="Do not overwrite human-authored plans.",
        refinement_story_id=story.id,
        source="dogfood",
    )

    moved = store.attach_change_request_to_story(unassigned.id, story.id)

    assert attached.position == 0
    assert moved.refinement_story_id == story.id
    assert moved.position == 1
    assert [cr.id for cr in store.list_change_requests("mirror", refinement_story_id=story.id)] == [
        attached.id,
        moved.id,
    ]
    assert store.list_change_requests(
        "mirror", refinement_story_id=story.id, status="captured"
    ) == (
        attached,
        moved,
    )


def test_change_request_association_rejects_cross_journey_story(store):
    story = store.create_refinement_story(journey="mirror", title="Builder polish")
    change_request = store.create_change_request(
        journey="sandbox", title="Sandbox CR", body="Different journey."
    )

    with pytest.raises(ValueError, match="different journey"):
        store.attach_change_request_to_story(change_request.id, story.id)


def test_update_refinement_story_status_records_pull_time(store):
    story = store.create_refinement_story(journey="mirror", title="Builder polish")

    updated = store.update_refinement_story_status(
        story.id, "active", pulled_at="2026-06-17T00:00:00Z"
    )

    assert updated.status == "active"
    assert updated.pulled_at == "2026-06-17T00:00:00Z"
    assert updated.updated_at != story.updated_at


def test_refinement_cursor_is_independent_from_delivery_cursor(store):
    story = store.create_refinement_story(journey="mirror", title="Builder polish")
    change_request = store.create_change_request(
        journey="mirror",
        title="Plan safety",
        body="Protect existing plan artifacts.",
        refinement_story_id=story.id,
    )
    set_delivery_cursor(
        store,
        journey="mirror",
        method="ariad",
        active_item="CV20.DS6.TS1",
        last_delivery_event="plan_approved",
    )

    cursor = store.set_refinement_cursor(
        journey="mirror",
        active_refinement_story_id=story.id,
        active_change_request_id=change_request.id,
        last_refinement_event="captured",
    )

    assert cursor.active_refinement_story_id == story.id
    assert cursor.active_change_request_id == change_request.id
    assert cursor.last_refinement_event == "captured"
    delivery_cursor = get_delivery_cursor(store, "mirror")
    assert delivery_cursor is not None
    assert delivery_cursor.active_item == "CV20.DS6.TS1"

    store.clear_refinement_cursor("mirror")

    assert store.get_refinement_cursor("mirror") is None
    assert get_delivery_cursor(store, "mirror") is not None
