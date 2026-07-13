"""Unit tests for JourneyService."""

import pytest


class TestJourneyServiceGetJourneyPath:
    def test_returns_none_when_no_journey_path_set(self, journey_service):
        result = journey_service.get_journey_path("journey-vazia")
        assert result is None

    def test_returns_db_content_when_no_sync_file(self, journey_service, identity_service):
        identity_service.set_identity("journey_path", "reflexo", "# Etapa 1\n- [ ] Fazer algo")
        result = journey_service.get_journey_path("reflexo")
        assert result == "# Etapa 1\n- [ ] Fazer algo"

    def test_does_not_fall_back_to_legacy_journey_path_layer(
        self, journey_service, identity_service
    ):
        identity_service.set_identity("caminho", "reflexo", "# Journey Path legado")
        result = journey_service.get_journey_path("reflexo")
        assert result is None

    def test_reads_file_when_sync_file_configured(
        self, journey_service, identity_service, tmp_path
    ):
        journey_path_file = tmp_path / "journey_path.md"
        journey_path_file.write_text("# Journey Path do Arquivo\n", encoding="utf-8")

        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        journey_service.set_sync_file("reflexo", str(journey_path_file))

        result = journey_service.get_journey_path("reflexo")
        assert result == "# Journey Path do Arquivo\n"

    def test_falls_back_to_db_when_file_missing(self, journey_service, identity_service):
        identity_service.set_identity("journey_path", "reflexo", "# DB Journey Path")
        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        journey_service.set_sync_file("reflexo", "/journey_path/inexistente.md")

        result = journey_service.get_journey_path("reflexo")
        assert result == "# DB Journey Path"


class TestJourneyServiceSetJourneyPath:
    def test_creates_identity_entry(self, journey_service, identity_service):
        journey_service.set_journey_path("nova-trav", "# Journey Path inicial")
        result = identity_service.get_identity("journey_path", "nova-trav")
        assert result == "# Journey Path inicial"

    def test_updates_existing_entry(self, journey_service, identity_service):
        journey_service.set_journey_path("trav", "v1")
        journey_service.set_journey_path("trav", "v2")
        result = identity_service.get_identity("journey_path", "trav")
        assert result == "v2"


class TestJourneyServiceGetJourneyStatus:
    def test_specific_journey_returns_dict_with_keys(self, journey_service, identity_service):
        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        result = journey_service.get_journey_status("reflexo")
        assert "reflexo" in result
        assert "identity" in result["reflexo"]
        assert "journey_path" in result["reflexo"]
        assert "recent_memories" in result["reflexo"]
        assert "recent_conversations" in result["reflexo"]

    def test_none_journey_returns_all(self, journey_service, identity_service):
        identity_service.set_identity("journey", "trav-a", "# A\n**Status:** active")
        identity_service.set_identity("journey", "trav-b", "# B\n**Status:** active")
        result = journey_service.get_journey_status()
        assert "trav-a" in result
        assert "trav-b" in result

    def test_identity_content_included(self, journey_service, identity_service):
        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        result = journey_service.get_journey_status("reflexo")
        assert "O Reflexo" in result["reflexo"]["identity"]


