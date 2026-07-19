"""Unit tests for IdentityService."""

import json

import pytest

from memory.models import Identity


class TestIdentityServiceSetIdentity:
    def test_creates_new_identity(self, identity_service, store):
        identity_service.set_identity("ego", "identity", "Sou uma IA mirror.")
        result = store.get_identity("ego", "identity")
        assert result is not None
        assert result.content == "Sou uma IA mirror."

    def test_upsert_updates_existing(self, identity_service):
        identity_service.set_identity("ego", "behavior", "V1")
        identity_service.set_identity("ego", "behavior", "V2")
        result = identity_service.get_identity("ego", "behavior")
        assert result == "V2"

    def test_version_stored(self, identity_service, store):
        identity_service.set_identity("self", "soul", "Essência.", version="2.0.0")
        ident = store.get_identity("self", "soul")
        assert ident.version == "2.0.0"

    def test_returns_identity_object(self, identity_service):
        result = identity_service.set_identity("user", "identity", "Usuário.")
        assert isinstance(result, Identity)
        assert result.layer == "user"
        assert result.key == "identity"

    def test_metadata_is_stored_and_preserved_on_plain_updates(self, identity_service, store):
        identity_service.set_identity(
            "persona",
            "engineer",
            "Prompt v1",
            metadata=json.dumps({"routing_keywords": ["python", "debug"]}),
        )
        identity_service.set_identity("persona", "engineer", "Prompt v2")
        ident = store.get_identity("persona", "engineer")
        assert ident is not None
        assert ident.content == "Prompt v2"
        assert json.loads(ident.metadata)["routing_keywords"] == ["python", "debug"]


class TestIdentityServiceGetIdentity:
    def test_layer_and_key_returns_content_string(self, identity_service):
        identity_service.set_identity("ego", "identity", "Conteúdo ego.")
        result = identity_service.get_identity("ego", "identity")
        assert isinstance(result, str)
        assert result == "Conteúdo ego."

    def test_layer_only_returns_list_of_identities(self, identity_service):
        identity_service.set_identity("ego", "identity", "A")
        identity_service.set_identity("ego", "behavior", "B")
        result = identity_service.get_identity("ego")
        assert isinstance(result, list)
        assert all(isinstance(i, Identity) for i in result)
        assert len(result) >= 2

    def test_all_returns_full_list(self, identity_service):
        identity_service.set_identity("ego", "identity", "A")
        identity_service.set_identity("self", "soul", "B")
        result = identity_service.get_identity()
        assert isinstance(result, list)
        layers = {i.layer for i in result}
        assert "ego" in layers
        assert "self" in layers

    def test_returns_none_when_not_found(self, identity_service):
        result = identity_service.get_identity("ego", "nonexistent")
        assert result is None

    def test_empty_list_when_layer_empty(self, identity_service):
        result = identity_service.get_identity("shadow")
        assert isinstance(result, list)
        assert result == []


class TestIdentityServiceDetectPersona:
    def test_detect_persona_uses_db_metadata_keywords(self, identity_service):
        identity_service.set_identity(
            "persona",
            "engineer",
            "Engineer prompt.",
            metadata=json.dumps({"routing_keywords": ["python", "debug", "database"]}),
        )
        matches = identity_service.detect_persona("Please debug this python database issue")
        assert matches[0] == ("engineer", 3.0, "keyword")

    def test_detect_persona_ignores_personas_without_metadata(self, identity_service):
        identity_service.set_identity("persona", "writer", "Writer prompt.")
        assert identity_service.detect_persona("article draft") == []

    def test_detect_persona_returns_ranked_matches(self, identity_service):
        identity_service.set_identity(
            "persona",
            "engineer",
            "Engineer prompt.",
            metadata=json.dumps({"routing_keywords": ["python", "debug", "database"]}),
        )
        identity_service.set_identity(
            "persona",
            "writer",
            "Writer prompt.",
            metadata=json.dumps({"routing_keywords": ["article", "draft", "writing"]}),
        )
        matches = identity_service.detect_persona(
            "debug this python database issue and help me improve the draft article"
        )
        assert matches[0][0] == "engineer"
        assert matches[1][0] == "writer"
        assert matches[0][1] > matches[1][1]


