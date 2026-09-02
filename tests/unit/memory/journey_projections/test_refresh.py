from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from memory import MemoryClient
from memory.builder.delivery_cursor import clear_delivery_cursor, set_delivery_cursor
from memory.builder.workbench import (
    capture_change_request,
    create_refinement_story,
    get_refinement_story_overview,
    pull_refinement_story,
)
from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.models import ProjectionInspection, ProjectionPublication
from memory.journey_projections.refresh import (
    ProjectionRefreshCoordinator,
    active_work_from_cursor,
    exploratory_stories_from_store,
)
from memory.services.explorer_story import (
    ExplorerBuilderHandoff,
    ExplorerSourceConversation,
    archive_explorer_story,
    set_explorer_builder_handoff,
    set_explorer_source_conversations,
    update_explorer_story,
)


class FakeOperationalService:
    def __init__(self) -> None:
        self.revision = "sha256:first"
        self.current_revision: str | None = None
        self.compile_error: Exception | None = None
        self.publish_error: Exception | None = None
        self.compile_calls: list[tuple[str, object]] = []
        self.publish_calls: list[dict[str, Any]] = []

    def compile(self, journey_id, *, active_work=None, exploratory_stories=None):
        self.compile_calls.append((journey_id, active_work))
        if self.compile_error:
            raise self.compile_error
        return {
            "journeyId": journey_id,
            "sourceRevision": self.revision,
            "content": {"activeWork": active_work},
        }

    def inspect(self, journey_id):
        if self.current_revision is None:
            raise ProjectionError(
                ProjectionErrorCode.PROJECTION_DIVERGENCE,
                "Current Journey projection is unavailable or divergent.",
            )
        return ProjectionInspection(
            status="ok",
            document={"sourceRevision": self.current_revision},
            manifest_entry={"sourceRevision": self.current_revision},
        )

    def publish_compiled(self, document):
        if self.publish_error:
            raise self.publish_error
        self.publish_calls.append(document)
        self.current_revision = document["sourceRevision"]
        return ProjectionPublication(
            status="published",
            journey_id=document["journeyId"],
            namespace="ariad",
            projection="operational",
            snapshot_id="op-refresh",
            source_revision=document["sourceRevision"],
        )


def test_coordinator_publishes_then_skips_unchanged_content() -> None:
    service = FakeOperationalService()
    coordinator = ProjectionRefreshCoordinator(
        service,  # type: ignore[arg-type]
        active_work_reader=lambda journey: {"activeItem": "CV1"},
    )

    published = coordinator.request("synthetic-journey")
    unchanged = coordinator.request("synthetic-journey")

    assert published.status == "published"
    assert unchanged.status == "unchanged"
    assert len(service.publish_calls) == 1
    assert coordinator.latest("synthetic-journey") == unchanged


def test_concurrent_equivalent_requests_publish_once_per_process() -> None:
    service = FakeOperationalService()
    coordinator = ProjectionRefreshCoordinator(service)  # type: ignore[arg-type]

    with ThreadPoolExecutor(max_workers=6) as pool:
        outcomes = list(pool.map(coordinator.request, ["synthetic-journey"] * 12))

    assert [outcome.status for outcome in outcomes].count("published") == 1
    assert [outcome.status for outcome in outcomes].count("unchanged") == 11
    assert len(service.publish_calls) == 1


def test_coordinator_contains_bounded_and_unexpected_failures() -> None:
    service = FakeOperationalService()
    coordinator = ProjectionRefreshCoordinator(service)  # type: ignore[arg-type]
    service.compile_error = ProjectionError(
        ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
        "private candidate payload must never escape",
    )

    bounded = coordinator.request("synthetic-journey")
    service.compile_error = RuntimeError("secret root and document")
    unexpected = coordinator.request("synthetic-journey")

    assert bounded.status == unexpected.status == "failed"
    assert bounded.code == "schema_validation_failed"
    assert "private" not in bounded.message
    assert unexpected.code == "publication_failed"
    assert "secret" not in unexpected.message
    assert service.publish_calls == []


def test_store_callback_is_optional_and_contains_callback_bugs(store) -> None:
    assert store.request_projection_refresh("synthetic-journey") is None
    calls: list[str] = []

    def broken(journey: str):
        calls.append(journey)
        raise RuntimeError("private callback payload")

    store.configure_projection_refresh(broken)
    assert store.request_projection_refresh("synthetic-journey") is None
    assert calls == ["synthetic-journey"]


def test_delivery_cursor_requests_only_for_projected_state_after_commit(store) -> None:
    observations: list[tuple[str, object]] = []

    def refresh(journey: str):
        observations.append((journey, active_work_from_cursor(store, journey)))

    store.configure_projection_refresh(refresh)
    set_delivery_cursor(
        store,
        journey="synthetic-journey",
        method="ariad",
        cadence_profile="accelerated",
    )
    set_delivery_cursor(
        store,
        journey="synthetic-journey",
        method="ariad",
        active_item="CV1.DS1",
        active_checkpoint="plan",
        pending_confirmation="navigator_approval",
        last_delivery_event="plan",
        cadence_profile="accelerated",
    )
    set_delivery_cursor(
        store,
        journey="synthetic-journey",
        method="ariad",
        active_item="CV1.DS1",
        active_checkpoint="plan",
        pending_confirmation="navigator_approval",
        last_delivery_event="plan",
        cadence_profile="stepwise",
    )
    clear_delivery_cursor(store, "synthetic-journey")

    assert observations == [
        (
            "synthetic-journey",
            {
                "activeItem": "CV1.DS1",
                "checkpoint": "plan",
                "pendingConfirmation": "navigator_approval",
                "status": "plan",
            },
        ),
        ("synthetic-journey", None),
    ]


