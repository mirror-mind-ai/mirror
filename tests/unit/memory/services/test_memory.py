"""Unit tests for MemoryService."""

import json

import pytest

from memory.models import Memory


class TestMemoryServiceEmbeddingFailure:
    """CV9.E2.S1 — no memory row is written when embedding generation fails."""

    def test_add_memory_does_not_persist_on_embedding_failure(self, memory_service, store, mocker):
        from memory.intelligence.embeddings import EmbeddingError

        create_spy = mocker.spy(store, "create_memory")
        mocker.patch(
            "memory.services.memory.generate_embedding",
            side_effect=EmbeddingError("No embedding generated after 3 attempts"),
        )
        before = len(store.get_all_memories_with_embeddings())

        with pytest.raises(EmbeddingError):
            memory_service.add_memory(title="t", content="c", memory_type="insight")

        create_spy.assert_not_called()
        assert len(store.get_all_memories_with_embeddings()) == before


class TestMemoryServiceEmbeddingProvenance:
    """CV9.E2.S17 (AI-07) — every stored memory vector records its embedding model."""

    def test_add_memory_records_provenance(self, memory_service, store, mock_memory_embedding):
        from memory.config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL

        mem = memory_service.add_memory(title="t", content="c", memory_type="insight")
        meta = json.loads(store.get_memory(mem.id).metadata)
        assert meta["embedding_model"] == EMBEDDING_MODEL
        assert meta["embedding_dimensions"] == EMBEDDING_DIMENSIONS

    def test_staging_path_records_provenance(self, memory_service, store, emb_vec):
        # Extraction stages the vector and passes it precomputed — the highest-volume path.
        mem = memory_service.add_memory(
            title="t", content="c", memory_type="insight", embedding=emb_vec
        )
        assert "embedding_model" in json.loads(store.get_memory(mem.id).metadata)

    def test_caller_metadata_is_merged_not_clobbered(
        self, memory_service, store, mock_memory_embedding
    ):
        mem = memory_service.add_memory(
            title="t", content="c", memory_type="insight", metadata='{"k": 1}'
        )
        meta = json.loads(store.get_memory(mem.id).metadata)
        assert meta["k"] == 1
        assert "embedding_model" in meta

    def test_count_by_model_buckets_null_as_unknown(
        self, memory_service, store, mock_memory_embedding
    ):
        from memory.config import EMBEDDING_MODEL

        memory_service.add_memory(title="a", content="b", memory_type="insight")
        m2 = memory_service.add_memory(title="c", content="d", memory_type="insight")
        store.conn.execute("UPDATE memories SET metadata = NULL WHERE id = ?", (m2.id,))
        store.conn.execute("UPDATE memories SET metadata = 'not json' WHERE id = ?", (m2.id,))
        store.conn.commit()

        dist = dict(store.count_memories_by_embedding_model())
        assert dist[EMBEDDING_MODEL] == 1
        assert dist.get(None) == 1


class TestMemoryServiceAddMemory:
    def test_returns_memory_object(self, memory_service, mock_memory_embedding):
        mem = memory_service.add_memory(
            title="Decisão importante",
            content="Escolhi manter o foco.",
            memory_type="decision",
        )
        assert isinstance(mem, Memory)
        assert mem.title == "Decisão importante"
        assert mem.memory_type == "decision"

    def test_memory_persisted_in_store(self, memory_service, store, mock_memory_embedding):
        mem = memory_service.add_memory(
            title="Persistência",
            content="Conteúdo.",
            memory_type="insight",
        )
        retrieved = store.get_memory(mem.id)
        assert retrieved is not None
        assert retrieved.id == mem.id

    def test_embedding_generated_from_title_content(self, memory_service, mocker, emb_vec):
        mock_embed = mocker.patch("memory.services.memory.generate_embedding", return_value=emb_vec)
        memory_service.add_memory(
            title="Título",
            content="Conteúdo do insight.",
            memory_type="insight",
        )
        call_arg = mock_embed.call_args[0][0]
        assert "Título" in call_arg
        assert "Conteúdo do insight." in call_arg

    def test_context_appended_to_embed_text(self, memory_service, mocker, emb_vec):
        mock_embed = mocker.patch("memory.services.memory.generate_embedding", return_value=emb_vec)
        memory_service.add_memory(
            title="T",
            content="C",
            memory_type="insight",
            context="Contexto extra",
        )
        call_arg = mock_embed.call_args[0][0]
        assert "Contexto extra" in call_arg

    def test_tags_stored_as_json(self, memory_service, store, mock_memory_embedding):
        mem = memory_service.add_memory(
            title="T",
            content="C",
            memory_type="insight",
            tags=["alpha", "beta"],
        )
        stored = store.get_memory(mem.id)
        parsed = json.loads(stored.tags)
        assert "alpha" in parsed
        assert "beta" in parsed

    def test_optional_fields_default_none(self, memory_service, store, mock_memory_embedding):
        mem = memory_service.add_memory(
            title="T",
            content="C",
            memory_type="insight",
        )
        stored = store.get_memory(mem.id)
        assert stored.journey is None
        assert stored.persona is None
        assert stored.conversation_id is None

    def test_all_optional_fields_round_trip(self, memory_service, store, mock_memory_embedding):
        mem = memory_service.add_memory(
            title="T",
            content="C",
            memory_type="decision",
            layer="self",
            journey="reflexo",
            persona="mentor",
        )
        stored = store.get_memory(mem.id)
        assert stored.layer == "self"
        assert stored.journey == "reflexo"
        assert stored.persona == "mentor"


