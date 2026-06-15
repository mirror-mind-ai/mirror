from memory import MemoryClient
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.delivery_story_closure import (
    coherence_delivery_story,
    done_delivery_story,
    render_delivery_story_closure_report,
    review_delivery_story,
    validate_delivery_story,
)
from memory.config import default_db_path_for_home


def _store(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    client = MemoryClient(env="test", db_path=db_path)
    return client, client.store


def _seed(store):
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        active_item_title="Checkout entry and address capture",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        child_work_items=("CV2.DS1.US1",),
        aggregate_checkpoint_status=("plan:approved",),
    )


def test_validate_delivery_story_materializes_artifact(tmp_path):
    _client, store = _store(tmp_path)
    _seed(store)
    artifact = tmp_path / "story" / "validation.md"

    report = validate_delivery_story(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        summary="Navigator accepted the aggregate checkout behavior.",
        navigator_accepted=True,
        artifact_path=artifact,
    )

    assert report.artifact_path == artifact
    assert artifact.exists()
    assert "# Validation — CV2.DS1" in artifact.read_text(encoding="utf-8")


def test_validate_delivery_story_records_aggregate_validation(tmp_path):
    _client, store = _store(tmp_path)
    _seed(store)

    report = validate_delivery_story(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        summary="Navigator accepted the aggregate checkout behavior.",
        navigator_accepted=True,
    )

    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor is not None
    assert report.status == "passed"
    assert "validation:passed" in cursor.aggregate_checkpoint_status
    assert cursor.child_work_items == ("CV2.DS1.US1",)


def test_delivery_story_closure_progresses_to_done(tmp_path):
    _client, store = _store(tmp_path)
    _seed(store)
    validate_delivery_story(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        summary="validated",
        navigator_accepted=True,
    )
    review_delivery_story(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        decision="no_action",
        summary="no debt",
    )
    coherence_delivery_story(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        summary="coherent",
    )
    report = done_delivery_story(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        summary="done",
    )

    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor is not None
    assert report.status == "done"
    assert cursor.aggregate_checkpoint_status == (
        "plan:approved",
        "validation:passed",
        "debt_review:review:no_action",
        "coherence:coherent",
        "done:done",
    )


def test_render_delivery_story_closure_report_lists_checkpoint_artifacts(tmp_path):
    _client, store = _store(tmp_path)
    _seed(store)
    artifact = tmp_path / "story" / "validation.md"
    report = validate_delivery_story(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        summary="validated",
        navigator_accepted=True,
        artifact_path=artifact,
    )

    rendered = render_delivery_story_closure_report(report)

    assert "validation artifact\n" in rendered
    assert str(artifact) in rendered
    assert "checkpoint artifacts\n" in rendered
    assert f"- validation: {artifact} (created)" in rendered
    assert f"- review: {artifact.parent / 'review.md'} (pending)" in rendered


def test_render_delivery_story_closure_report_lists_child_work_items(tmp_path):
    _client, store = _store(tmp_path)
    _seed(store)
    report = validate_delivery_story(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        summary="validated",
        navigator_accepted=True,
    )

    rendered = render_delivery_story_closure_report(report)

    assert "<<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>>" in rendered
    assert "delivery story\nCV2.DS1" in rendered
    assert "- CV2.DS1.US1" in rendered
    assert "status\npassed" in rendered