def test_explorer_requests_for_public_state_but_not_private_source_evidence(store) -> None:
    observations: list[str] = []
    store.configure_projection_refresh(observations.append)

    update_explorer_story(
        store,
        "synthetic-journey",
        narrative_field_summary="Public summary",
    )
    set_explorer_source_conversations(
        store,
        "synthetic-journey",
        [ExplorerSourceConversation(conversation_id="private-conversation")],
    )
    archive_explorer_story(store, "synthetic-journey")

    assert observations == ["synthetic-journey", "synthetic-journey"]


def test_explorer_handoff_records_supply_public_refresh_overrides(store, tmp_path) -> None:
    root = tmp_path / "journey"
    handoff_dir = root / "docs/project/explorations/public-story"
    handoff_dir.mkdir(parents=True)
    index = handoff_dir / "index.md"
    info = handoff_dir / "handoff-info.md"
    index.write_text("# Public handoff\n", encoding="utf-8")
    info.write_text("# Handoff info\n", encoding="utf-8")
    update_explorer_story(
        store,
        "synthetic-journey",
        narrative_field_summary="Public summary",
    )
    set_explorer_builder_handoff(
        store,
        "synthetic-journey",
        ExplorerBuilderHandoff(
            title="Public story",
            readiness="completed",
            index_path=str(index),
            handoff_info_path=str(info),
        ),
    )

    projected = exploratory_stories_from_store(store, "synthetic-journey", root)

    assert projected[0]["summary"] == "Public summary"
    assert projected[0]["path"] == ("docs/project/explorations/public-story/index.md")


def test_explorer_refresh_failure_does_not_rollback_story(store) -> None:
    store.configure_projection_refresh(lambda _: (_ for _ in ()).throw(RuntimeError("boom")))

    story = update_explorer_story(
        store,
        "synthetic-journey",
        narrative_field_summary="Committed summary",
    )

    assert story.narrative_field_summary == "Committed summary"
    assert store.get_active_explorer_story_record("synthetic-journey") is not None


def test_refinement_logical_mutations_request_once_and_reads_request_zero(store) -> None:
    observations: list[str] = []
    store.configure_projection_refresh(observations.append)

    story = create_refinement_story(
        store,
        journey="synthetic-journey",
        title="Refine projection refresh",
    )
    capture_change_request(
        store,
        journey="synthetic-journey",
        title="One request",
        body="Refresh once after the complete logical mutation.",
        refinement_story_id=story.id,
    )
    pull_refinement_story(
        store,
        journey="synthetic-journey",
        refinement_story_id=story.id,
    )
    get_refinement_story_overview(
        store,
        journey="synthetic-journey",
        refinement_story_id=story.id,
    )

    assert observations == ["synthetic-journey"] * 3


def test_refinement_refresh_failure_does_not_rollback_source_truth(store) -> None:
    store.configure_projection_refresh(lambda _: (_ for _ in ()).throw(RuntimeError("boom")))

    story = create_refinement_story(
        store,
        journey="synthetic-journey",
        title="Committed despite refresh failure",
    )

    assert store.get_refinement_story(story.id) is not None


def test_memory_client_wires_real_post_commit_operational_refresh(tmp_path) -> None:
    root = tmp_path / "journey-root"
    root.mkdir()
    with MemoryClient(env="test", db_path=tmp_path / "memory.db") as client:
        client.journeys.create_journey(
            slug="synthetic-journey",
            content=(
                "# Synthetic Journey\n\n**Status:** Active\n\n## Description\n\n"
                "A sufficiently descriptive synthetic Journey used only to prove "
                "post-commit projection refresh wiring in an isolated test database."
            ),
            project_path=str(root),
        )

        set_delivery_cursor(
            client.store,
            journey="synthetic-journey",
            method="ariad",
            active_item="CV1.DS1",
            active_checkpoint="pull",
            last_delivery_event="pull",
        )

        outcome = client.projection_refresh.latest("synthetic-journey")
        assert outcome is not None and outcome.status == "published"
        document = root / ".mirror/projections/ariad/operational.json"
        assert document.exists()


def test_refresh_failure_never_changes_committed_delivery_cursor(store) -> None:
    store.configure_projection_refresh(lambda _: (_ for _ in ()).throw(RuntimeError("boom")))

    cursor = set_delivery_cursor(
        store,
        journey="synthetic-journey",
        method="ariad",
        active_item="CV1.DS1",
        last_delivery_event="pull",
    )

    assert cursor.active_item == "CV1.DS1"
    assert active_work_from_cursor(store, "synthetic-journey")["status"] == "pull"
