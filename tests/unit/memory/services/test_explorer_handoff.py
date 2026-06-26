"""Tests for Explorer Builder handoff artifact generation."""

from memory.services.explorer_handoff import (
    HandoffConversationSource,
    HandoffSourceMessage,
    write_builder_handoff_artifacts,
)
from memory.services.explorer_story import (
    ExplorerAttractor,
    ExplorerExperimentProposal,
    ExplorerStory,
)


def test_write_builder_handoff_artifacts_creates_transfer_document_set(tmp_path):
    story = ExplorerStory(
        journey="explorer-mode",
        current_exploratory_story="Explorer has clarified a Builder boundary.",
        narrative_field_summary="A handoff artifact should transfer discovery.",
        last_story_card="Story thickened around transfer docs.",
        attractors=(ExplorerAttractor(label="External validation"),),
        experiment_proposal=ExplorerExperimentProposal(title="Validate in Pi"),
    )

    handoff = write_builder_handoff_artifacts(
        tmp_path,
        story,
        title="Build Explorer persistence",
        summary="The exploration clarified the Builder boundary.",
        editorial_synthesis="The exploration continuously thickened around transfer docs.",
    )

    artifact_dir = tmp_path / "docs" / "project" / "explorations" / "build-explorer-persistence"
    assert handoff.artifact_dir == artifact_dir.as_posix()
    index = artifact_dir / "index.md"
    exploratory_story = artifact_dir / "exploratory-story.md"
    handoff_info = artifact_dir / "handoff-info.md"
    product_design = artifact_dir / "product-design-proposal.md"
    assert index.is_file()
    assert exploratory_story.is_file()
    assert handoff_info.is_file()
    assert product_design.is_file()
    assert "The exploration continuously thickened" in index.read_text(encoding="utf-8")
    assert "Explorer has clarified" in exploratory_story.read_text(encoding="utf-8")
    assert "Continuous Thickening Narrative" in exploratory_story.read_text(encoding="utf-8")
    assert "What Builder Should Not Assume" not in handoff_info.read_text(encoding="utf-8")
    assert "Non-Assumptions" in handoff_info.read_text(encoding="utf-8")
    assert "Product Design Proposal" in product_design.read_text(encoding="utf-8")
    assert "does not define implementation architecture" in product_design.read_text(
        encoding="utf-8"
    )


def test_write_builder_handoff_artifacts_includes_source_evidence_and_full_conversation(tmp_path):
    story = ExplorerStory(
        id="story-123",
        journey="explorer-mode",
        current_exploratory_story="Explorer handoff needs evidence.",
        narrative_field_summary="Source evidence clarifies the path.",
    )
    source = HandoffConversationSource(
        conversation_id="conv-123",
        title="Explorer validation",
        role="origin conversation",
        messages=(
            HandoffSourceMessage(
                role="user",
                content="My file is /Users/alissonvale/Code/mirror/.env and token=sk-secretvalue123456",
            ),
            HandoffSourceMessage(role="assistant", content="Use alisson@example.com carefully."),
        ),
    )

    handoff = write_builder_handoff_artifacts(
        tmp_path,
        story,
        title="Evidence handoff",
        source_conversations=(source,),
        include_full_conversation=True,
    )

    artifact_dir = tmp_path / "docs" / "project" / "explorations" / "evidence-handoff"
    index_text = (artifact_dir / "index.md").read_text(encoding="utf-8")
    handoff_info_text = (artifact_dir / "handoff-info.md").read_text(encoding="utf-8")
    full_text = (artifact_dir / "full-conversation.md").read_text(encoding="utf-8")
    assert handoff.full_conversation_path == (artifact_dir / "full-conversation.md").as_posix()
    assert "Story id: `story-123`" in index_text
    assert "`conv-123` — Explorer validation (origin conversation)" in index_text
    assert "Handoff Completeness Checklist" in handoff_info_text
    assert "[x] source evidence list" in handoff_info_text
    assert "Sensitive personal or local details may have been obfuscated" in full_text
    assert "[LOCAL_PATH]" in full_text
    assert "token=[SECRET]" in full_text
    assert "[PRIVATE_EMAIL]" in full_text


def test_write_builder_handoff_artifacts_avoids_existing_directory(tmp_path):
    story = ExplorerStory(journey="explorer-mode")
    existing = tmp_path / "docs" / "project" / "explorations" / "build-explorer-persistence"
    existing.mkdir(parents=True)

    handoff = write_builder_handoff_artifacts(
        tmp_path,
        story,
        title="Build Explorer persistence",
    )

    assert handoff.artifact_dir.endswith("build-explorer-persistence-2")
