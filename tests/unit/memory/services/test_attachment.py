"""Unit tests for AttachmentService."""

import json

import pytest

from memory.models import Attachment


class TestAttachmentServiceEmbeddingFailure:
    """CV9.E2.S1 — write fails cleanly; search reports the failure (no silent [])."""

    def test_add_attachment_does_not_persist_on_embedding_failure(
        self, attachment_service, store, mocker
    ):
        from memory.intelligence.embeddings import EmbeddingError

        create_spy = mocker.spy(store, "create_attachment")
        mocker.patch(
            "memory.services.attachment.generate_embedding",
            side_effect=EmbeddingError("No embedding generated after 3 attempts"),
        )

        with pytest.raises(EmbeddingError):
            attachment_service.add_attachment(journey_id="j", name="n", content="c")

        create_spy.assert_not_called()

    def test_search_attachments_raises_on_query_embedding_failure(
        self, attachment_service, mocker, emb_vec
    ):
        from memory.intelligence.embeddings import EmbeddingError

        mocker.patch("memory.services.attachment.generate_embedding", return_value=emb_vec)
        attachment_service.add_attachment(journey_id="j", name="n", content="seed content")

        mocker.patch(
            "memory.services.attachment.generate_embedding",
            side_effect=EmbeddingError("provider unreachable"),
        )
        with pytest.raises(EmbeddingError):
            attachment_service.search_attachments("j", "query")


class TestAttachmentServiceAddAttachment:
    def test_returns_attachment_object(self, attachment_service, mock_attachment_embedding):
        att = attachment_service.add_attachment(
            journey_id="reflexo",
            name="episodio-6",
            content="Conteúdo do episódio.",
        )
        assert isinstance(att, Attachment)
        assert att.name == "episodio-6"
        assert att.journey_id == "reflexo"

    def test_persisted_in_store(self, attachment_service, store, mock_attachment_embedding):
        att = attachment_service.add_attachment(journey_id="reflexo", name="doc", content="Texto.")
        stored = store.get_attachment_by_name("reflexo", "doc")
        assert stored is not None
        assert stored.id == att.id

    def test_embedding_generated(self, attachment_service, mocker, emb_vec):
        mock_emb = mocker.patch(
            "memory.services.attachment.generate_embedding", return_value=emb_vec
        )
        attachment_service.add_attachment(journey_id="reflexo", name="doc", content="Conteúdo.")
        mock_emb.assert_called_once()

    def test_content_truncated_at_8000_chars(self, attachment_service, mocker, emb_vec):
        mock_emb = mocker.patch(
            "memory.services.attachment.generate_embedding", return_value=emb_vec
        )
        long_content = "x" * 10000
        attachment_service.add_attachment(journey_id="reflexo", name="doc", content=long_content)
        call_arg = mock_emb.call_args[0][0]
        assert len(call_arg) == 8000

    def test_tags_serialized_as_json(self, attachment_service, store, mock_attachment_embedding):
        attachment_service.add_attachment(
            journey_id="reflexo",
            name="doc",
            content="X",
            tags=["tag1", "tag2"],
        )
        stored = store.get_attachment_by_name("reflexo", "doc")
        parsed = json.loads(stored.tags)
        assert "tag1" in parsed
        assert "tag2" in parsed

    def test_description_optional(self, attachment_service, store, mock_attachment_embedding):
        attachment_service.add_attachment(journey_id="reflexo", name="doc", content="X")
        stored = store.get_attachment_by_name("reflexo", "doc")
        assert stored.description is None


class TestAttachmentServiceGetAttachments:
    def test_returns_attachments_for_journey(self, attachment_service, mock_attachment_embedding):
        attachment_service.add_attachment("reflexo", "a", "X")
        attachment_service.add_attachment("reflexo", "b", "Y")
        attachment_service.add_attachment("outra", "c", "Z")
        result = attachment_service.get_attachments("reflexo")
        assert len(result) == 2
        assert all(a.journey_id == "reflexo" for a in result)

    def test_empty_for_unknown_journey(self, attachment_service):
        result = attachment_service.get_attachments("inexistente")
        assert result == []