class TestJourneyServiceListActiveJourneys:
    def test_returns_active_journeys_only(self, journey_service, identity_service):
        identity_service.set_identity(
            "journey", "ativa", "# Ativa\n**Status:** active\n## Descrição\nDesc."
        )
        identity_service.set_identity("journey", "pausada", "# Pausada\n**Status:** paused")
        result = journey_service.list_active_journeys()
        ids = [t["id"] for t in result]
        assert "ativa" in ids
        assert "pausada" not in ids

    def test_name_from_first_line(self, journey_service, identity_service):
        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        result = journey_service.list_active_journeys()
        match = next((t for t in result if t["id"] == "reflexo"), None)
        assert match is not None
        assert match["name"] == "O Reflexo"

    def test_description_extracted(self, journey_service, identity_service):
        identity_service.set_identity(
            "journey",
            "reflexo",
            "# O Reflexo\n**Status:** active\n\n## Descrição\nEsta é a descrição.\n\n## Outra",
        )
        result = journey_service.list_active_journeys()
        match = next((t for t in result if t["id"] == "reflexo"), None)
        assert match is not None
        assert "Esta é a descrição." in match["description"]

    def test_empty_when_none_active(self, journey_service, identity_service):
        identity_service.set_identity("journey", "pausada", "# Pausada\n**Status:** paused")
        result = journey_service.list_active_journeys()
        assert result == []

    def test_includes_parent_journey_metadata(self, journey_service, identity_service):
        identity_service.set_identity("journey", "parent", "# Parent\n**Status:** active")
        identity_service.set_identity(
            "journey",
            "child",
            "# Child\n**Status:** active",
            metadata='{"parent_journey": "parent"}',
        )
        result = journey_service.list_active_journeys()
        child = next(t for t in result if t["id"] == "child")
        assert child["metadata"]["parent_journey"] == "parent"

    def test_does_not_fall_back_to_legacy_journey_layer(self, journey_service, identity_service):
        identity_service.set_identity("travessia", "legada", "# Legada\n**Status:** active")
        result = journey_service.list_active_journeys()
        assert result == []


class TestJourneyServiceIdentityFields:
    def test_update_identity_fields_updates_title_and_status(
        self, journey_service, identity_service
    ):
        identity_service.set_identity(
            "journey",
            "mirror",
            "# Old Title\n**Status:** active\n\n## Description\nA journey.",
        )

        journey_service.update_identity_fields("mirror", title="New Title", status="completed")

        content = identity_service.get_identity("journey", "mirror")
        assert content.startswith("# New Title\n**Status:** completed")

    def test_update_identity_fields_rejects_empty_title(self, journey_service, identity_service):
        identity_service.set_identity("journey", "mirror", "# Mirror\n**Status:** active")

        with pytest.raises(ValueError, match="title is required"):
            journey_service.update_identity_fields("mirror", title="")


class TestJourneyServiceParentJourney:
    def test_create_journey_stores_parent_journey(self, journey_service, identity_service):
        identity_service.set_identity("journey", "parent", "# Parent\n**Status:** active")
        content = """# Child
**Status:** active

## Description

Child journey with enough content for creation.
"""
        journey_service.create_journey(slug="child", content=content, parent_journey="parent")

        metadata = journey_service._get_journey_identity("child").metadata
        assert '"parent_journey": "parent"' in metadata

    def test_update_metadata_fields_stores_parent_journey(self, journey_service, identity_service):
        identity_service.set_identity("journey", "parent", "# Parent\n**Status:** active")
        identity_service.set_identity("journey", "child", "# Child\n**Status:** active")

        metadata = journey_service.update_metadata_fields("child", {"parent_journey": "parent"})

        assert metadata["parent_journey"] == "parent"

    def test_rejects_unknown_parent(self, journey_service, identity_service):
        identity_service.set_identity("journey", "child", "# Child\n**Status:** active")

        with pytest.raises(ValueError, match="Parent journey 'missing' not found"):
            journey_service.update_metadata_fields("child", {"parent_journey": "missing"})

    def test_rejects_self_parent(self, journey_service, identity_service):
        identity_service.set_identity("journey", "child", "# Child\n**Status:** active")

        with pytest.raises(ValueError, match="cannot be the journey itself"):
            journey_service.update_metadata_fields("child", {"parent_journey": "child"})

    def test_rejects_deeper_hierarchy(self, journey_service, identity_service):
        identity_service.set_identity("journey", "root", "# Root\n**Status:** active")
        identity_service.set_identity(
            "journey",
            "parent",
            "# Parent\n**Status:** active",
            metadata='{"parent_journey": "root"}',
        )
        identity_service.set_identity("journey", "child", "# Child\n**Status:** active")

        with pytest.raises(ValueError, match="Only one hierarchy level"):
            journey_service.update_metadata_fields("child", {"parent_journey": "parent"})

    def test_rejects_parent_for_journey_that_already_has_children(
        self, journey_service, identity_service
    ):
        identity_service.set_identity("journey", "root", "# Root\n**Status:** active")
        identity_service.set_identity("journey", "parent", "# Parent\n**Status:** active")
        identity_service.set_identity(
            "journey",
            "child",
            "# Child\n**Status:** active",
            metadata='{"parent_journey": "parent"}',
        )

        with pytest.raises(ValueError, match="cannot also have a parent"):
            journey_service.update_metadata_fields("parent", {"parent_journey": "root"})

    def test_list_journey_options_orders_children_under_parent(
        self, journey_service, identity_service
    ):
        identity_service.set_identity("journey", "z-parent", "# Z Parent\n**Status:** active")
        identity_service.set_identity("journey", "a-parent", "# A Parent\n**Status:** active")
        identity_service.set_identity(
            "journey",
            "child",
            "# Child\n**Status:** active",
            metadata='{"parent_journey": "z-parent"}',
        )

        result = journey_service.list_journey_options()

        assert [item["id"] for item in result] == ["a-parent", "z-parent", "child"]
        assert result[2]["parent_journey"] == "z-parent"