class TestMemoryServiceSearch:
    def test_delegates_to_search_engine(self, memory_service, mocker, emb_vec):
        mock_search = mocker.patch.object(
            memory_service.search_engine,
            "search",
            return_value=[],
        )
        memory_service.search("alguma coisa")
        mock_search.assert_called_once()

    def test_returns_list_of_tuples(self, memory_service, mock_memory_embedding):
        memory_service.add_memory(title="T", content="C", memory_type="insight")
        result = memory_service.search("insight")
        assert isinstance(result, list)
        if result:
            assert isinstance(result[0], tuple)
            assert isinstance(result[0][0], Memory)
            assert isinstance(result[0][1], float)

    def test_passes_filters_through(self, memory_service, mocker, emb_vec):
        mock_search = mocker.patch.object(
            memory_service.search_engine,
            "search",
            return_value=[],
        )
        memory_service.search(
            "query",
            limit=3,
            memory_type="insight",
            layer="ego",
            journey="reflexo",
        )
        call_kwargs = mock_search.call_args[1]
        assert call_kwargs["limit"] == 3
        assert call_kwargs["memory_type"] == "insight"
        assert call_kwargs["layer"] == "ego"
        assert call_kwargs["journey"] == "reflexo"


class TestMemoryServiceGetByType:
    def test_returns_memories_of_correct_type(self, memory_service, mock_memory_embedding):
        memory_service.add_memory(title="A", content=".", memory_type="insight")
        memory_service.add_memory(title="B", content=".", memory_type="decision")
        result = memory_service.get_by_type("insight")
        assert all(m.memory_type == "insight" for m in result)
        assert len(result) >= 1

    def test_empty_when_no_match(self, memory_service):
        result = memory_service.get_by_type("pattern")
        assert result == []

    def test_does_not_return_other_types(self, memory_service, mock_memory_embedding):
        memory_service.add_memory(title="A", content=".", memory_type="decision")
        result = memory_service.get_by_type("insight")
        assert all(m.memory_type != "decision" for m in result)


class TestMemoryServiceGetByLayer:
    def test_returns_memories_of_layer(self, memory_service, mock_memory_embedding):
        memory_service.add_memory(title="A", content=".", memory_type="insight", layer="ego")
        memory_service.add_memory(title="B", content=".", memory_type="insight", layer="self")
        result = memory_service.get_by_layer("ego")
        assert all(m.layer == "ego" for m in result)

    def test_empty_for_unknown_layer(self, memory_service):
        result = memory_service.get_by_layer("shadow")
        assert result == []


class TestMemoryServiceGetByJourney:
    def test_returns_memories_for_journey(self, memory_service, mock_memory_embedding):
        memory_service.add_memory(title="A", content=".", memory_type="insight", journey="reflexo")
        memory_service.add_memory(title="B", content=".", memory_type="insight", journey="outra")
        result = memory_service.get_by_journey("reflexo")
        assert all(m.journey == "reflexo" for m in result)
        assert len(result) >= 1

    def test_excludes_other_journeys(self, memory_service, mock_memory_embedding):
        memory_service.add_memory(title="B", content=".", memory_type="insight", journey="outra")
        result = memory_service.get_by_journey("reflexo")
        assert len(result) == 0


class TestMemoryServiceGetTimeline:
    def test_returns_memories_in_range(self, memory_service, mock_memory_embedding):
        memory_service.add_memory(title="T", content="C", memory_type="insight")
        result = memory_service.get_timeline("2020-01-01Z", "2030-01-01Z")
        assert len(result) >= 1

    def test_empty_range(self, memory_service, mock_memory_embedding):
        memory_service.add_memory(title="T", content="C", memory_type="insight")
        # Range no passado distante
        result = memory_service.get_timeline("2000-01-01Z", "2001-01-01Z")
        assert result == []


class TestMemoryServiceAddJournal:
    def test_classifies_when_title_missing(
        self, memory_service, mock_memory_embedding, mock_classify_journal
    ):
        from unittest.mock import patch

        with patch(
            "memory.intelligence.extraction.classify_journal_entry",
            return_value={"title": "Auto-título", "layer": "ego", "tags": ["tag1"]},
        ) as mock_cls:
            memory_service.add_journal(content="Entrada sem título.")
            mock_cls.assert_called_once()

    def test_classifies_when_layer_missing(self, memory_service, mock_memory_embedding):
        from unittest.mock import patch

        with patch(
            "memory.intelligence.extraction.classify_journal_entry",
            return_value={"title": "T", "layer": "shadow", "tags": []},
        ):
            mem = memory_service.add_journal(content="C", title="T provided")
            assert mem.layer == "shadow"

    def test_skips_classification_when_all_provided(self, memory_service, mock_memory_embedding):
        from unittest.mock import patch

        with patch("memory.intelligence.extraction.classify_journal_entry") as mock_cls:
            memory_service.add_journal(content="C", title="T", layer="self", tags=["a"])
            mock_cls.assert_not_called()

    def test_stores_as_journal_type(self, memory_service, store, mock_memory_embedding):
        from unittest.mock import patch

        with patch(
            "memory.intelligence.extraction.classify_journal_entry",
            return_value={"title": "Entrada", "layer": "ego", "tags": []},
        ):
            mem = memory_service.add_journal(content="Reflexão diária.")
            stored = store.get_memory(mem.id)
            assert stored.memory_type == "journal"

    def test_classification_result_used(self, memory_service, mock_memory_embedding):
        from unittest.mock import patch

        with patch(
            "memory.intelligence.extraction.classify_journal_entry",
            return_value={"title": "Título Gerado", "layer": "self", "tags": ["profundo"]},
        ):
            mem = memory_service.add_journal(content="C")
            assert mem.title == "Título Gerado"
            assert mem.layer == "self"