class TestAttachmentServiceGetAttachment:
    def test_returns_attachment_by_name(self, attachment_service, mock_attachment_embedding):
        attachment_service.add_attachment("reflexo", "meu-doc", "Conteúdo.")
        result = attachment_service.get_attachment("reflexo", "meu-doc")
        assert result is not None
        assert result.name == "meu-doc"

    def test_returns_none_when_not_found(self, attachment_service):
        result = attachment_service.get_attachment("reflexo", "nao-existe")
        assert result is None


class TestAttachmentServiceRemoveAttachment:
    def test_returns_true_on_success(self, attachment_service, mock_attachment_embedding):
        attachment_service.add_attachment("reflexo", "doc", "X")
        result = attachment_service.remove_attachment("reflexo", "doc")
        assert result is True

    def test_attachment_no_longer_in_store(self, attachment_service, mock_attachment_embedding):
        attachment_service.add_attachment("reflexo", "doc", "X")
        attachment_service.remove_attachment("reflexo", "doc")
        assert attachment_service.get_attachment("reflexo", "doc") is None

    def test_returns_false_when_not_found(self, attachment_service):
        result = attachment_service.remove_attachment("reflexo", "nao-existe")
        assert result is False


class TestAttachmentServiceSearchAttachments:
    def test_returns_tuples_with_scores(self, attachment_service, mock_attachment_embedding):
        attachment_service.add_attachment("reflexo", "doc", "Conteúdo relevante.")
        result = attachment_service.search_attachments("reflexo", "relevante")
        assert isinstance(result, list)
        assert all(isinstance(r, tuple) and len(r) == 2 for r in result)
        if result:
            assert isinstance(result[0][0], Attachment)
            assert isinstance(result[0][1], float)

    def test_orders_by_score_desc(self, attachment_service, mock_attachment_embedding):
        attachment_service.add_attachment("reflexo", "a", "Primeiro.")
        attachment_service.add_attachment("reflexo", "b", "Segundo.")
        result = attachment_service.search_attachments("reflexo", "busca", limit=10)
        scores = [score for _, score in result]
        assert scores == sorted(scores, reverse=True)

    def test_respects_limit(self, attachment_service, mock_attachment_embedding):
        for i in range(5):
            attachment_service.add_attachment("reflexo", f"doc-{i}", f"Conteúdo {i}.")
        result = attachment_service.search_attachments("reflexo", "busca", limit=2)
        assert len(result) <= 2

    def test_empty_when_no_attachments(self, attachment_service):
        result = attachment_service.search_attachments("reflexo", "busca")
        assert result == []

    def test_score_is_cosine_similarity(self, attachment_service, mock_attachment_embedding):
        # Com embedding idêntico (mock), o score deve ser próximo de 1.0
        attachment_service.add_attachment("reflexo", "doc", "Conteúdo.")
        result = attachment_service.search_attachments("reflexo", "qualquer coisa")
        assert len(result) == 1
        score = result[0][1]
        assert pytest.approx(score, abs=1e-3) == 1.0


class TestAttachmentServiceSearchAllAttachments:
    def test_global_search_across_journeys(self, attachment_service, mock_attachment_embedding):
        attachment_service.add_attachment("reflexo", "doc-a", "Conteúdo de reflexo.")
        attachment_service.add_attachment("outra", "doc-b", "Conteúdo de outra.")
        result = attachment_service.search_all_attachments("conteúdo", limit=10)
        journeys = {att.journey_id for att, _ in result}
        assert "reflexo" in journeys
        assert "outra" in journeys

    def test_respects_limit(self, attachment_service, mock_attachment_embedding):
        for i in range(6):
            attachment_service.add_attachment(f"trav-{i}", f"doc-{i}", f"Texto {i}.")
        result = attachment_service.search_all_attachments("texto", limit=3)
        assert len(result) <= 3

    def test_empty_when_no_attachments(self, attachment_service):
        result = attachment_service.search_all_attachments("busca")
        assert result == []
