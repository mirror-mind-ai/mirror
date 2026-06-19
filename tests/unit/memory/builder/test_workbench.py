"""Tests for Builder Workbench domain helpers."""

from memory.builder.workbench import (
    attach_change_request_to_story,
    capture_change_request,
    close_refinement_story,
    coherence_refinement_story,
    complete_change_request,
    confirm_change_request,
    create_refinement_story,
    get_active_refinement_story_overview,
    get_refinement_story_overview,
    get_workbench_snapshot,
    mark_change_request_implemented,
    plan_change_request,
    pull_refinement_story,
    review_refinement_story,
    select_change_request,
    validate_change_request,
)
from memory.builder.workbench_surfaces import (
    render_change_request_captured_surface,
    render_refinement_story_overview_surface,
    render_refinement_story_pulled_surface,
)


def test_workbench_snapshot_reports_empty_durable_storage(store):
    snapshot = get_workbench_snapshot(store, "mirror")

    assert snapshot.storage_state == "implemented"
    assert snapshot.active_refinement_story is None
    assert snapshot.active_change_request is None
    assert snapshot.refinement_story_count == 0
    assert snapshot.change_request_count == 0
    assert snapshot.unassigned_change_request_count == 0


def test_workbench_snapshot_reports_counts_and_active_records(store):
    story = create_refinement_story(store, journey="mirror", title="Builder lifecycle refinement")
    unassigned = capture_change_request(
        store,
        journey="mirror",
        title="Show roadmap after Done",
        body="Render a roadmap-position surface after Done.",
    )
    attached = capture_change_request(
        store,
        journey="mirror",
        title="Plan safety",
        body="Preserve human-authored plan details.",
    )
    attached = attach_change_request_to_story(
        store,
        change_request_id=attached.id,
        refinement_story_id=story.id,
    )
    store.set_refinement_cursor(
        journey="mirror",
        active_refinement_story_id=story.id,
        active_change_request_id=attached.id,
        last_refinement_event="captured",
    )

    snapshot = get_workbench_snapshot(store, "mirror")

    assert snapshot.storage_state == "implemented"
    assert snapshot.active_refinement_story == story
    assert snapshot.active_change_request == attached
    assert snapshot.refinement_story_count == 1
    assert snapshot.change_request_count == 2
    assert snapshot.unassigned_change_request_count == 1
    assert unassigned.refinement_story_id is None


def test_pull_refinement_story_sets_cursor_without_active_cr(store):
    story = create_refinement_story(store, journey="mirror", title="Builder lifecycle refinement")
    capture_change_request(
        store,
        journey="mirror",
        title="Plan safety",
        body="Preserve human-authored plan details.",
        refinement_story_id=story.id,
    )

    overview = pull_refinement_story(store, journey="mirror", refinement_story_id=story.id)

    cursor = store.get_refinement_cursor("mirror")
    assert cursor is not None
    assert cursor.active_refinement_story_id == story.id
    assert cursor.active_change_request_id is None
    assert cursor.last_refinement_event == "refinement_story_pulled"
    assert overview.story.status == "active"
    active = get_active_refinement_story_overview(store, "mirror")
    assert active == overview


def test_refinement_story_pulled_surface_names_cursor_and_boundary(store):
    story = create_refinement_story(store, journey="mirror", title="Builder lifecycle refinement")
    capture_change_request(
        store,
        journey="mirror",
        title="Plan safety",
        body="Preserve human-authored plan details.",
        refinement_story_id=story.id,
    )
    overview = pull_refinement_story(store, journey="mirror", refinement_story_id=story.id)

    rendered = render_refinement_story_pulled_surface(journey="mirror", overview=overview)

    assert "<<<ARIAD:REFINEMENT_STORY_PULLED>>>" in rendered
    assert "Builder lifecycle refinement" in rendered
    assert "active CR: none" in rendered
    assert "Plan safety" in rendered
    assert "no CR lifecycle work was executed" in rendered
    assert "Delivery Work was pulled or executed" in rendered