class TestIdentityServiceLoadMirrorContext:
    def _seed_core(self, svc):
        svc.set_identity("self", "soul", "Alma do mirror.")
        svc.set_identity("ego", "behavior", "Comportamento operacional.")
        svc.set_identity("ego", "identity", "Identity ego.")
        svc.set_identity("user", "identity", "Perfil do usuário.")

    def test_includes_core_sections(self, identity_service):
        self._seed_core(identity_service)
        ctx = identity_service.load_mirror_context()
        assert "=== self/soul ===" in ctx
        assert "=== ego/behavior ===" in ctx
        assert "=== ego/identity ===" in ctx
        assert "=== user/identity ===" in ctx

    def test_constraints_rendered_first_with_prominent_header(self, identity_service):
        self._seed_core(identity_service)
        identity_service.set_identity("ego", "constraints", "Always respond in English.")
        ctx = identity_service.load_mirror_context()
        assert "=== ⛔ HARD CONSTRAINTS ===" in ctx
        assert ctx.index("=== ⛔ HARD CONSTRAINTS ===") < ctx.index("=== self/soul ===")

    def test_constraints_absent_when_not_seeded(self, identity_service):
        self._seed_core(identity_service)
        ctx = identity_service.load_mirror_context()
        assert "HARD CONSTRAINTS" not in ctx

    def test_skips_sections_with_no_content(self, identity_service):
        # Apenas ego/identity definido
        identity_service.set_identity("ego", "identity", "ID.")
        ctx = identity_service.load_mirror_context()
        assert "=== self/soul ===" not in ctx
        assert "=== ego/identity ===" in ctx

    def test_org_flag_adds_org_sections(self, identity_service):
        identity_service.set_identity("organization", "identity", "Org ID.")
        identity_service.set_identity("organization", "principles", "Princípios.")
        ctx = identity_service.load_mirror_context(org=True)
        assert "=== organization/identity ===" in ctx
        assert "=== organization/principles ===" in ctx

    def test_persona_section_added_when_present(self, identity_service):
        identity_service.set_identity("persona", "writer", "Voz do escritor.")
        ctx = identity_service.load_mirror_context(persona="writer")
        assert "=== persona/writer ===" in ctx
        assert "Voz do escritor." in ctx

    def test_journey_section_added(self, identity_service):
        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        ctx = identity_service.load_mirror_context(journey="reflexo")
        assert "=== journey/reflexo ===" in ctx

    def test_journey_section_does_not_fall_back_to_legacy_journey_layer(self, identity_service):
        identity_service.set_identity("travessia", "reflexo", "# O Reflexo\n**Status:** active")
        ctx = identity_service.load_mirror_context(journey="reflexo")
        assert "=== journey/reflexo ===" not in ctx

    def test_query_triggers_attachment_search(self, identity_service, mocker):
        mock_search = mocker.patch.object(
            identity_service.attachments,
            "search_all_attachments",
            return_value=[],
        )
        identity_service.load_mirror_context(query="o que sei sobre decisões?")
        mock_search.assert_called_once()

    def test_journey_query_triggers_scoped_search(self, identity_service, mocker):
        identity_service.set_identity("journey", "reflexo", "# O Reflexo\n**Status:** active")
        mock_search = mocker.patch.object(
            identity_service.attachments,
            "search_attachments",
            return_value=[],
        )
        identity_service.load_mirror_context(journey="reflexo", query="episódio 6")
        mock_search.assert_called_once()

    def test_low_score_attachments_excluded(self, identity_service, mocker):
        from unittest.mock import MagicMock

        att = MagicMock()
        att.name = "doc"
        att.content = "Attachment content."
        att.description = None
        att.journey_id = None
        mocker.patch.object(
            identity_service.attachments,
            "search_all_attachments",
            return_value=[(att, 0.3)],  # score <= 0.4 deve ser excluído
        )
        ctx = identity_service.load_mirror_context(query="algo")
        assert "Attachment content." not in ctx

    def test_high_score_attachments_included(self, identity_service, mocker):
        from unittest.mock import MagicMock

        att = MagicMock()
        att.name = "doc-relevante"
        att.content = "Relevant attachment content."
        att.description = None
        att.journey_id = None
        mocker.patch.object(
            identity_service.attachments,
            "search_all_attachments",
            return_value=[(att, 0.8)],  # score > 0.4 deve ser incluído
        )
        ctx = identity_service.load_mirror_context(query="algo")
        assert "Relevant attachment content." in ctx

    def test_format_uses_triple_equals(self, identity_service):
        identity_service.set_identity("ego", "identity", "Conteúdo.")
        ctx = identity_service.load_mirror_context()
        assert "===" in ctx