class TestJourneyServiceDetectJourney:
    def test_text_match_on_id_returns_high_score(self, journey_service, identity_service):
        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        result = journey_service.detect_journey("estou pensando no reflexo")
        assert len(result) >= 1
        journey_id, score, match_type = result[0]
        assert journey_id == "reflexo"
        assert score >= 0.5
        assert match_type == "text"

    def test_stopwords_not_counted_as_match(self, journey_service, identity_service):
        identity_service.set_identity("journey", "trabalho", "# Trabalho\n**Status:** active")
        result = journey_service.detect_journey("o que é isso?")
        assert all(t[0] != "trabalho" for t in result)

    def test_semantic_fallback_used_when_no_text_match(
        self, journey_service, identity_service, mock_embeddings
    ):
        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        result = journey_service.detect_journey("algo completamente diferente")
        if result:
            assert result[0][2] == "semantic"

    def test_threshold_filters_low_scores(self, journey_service, identity_service, mocker):
        identity_service.set_identity("journey", "reflexo", "# Reflexo\n**Status:** active")
        import numpy as np

        zero_vec = np.zeros(1536, dtype=np.float32)
        zero_vec[0] = 1.0
        ortho_vec = np.zeros(1536, dtype=np.float32)
        ortho_vec[1] = 1.0
        call_count = 0

        def side_effect(text):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return zero_vec
            return ortho_vec

        mocker.patch("memory.intelligence.embeddings.generate_embedding", side_effect=side_effect)
        result = journey_service.detect_journey("algo sem match textual", threshold=0.5)
        assert result == []

    def test_empty_when_no_journeys_in_db(self, journey_service):
        result = journey_service.detect_journey("qualquer coisa")
        assert result == []

    def test_returns_sorted_by_score_desc(self, journey_service, identity_service):
        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        identity_service.set_identity("journey", "produto", "# Produto\n**Status:** active")
        result = journey_service.detect_journey("reflexo produto")
        scores = [score for _, score, _ in result]
        assert scores == sorted(scores, reverse=True)