def test_change_request_flow_transitions_in_order_and_clears_active_cr(store):
    story = create_refinement_story(store, journey="mirror", title="Builder lifecycle refinement")
    cr = capture_change_request(
        store,
        journey="mirror",
        title="Plan safety",
        body="Preserve human-authored plan details.",
        refinement_story_id=story.id,
    )
    pull_refinement_story(store, journey="mirror", refinement_story_id=story.id)

    selected = select_change_request(store, journey="mirror", change_request_id=cr.id)
    confirmed = confirm_change_request(store, journey="mirror", change_request_id=cr.id)
    planned = plan_change_request(
        store, journey="mirror", change_request_id=cr.id, summary="Plan it"
    )
    implemented = mark_change_request_implemented(
        store, journey="mirror", change_request_id=cr.id, evidence="Implemented elsewhere"
    )
    validated = validate_change_request(
        store, journey="mirror", change_request_id=cr.id, evidence="Validated state"
    )
    done = complete_change_request(store, journey="mirror", change_request_id=cr.id, notes="Done")

    assert selected.previous_status == "captured"
    assert confirmed.event == "change_request_confirmed"
    assert planned.new_status == "planned"
    assert implemented.new_status == "implemented"
    assert validated.new_status == "validated"
    assert done.new_status == "done"
    cursor = store.get_refinement_cursor("mirror")
    assert cursor is not None
    assert cursor.active_change_request_id is None
    assert store.get_change_request(cr.id).outcome_notes == "Done"


def test_change_request_flow_rejects_invalid_order(store):
    story = create_refinement_story(store, journey="mirror", title="Builder lifecycle refinement")
    cr = capture_change_request(
        store,
        journey="mirror",
        title="Plan safety",
        body="Preserve human-authored plan details.",
        refinement_story_id=story.id,
    )
    pull_refinement_story(store, journey="mirror", refinement_story_id=story.id)

    import pytest

    with pytest.raises(ValueError, match="active Change Request is required"):
        plan_change_request(store, journey="mirror", change_request_id=cr.id, summary="Too soon")


def test_refinement_story_review_coherence_close_flow(store):
    story = create_refinement_story(store, journey="mirror", title="Builder lifecycle refinement")
    pull_refinement_story(store, journey="mirror", refinement_story_id=story.id)

    review = review_refinement_story(
        store, journey="mirror", refinement_story_id=story.id, summary="Review only"
    )
    coherence = coherence_refinement_story(
        store, journey="mirror", refinement_story_id=story.id, summary="Coherent"
    )
    close = close_refinement_story(
        store, journey="mirror", refinement_story_id=story.id, summary="Closed"
    )

    assert review.event == "refinement_story_reviewed"
    assert coherence.event == "refinement_story_coherent"
    assert close.new_status == "closed"
    cursor = store.get_refinement_cursor("mirror")
    assert cursor is not None
    assert cursor.active_refinement_story_id is None


def test_refinement_story_overview_renders_ordered_cr_surface(store):
    story = create_refinement_story(store, journey="mirror", title="Builder lifecycle refinement")
    first = capture_change_request(
        store,
        journey="mirror",
        title="Plan safety",
        body="Preserve human-authored plan details.",
        refinement_story_id=story.id,
    )
    second = capture_change_request(
        store,
        journey="mirror",
        title="Roadmap after Done",
        body="Show roadmap position after Delivery Done.",
        refinement_story_id=story.id,
    )

    overview = get_refinement_story_overview(
        store,
        journey="mirror",
        refinement_story_id=story.id,
    )
    rendered = render_refinement_story_overview_surface(journey="mirror", overview=overview)

    assert overview.change_requests == (first, second)
    assert "<<<ARIAD:REFINEMENT_STORY_OVERVIEW>>>" in rendered
    assert "Builder lifecycle refinement" in rendered
    assert "Plan safety" in rendered
    assert "Roadmap after Done" in rendered
    assert "no Refinement Story was pulled" in rendered


def test_change_request_captured_surface_names_attachment_and_boundary(store):
    story = create_refinement_story(store, journey="mirror", title="Builder lifecycle refinement")
    change_request = capture_change_request(
        store,
        journey="mirror",
        title="Plan safety",
        body="Preserve human-authored plan details.",
        refinement_story_id=story.id,
        source="dogfood",
    )

    rendered = render_change_request_captured_surface(
        journey="mirror",
        change_request=change_request,
        refinement_story=story,
    )

    assert "<<<ARIAD:CHANGE_REQUEST_CAPTURED>>>" in rendered
    assert "Plan safety" in rendered
    assert "dogfood" in rendered
    assert story.id in rendered
    assert "no CR lifecycle work was executed" in rendered