class TestIdentityServiceLoadFullIdentity:
    def test_returns_empty_string_when_no_identity(self, identity_service):
        result = identity_service.load_full_identity()
        assert result == ""

    def test_all_entries_formatted_with_separator(self, identity_service):
        identity_service.set_identity("ego", "identity", "Conteúdo ego.")
        result = identity_service.load_full_identity()
        assert "--- ego/identity ---" in result
        assert "Conteúdo ego." in result

    def test_multiple_layers_all_present(self, identity_service):
        identity_service.set_identity("ego", "identity", "A")
        identity_service.set_identity("self", "soul", "B")
        result = identity_service.load_full_identity()
        assert "--- ego/identity ---" in result
        assert "--- self/soul ---" in result


class TestApplyConsolidationIdentityUpdate:
    """CV9.E2.S23 (AI-23): the identity-write accept path had no allowlist —
    a model-chosen target_layer could write to any identity layer. This gates
    consolidation-sourced identity writes to the mirror's own inferred-
    identity layers (self, ego) only."""

    def test_accepts_self_layer(self, identity_service, store):
        identity_service.apply_consolidation_identity_update(
            target_layer="self", target_key="soul", content="New insight."
        )
        result = store.get_identity("self", "soul")
        assert result is not None
        assert "New insight." in result.content

    def test_accepts_ego_layer(self, identity_service, store):
        identity_service.apply_consolidation_identity_update(
            target_layer="ego", target_key="behavior", content="New pattern."
        )
        result = store.get_identity("ego", "behavior")
        assert result is not None

    def test_rejects_user_layer(self, identity_service):
        with pytest.raises(ValueError):
            identity_service.apply_consolidation_identity_update(
                target_layer="user", target_key="identity", content="x"
            )

    def test_rejects_organization_layer(self, identity_service):
        with pytest.raises(ValueError):
            identity_service.apply_consolidation_identity_update(
                target_layer="organization", target_key="identity", content="x"
            )

    def test_rejects_shadow_layer(self, identity_service):
        # Shadow has its own path (mm-shadow) -- consolidation must not write it.
        with pytest.raises(ValueError):
            identity_service.apply_consolidation_identity_update(
                target_layer="shadow", target_key="profile", content="x"
            )

    def test_rejects_unknown_layer(self, identity_service):
        with pytest.raises(ValueError):
            identity_service.apply_consolidation_identity_update(
                target_layer="not-a-real-layer", target_key="whatever", content="x"
            )

    def test_rejection_does_not_write_anything(self, identity_service, store):
        with pytest.raises(ValueError):
            identity_service.apply_consolidation_identity_update(
                target_layer="user", target_key="identity", content="attacker content"
            )
        assert store.get_identity("user", "identity") is None

    def test_appends_to_existing_content(self, identity_service, store):
        identity_service.set_identity("ego", "behavior", "Original line.")
        identity_service.apply_consolidation_identity_update(
            target_layer="ego", target_key="behavior", content="New line."
        )
        result = store.get_identity("ego", "behavior")
        assert result.content == "Original line.\n\nNew line."

    def test_no_existing_content_is_not_appended(self, identity_service, store):
        identity_service.apply_consolidation_identity_update(
            target_layer="ego", target_key="fresh-key", content="First content."
        )
        result = store.get_identity("ego", "fresh-key")
        assert result.content == "First content."

    def test_returns_identity_object(self, identity_service):
        result = identity_service.apply_consolidation_identity_update(
            target_layer="ego", target_key="behavior", content="x"
        )
        assert isinstance(result, Identity)
        assert result.layer == "ego"