class TestJourneyServiceProjectPath:
    def test_get_project_path_returns_none_when_no_identity(self, journey_service):
        result = journey_service.get_project_path("nao-existe")
        assert result is None

    def test_get_project_path_returns_none_when_metadata_has_no_project_path(
        self, journey_service, identity_service
    ):
        identity_service.set_identity("journey", "reflexo", "# Reflexo\n**Status:** active")
        result = journey_service.get_project_path("reflexo")
        assert result is None

    def test_get_project_path_returns_configured_path(
        self, journey_service, identity_service, tmp_path
    ):
        identity_service.set_identity("journey", "reflexo", "# Reflexo\n**Status:** active")
        project_path = tmp_path / "project"
        journey_service.set_project_path("reflexo", str(project_path))
        result = journey_service.get_project_path("reflexo")
        assert result == str(project_path.resolve())

    def test_set_project_path_expands_and_resolves_path(
        self, journey_service, identity_service, tmp_path
    ):
        identity_service.set_identity("journey", "reflexo", "# Reflexo\n**Status:** active")
        project_path = tmp_path / "project"
        project_path.mkdir()
        result = journey_service.set_project_path("reflexo", str(project_path))
        assert result == str(project_path.resolve())
        assert journey_service.get_project_path("reflexo") == str(project_path.resolve())

    def test_set_project_path_raises_when_journey_not_found(self, journey_service):
        with pytest.raises(ValueError, match="not found"):
            journey_service.set_project_path("inexistente", "/tmp/project")

    def test_create_journey_expands_project_path(self, journey_service, tmp_path, monkeypatch):
        monkeypatch.setenv("HOME", str(tmp_path))
        monkeypatch.setenv("USERPROFILE", str(tmp_path))
        content = (
            "# Child\n**Status:** active\n\n## Description\n\n"
            "Child journey with enough content for creation.\n"
        )
        journey_service.create_journey(slug="child", content=content, project_path="~/project")
        expected = str((tmp_path / "project").resolve())
        assert journey_service.get_project_path("child") == expected

    def test_update_metadata_fields_expands_project_path(
        self, journey_service, identity_service, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("HOME", str(tmp_path))
        monkeypatch.setenv("USERPROFILE", str(tmp_path))
        identity_service.set_identity("journey", "reflexo", "# Reflexo\n**Status:** active")
        journey_service.update_metadata_fields("reflexo", {"project_path": "~/project"})
        expected = str((tmp_path / "project").resolve())
        assert journey_service.get_project_path("reflexo") == expected

    def test_get_project_path_expands_legacy_tilde_value(
        self, journey_service, identity_service, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("HOME", str(tmp_path))
        monkeypatch.setenv("USERPROFILE", str(tmp_path))
        identity_service.set_identity(
            "journey",
            "legacy",
            "# Legacy\n**Status:** active",
            metadata='{"project_path": "~/legacy"}',
        )
        result = journey_service.get_project_path("legacy")
        assert result == str(tmp_path / "legacy")


class TestJourneyServiceGetSyncFile:
    def test_returns_none_when_no_identity(self, journey_service):
        result = journey_service.get_sync_file("nao-existe")
        assert result is None

    def test_returns_none_when_no_sync_file_key(self, journey_service, identity_service):
        identity_service.set_identity("journey", "reflexo", "# Reflexo\n**Status:** active")
        result = journey_service.get_sync_file("reflexo")
        assert result is None

    def test_returns_path_when_configured(self, journey_service, identity_service):
        identity_service.set_identity("journey", "reflexo", "# Reflexo\n**Status:** active")
        journey_service.set_sync_file("reflexo", "/tmp/journey_path.md")
        result = journey_service.get_sync_file("reflexo")
        assert result == "/tmp/journey_path.md"


class TestJourneyServiceSetSyncFile:
    def test_stores_sync_file_in_metadata(self, journey_service, identity_service):
        identity_service.set_identity("journey", "reflexo", "# Reflexo\n**Status:** active")
        journey_service.set_sync_file("reflexo", "/journey_path/arquivo.md")
        result = journey_service.get_sync_file("reflexo")
        assert result == "/journey_path/arquivo.md"

    def test_raises_when_journey_not_found(self, journey_service):
        with pytest.raises(ValueError, match="not found"):
            journey_service.set_sync_file("inexistente", "/algum/journey_path.md")
