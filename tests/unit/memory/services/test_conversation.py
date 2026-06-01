"""Unit tests for ConversationService."""

from memory.models import Conversation, Message


class TestConversationServiceStartConversation:
    def test_returns_conversation_object(self, conversation_service):
        conv = conversation_service.start_conversation(interface="claude_code")
        assert isinstance(conv, Conversation)
        assert conv.interface == "claude_code"

    def test_persisted_in_store(self, conversation_service, store):
        conv = conversation_service.start_conversation(interface="cli")
        stored = store.get_conversation(conv.id)
        assert stored is not None
        assert stored.id == conv.id

    def test_optional_fields_preserved(self, conversation_service, store):
        conv = conversation_service.start_conversation(
            interface="django",
            persona="writer",
            journey="reflexo",
            title="Conversa sobre o artigo",
        )
        stored = store.get_conversation(conv.id)
        assert stored.persona == "writer"
        assert stored.journey == "reflexo"
        assert stored.title == "Conversa sobre o artigo"

    def test_ended_at_initially_none(self, conversation_service, store):
        conv = conversation_service.start_conversation(interface="cli")
        stored = store.get_conversation(conv.id)
        assert stored.ended_at is None


class TestConversationServiceAddMessage:
    def test_returns_message_object(self, conversation_service):
        conv = conversation_service.start_conversation(interface="cli")
        msg = conversation_service.add_message(conv.id, role="user", content="Olá!")
        assert isinstance(msg, Message)
        assert msg.content == "Olá!"
        assert msg.role == "user"

    def test_message_associated_to_conversation(self, conversation_service):
        conv = conversation_service.start_conversation(interface="cli")
        msg = conversation_service.add_message(conv.id, role="user", content="X")
        assert msg.conversation_id == conv.id

    def test_message_persisted(self, conversation_service, store):
        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.add_message(conv.id, role="user", content="Mensagem")
        messages = store.get_messages(conv.id)
        assert len(messages) == 1
        assert messages[0].content == "Mensagem"

    def test_token_count_preserved(self, conversation_service, store):
        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.add_message(
            conv.id, role="assistant", content="Resposta.", token_count=42
        )
        messages = store.get_messages(conv.id)
        assert messages[0].token_count == 42

    def test_multiple_messages_ordered(self, conversation_service, store):
        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.add_message(conv.id, role="user", content="Primeira")
        conversation_service.add_message(conv.id, role="assistant", content="Segunda")
        messages = store.get_messages(conv.id)
        assert messages[0].content == "Primeira"
        assert messages[1].content == "Segunda"


class TestConversationServiceEndConversation:
    def test_extract_false_returns_empty_list(self, conversation_service):
        conv = conversation_service.start_conversation(interface="cli")
        result = conversation_service.end_conversation(conv.id, extract=False)
        assert result == []

    def test_extract_false_marks_ended_at(self, conversation_service, store):
        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.end_conversation(conv.id, extract=False)
        stored = store.get_conversation(conv.id)
        assert stored.ended_at is not None

    def test_end_conversation_finalizes_non_manual_metadata(
        self, conversation_service, store, mocker
    ):
        import json

        mocker.patch(
            "memory.services.conversation.generate_conversation_title",
            return_value="Conversation Title Repair",
        )
        mocker.patch(
            "memory.services.conversation.generate_conversation_summary",
            return_value="Clean final conversation summary.",
        )
        mocker.patch(
            "memory.services.conversation.generate_conversation_tags",
            return_value=["conversation metadata", "title repair"],
        )
        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.set_provisional_title(
            conv.id,
            "vamos trabalhar na jornada mirror mind. Eu quero trabalhar...",
        )
        conversation_service.add_message(conv.id, "user", "Quero corrigir títulos")
        conversation_service.add_message(conv.id, "assistant", "Vamos desenhar a correção")
        conversation_service.add_message(conv.id, "user", "Também resumo e tags")
        conversation_service.add_message(conv.id, "assistant", "Vamos finalizar metadados")

        conversation_service.end_conversation(conv.id, extract=False)

        stored = store.get_conversation(conv.id)
        assert stored.title == "Conversation Title Repair"
        assert stored.summary == "Clean final conversation summary."
        assert json.loads(stored.tags) == ["conversation metadata", "title repair"]
        metadata = json.loads(stored.metadata)
        assert metadata["title_status"] == "generated"
        assert metadata["title_source"] == "close_time_metadata_finalization"
        assert metadata["summary_source"] == "close_time_metadata_finalization"
        assert metadata["tags_source"] == "close_time_metadata_finalization"
        assert metadata["last_metadata_update_source"] == "close_time_metadata_finalization"

    def test_end_conversation_preserves_manual_metadata(self, conversation_service, store, mocker):
        import json

        mocker.patch(
            "memory.services.conversation.generate_conversation_title",
            return_value="Generated replacement",
        )
        mocker.patch(
            "memory.services.conversation.generate_conversation_summary",
            return_value="Generated summary.",
        )
        mocker.patch(
            "memory.services.conversation.generate_conversation_tags",
            return_value=["generated"],
        )
        conv = conversation_service.start_conversation(
            interface="cli",
            title="This manual title is intentionally long enough to look suspicious",
        )
        conversation_service.add_message(conv.id, "user", "Quero corrigir títulos")
        conversation_service.add_message(conv.id, "assistant", "Vamos desenhar a correção")
        conversation_service.add_message(conv.id, "user", "Também summary e tags")
        conversation_service.add_message(conv.id, "assistant", "Vamos preservar manuais")
        conversation_service.update_title(conv.id, conv.title or "Manual title")
        conversation_service.update_summary(conv.id, "Manual summary.")
        conversation_service.update_tags(conv.id, "manual")

        conversation_service.end_conversation(conv.id, extract=False)

        stored = store.get_conversation(conv.id)
        assert stored.title == "This manual title is intentionally long enough to look suspicious"
        assert stored.summary == "Manual summary."
        assert json.loads(stored.tags) == ["manual"]

    def test_set_provisional_title_records_metadata(self, conversation_service, store):
        import json

        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.set_provisional_title(conv.id, "First message fragment")

        stored = store.get_conversation(conv.id)
        metadata = json.loads(stored.metadata)
        assert metadata["title_status"] == "provisional"
        assert metadata["title_source"] == "first_user"

    def test_empty_messages_returns_empty_list(
        self, conversation_service, mock_conversation_embedding
    ):
        conv = conversation_service.start_conversation(interface="cli")
        result = conversation_service.end_conversation(conv.id, extract=True)
        assert result == []

    def test_memories_extracted_and_stored(
        self,
        conversation_service,
        store,
        mock_conversation_embedding,
        mock_extract_memories,
        mock_extract_tasks,
    ):
        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        result = conversation_service.end_conversation(conv.id)
        assert len(result) == 1
        assert result[0].title == "Insight de teste"
        assert result[0].memory_type == "insight"

    def test_memories_persisted_in_store(
        self,
        conversation_service,
        store,
        mock_conversation_embedding,
        mock_extract_memories,
        mock_extract_tasks,
    ):
        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        result = conversation_service.end_conversation(conv.id)
        stored = store.get_memory(result[0].id)
        assert stored is not None

    def test_embedding_generated_and_stored(
        self,
        conversation_service,
        store,
        mock_extract_memories,
        mock_extract_tasks,
        mocker,
        emb_vec,
    ):
        mock_emb = mocker.patch(
            "memory.services.conversation.generate_embedding", return_value=emb_vec
        )
        mocker.patch("memory.services.memory.generate_embedding", return_value=emb_vec)
        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        conversation_service.end_conversation(conv.id)
        mock_emb.assert_called()

    def test_summary_stored_in_conversation(
        self,
        conversation_service,
        store,
        mock_conversation_embedding,
        mock_extract_memories,
        mock_extract_tasks,
    ):
        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        conversation_service.end_conversation(conv.id)
        stored = store.get_conversation(conv.id)
        assert stored.summary is not None
        assert len(stored.summary) > 0

    def test_task_extraction_called(
        self,
        conversation_service,
        mock_conversation_embedding,
        mock_extract_memories,
        mocker,
    ):
        mock_tasks = mocker.patch("memory.services.conversation.extract_tasks", return_value=[])
        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        conversation_service.end_conversation(conv.id)
        mock_tasks.assert_called_once()

    def test_task_created_when_not_duplicate(
        self,
        conversation_service,
        store,
        mock_conversation_embedding,
        mock_extract_memories,
        mocker,
    ):
        from memory.intelligence.extraction import ExtractedTask

        mocker.patch(
            "memory.services.conversation.extract_tasks",
            return_value=[ExtractedTask(title="Nova task", journey=None)],
        )
        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        conversation_service.end_conversation(conv.id)
        tasks = store.find_tasks_by_title("Nova task", None)
        assert len(tasks) == 1

    def test_duplicate_task_not_created(
        self,
        conversation_service,
        task_service,
        store,
        mock_conversation_embedding,
        mock_extract_memories,
        mocker,
    ):
        from memory.intelligence.extraction import ExtractedTask

        # Criar task pré-existente
        task_service.add_task(title="Task existente")
        mocker.patch(
            "memory.services.conversation.extract_tasks",
            return_value=[ExtractedTask(title="Task existente", journey=None)],
        )
        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        conversation_service.end_conversation(conv.id)
        tasks = store.find_tasks_by_title("Task existente", None)
        assert len(tasks) == 1  # não duplicou

    def test_task_extraction_failure_does_not_abort(
        self,
        conversation_service,
        store,
        mock_conversation_embedding,
        mock_extract_memories,
        mocker,
    ):
        mocker.patch(
            "memory.services.conversation.extract_tasks",
            side_effect=RuntimeError("LLM falhou"),
        )
        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        # Não deve propagar a exceção
        result = conversation_service.end_conversation(conv.id)
        assert isinstance(result, list)

    # --- Smart extraction criteria ---

    def test_no_journey_skips_extraction(self, conversation_service, mocker):
        mock = mocker.patch("memory.services.conversation.extract_memories", return_value=[])
        conv = conversation_service.start_conversation(interface="cli")  # sem journey
        for i in range(6):
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        result = conversation_service.end_conversation(conv.id, extract=True)
        assert result == []
        mock.assert_not_called()

    def test_too_few_messages_skips_extraction(self, conversation_service, mocker):
        mock = mocker.patch("memory.services.conversation.extract_memories", return_value=[])
        conv = conversation_service.start_conversation(interface="cli", journey="mirrormind")
        for i in range(3):  # apenas 3 mensagens — abaixo do mínimo
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        result = conversation_service.end_conversation(conv.id, extract=True)
        assert result == []
        mock.assert_not_called()

    def test_journey_and_enough_messages_triggers_extraction(
        self,
        conversation_service,
        mock_conversation_embedding,
        mock_extract_tasks,
        mocker,
    ):
        from memory.models import ExtractedMemory

        mock = mocker.patch(
            "memory.services.conversation.extract_memories",
            return_value=[
                ExtractedMemory(
                    title="Insight de teste",
                    content="Conteúdo extraído",
                    memory_type="insight",
                    layer="ego",
                )
            ],
        )
        conv = conversation_service.start_conversation(interface="cli", journey="mirrormind")
        for i in range(4):  # exatamente no limite mínimo
            conversation_service.add_message(conv.id, role="user", content=f"Mensagem {i}")
        result = conversation_service.end_conversation(conv.id, extract=True)
        assert len(result) == 1
        mock.assert_called_once()


class TestExtractionTracking:
    def test_end_conversation_marks_extracted_in_metadata(
        self,
        conversation_service,
        store,
        mock_conversation_embedding,
        mock_extract_memories,
        mock_extract_tasks,
    ):
        import json

        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Msg {i}")
        conversation_service.end_conversation(conv.id, extract=True)
        stored = store.get_conversation(conv.id)
        assert stored.metadata is not None
        meta = json.loads(stored.metadata)
        assert meta.get("extracted") is True

    def test_no_metadata_set_when_criteria_unmet(self, conversation_service, store):
        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(3):  # below minimum
            conversation_service.add_message(conv.id, role="user", content=f"Msg {i}")
        conversation_service.end_conversation(conv.id, extract=True)
        stored = store.get_conversation(conv.id)
        assert stored.metadata is None or '"extracted"' not in (stored.metadata or "")

    def test_extract_conversation_marks_extracted(
        self,
        conversation_service,
        store,
        mock_conversation_embedding,
        mock_extract_memories,
        mock_extract_tasks,
    ):
        import json

        conv = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"Msg {i}")
        conversation_service.end_conversation(conv.id, extract=False)
        conversation_service.extract_conversation(conv.id)
        stored = store.get_conversation(conv.id)
        assert stored.metadata is not None
        meta = json.loads(stored.metadata)
        assert meta.get("extracted") is True

    def test_get_unextracted_returns_pending(
        self,
        conversation_service,
        store,
        mock_conversation_embedding,
        mock_extract_memories,
        mock_extract_tasks,
    ):
        # Extracted conv
        conv_done = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv_done.id, role="user", content=f"Msg {i}")
        conversation_service.end_conversation(conv_done.id, extract=True)

        # Unextracted conv
        conv_pending = conversation_service.start_conversation(interface="cli", journey="test")
        for i in range(4):
            conversation_service.add_message(conv_pending.id, role="user", content=f"Msg {i}")
        conversation_service.end_conversation(conv_pending.id, extract=False)

        pending = store.get_unextracted_conversations()
        ids = [c.id for c in pending]
        assert conv_pending.id in ids
        assert conv_done.id not in ids


class TestConversationServiceSummaryOperations:
    def test_suggest_summary_returns_clean_suggestion_without_saving(
        self, conversation_service, store, mocker
    ):
        mocker.patch(
            "memory.services.conversation.generate_conversation_summary",
            return_value="Clean summary paragraph.",
        )
        conv = conversation_service.start_conversation(interface="cli", title="Metadata")
        conversation_service.add_message(conv.id, "user", "Vamos tratar metadados")
        conversation_service.add_message(conv.id, "assistant", "Com aprovação explícita")
        store.update_conversation(conv.id, summary="Old raw summary")

        suggestion = conversation_service.suggest_summary(conv.id)

        stored = store.get_conversation(conv.id)
        assert suggestion == "Clean summary paragraph."
        assert stored.summary == "Old raw summary"

    def test_update_summary_saves_manual_summary_metadata(self, conversation_service, store):
        import json

        conv = conversation_service.start_conversation(interface="cli", title="Metadata")

        updated = conversation_service.update_summary(conv.id, "  Clean summary paragraph.  ")

        metadata = json.loads(updated.metadata)
        assert updated.summary == "Clean summary paragraph."
        assert metadata["summary_status"] == "manual"
        assert metadata["summary_source"] == "manual"

    def test_update_tags_saves_manual_tags_metadata(self, conversation_service, store):
        import json

        conv = conversation_service.start_conversation(interface="cli", title="Metadata")

        updated = conversation_service.update_tags(conv.id, "metadata, conversation")

        metadata = json.loads(updated.metadata)
        assert json.loads(updated.tags) == ["metadata", "conversation"]
        assert metadata["tags_status"] == "manual"
        assert metadata["tags_source"] == "manual"

    def test_update_tags_blank_clears_stored_tags(self, conversation_service, store):
        import json

        conv = conversation_service.start_conversation(interface="cli", title="Metadata")
        conversation_service.update_tags(conv.id, "metadata, conversation")

        updated = conversation_service.update_tags(conv.id, "  ")

        metadata = json.loads(updated.metadata)
        assert updated.tags is None
        assert metadata["tags_status"] == "cleared"


class TestConversationServiceMetadataLifecycleDryRun:
    def test_reports_repair_for_provisional_generic_title_without_mutation(
        self, conversation_service, store
    ):
        import json

        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.set_provisional_title(conv.id, "vamos trabalhar no maestro")
        conversation_service.add_message(conv.id, "user", "Vamos validar checkpoint visibility")
        conversation_service.add_message(conv.id, "assistant", "Vamos revisar o handoff")
        before = store.get_conversation(conv.id)

        report = conversation_service.dry_run_metadata_lifecycle(conv.id)

        after = store.get_conversation(conv.id)
        assert report["mode"] == "dry_run"
        assert report["mutated"] is False
        assert report["fields"]["title"]["decision"] == "repair"
        assert report["fields"]["title"]["readiness"] == "ready"
        assert report["fields"]["summary"]["decision"] == "defer"
        assert report["fields"]["tags"]["decision"] == "defer"
        assert after.title == before.title
        assert json.loads(after.metadata) == json.loads(before.metadata)

    def test_reports_keep_for_meaningful_opening_title(self, conversation_service):
        conv = conversation_service.start_conversation(
            interface="cli",
            title="Delphi consulting — Mirror/Maestro/Ariad training",
        )
        conversation_service.add_message(conv.id, "user", "Você trabalha com Delphi?")
        conversation_service.add_message(conv.id, "assistant", "Sim, posso ajudar.")

        report = conversation_service.dry_run_metadata_lifecycle(conv.id)

        assert report["fields"]["title"]["decision"] == "keep"
        assert report["fields"]["title"]["lock_state"] == "unlocked"

    def test_reports_refine_candidate_when_summary_is_more_specific_than_unlocked_title(
        self, conversation_service, store
    ):
        conv = conversation_service.start_conversation(
            interface="cli",
            title="vamos trabalhar no projeto antes de mim",
        )
        conversation_service.add_message(conv.id, "user", "Vamos trabalhar no projeto")
        conversation_service.add_message(conv.id, "assistant", "Contexto carregado")
        store.update_conversation(
            conv.id,
            summary=(
                "Builder Mode ativo na Travessia antes de mim. "
                "Contexto editorial carregado para Raphael Albino, Scrivener, "
                "manuscrito, briefing de capa, texto raw, higienização, "
                "importação Kindle e validação EPUB."
            ),
        )

        report = conversation_service.dry_run_metadata_lifecycle(conv.id)

        title_report = report["fields"]["title"]
        assert title_report["decision"] == "refine_candidate"
        assert title_report["confidence"] in {"low", "medium"}
        assert "summary_specific_terms" in title_report["evidence"]
        assert "briefing" in title_report["evidence"]["summary_specific_terms"]

    def test_refine_candidate_does_not_depend_on_generic_project_phrase(
        self, conversation_service, store
    ):
        conv = conversation_service.start_conversation(
            interface="cli",
            title="Initial editorial session",
        )
        conversation_service.add_message(conv.id, "user", "Let's begin")
        conversation_service.add_message(conv.id, "assistant", "Ready")
        store.update_conversation(
            conv.id,
            summary=(
                "Editorial workflow for Raphael Albino manuscript. "
                "Scrivener import, cover briefing, Kindle export, EPUB validation, "
                "chapter cleanup, raw text hygiene, and publishing preparation."
            ),
        )

        report = conversation_service.dry_run_metadata_lifecycle(conv.id)

        assert report["fields"]["title"]["decision"] == "refine_candidate"

    def test_reports_manual_title_lock_preserved_without_mutation(
        self, conversation_service, store
    ):
        conv = conversation_service.start_conversation(interface="cli", title="Initial title")
        conversation_service.add_message(conv.id, "user", "Quero corrigir títulos")
        conversation_service.add_message(conv.id, "assistant", "Vamos desenhar a correção")
        conversation_service.update_title(conv.id, "Manual conversation title")
        before = store.get_conversation(conv.id)

        report = conversation_service.dry_run_metadata_lifecycle(conv.id)

        after = store.get_conversation(conv.id)
        assert report["fields"]["title"]["decision"] == "preserve"
        assert report["fields"]["title"]["lock_state"] == "manual_locked"
        assert after.title == before.title
        assert after.metadata == before.metadata

    def test_reports_existing_raw_summary_as_refine_candidate(
        self, conversation_service, store
    ):
        conv = conversation_service.start_conversation(interface="cli", title="Antes de mim")
        conversation_service.add_message(conv.id, "user", "Vamos trabalhar no projeto")
        conversation_service.add_message(conv.id, "assistant", "Contexto carregado")
        store.update_conversation(
            conv.id,
            summary=(
                "vamos trabalhar no projeto antes de mim Builder Mode ativo. "
                "Contexto carregado: editor do livro. 1. Revisar amostras. "
                "2. Validar `texto-raw/`. Path: /Users/alissonvale/projeto/livro"
            ),
        )

        report = conversation_service.dry_run_metadata_lifecycle(conv.id)

        summary = report["fields"]["summary"]
        assert summary["decision"] == "refine_candidate"
        assert summary["reason"] == "stored summary needs editorial refinement"
        assert report["fields"]["tags"]["decision"] == "create"
        assert report["fields"]["tags"]["reason"] == "conversation has enough substance for tags"
        assert "contains_markdown" in summary["evidence"]["quality_issues"]
        assert "contains_paths" in summary["evidence"]["quality_issues"]

    def test_reports_summary_and_tags_ready_from_conversation_substance(
        self, conversation_service
    ):
        conv = conversation_service.start_conversation(interface="cli", title="Metadata lifecycle")
        conversation_service.add_message(conv.id, "user", "Vamos tratar o título")
        conversation_service.add_message(conv.id, "assistant", "Podemos criar uma política")
        conversation_service.add_message(conv.id, "user", "Também resumo e tags")
        conversation_service.add_message(conv.id, "assistant", "Então precisamos de readiness por campo")

        report = conversation_service.dry_run_metadata_lifecycle(conv.id)

        assert report["fields"]["summary"]["decision"] == "create"
        assert report["fields"]["summary"]["readiness"] == "ready"
        assert report["fields"]["tags"]["decision"] == "create"
        assert report["fields"]["tags"]["reason"] == "conversation has enough substance for tags"
        assert report["fields"]["tags"]["readiness"] == "ready"

    def test_debug_preview_at_message_uses_transcript_boundary_without_mutation(
        self, conversation_service, store
    ):
        conv = conversation_service.start_conversation(interface="cli", title="Metadata lifecycle")
        first = conversation_service.add_message(conv.id, "user", "Vamos tratar o título")
        conversation_service.add_message(conv.id, "assistant", "Podemos criar uma política")
        conversation_service.add_message(conv.id, "user", "Também resumo e tags")
        conversation_service.add_message(conv.id, "assistant", "Então precisamos de readiness por campo")
        before = store.get_conversation(conv.id)

        report = conversation_service.dry_run_metadata_lifecycle_at_message(first.id)

        after = store.get_conversation(conv.id)
        assert report["mode"] == "debug_preview_at_message"
        assert report["mutated"] is False
        assert report["conversation_id"] == conv.id
        assert report["message_id"] == first.id
        assert report["included_message_count"] == 1
        assert report["excluded_message_count"] == 3
        assert report["dry_run"]["fields"]["summary"]["decision"] == "defer"
        assert after.title == before.title
        assert after.metadata == before.metadata


class TestConversationServiceMetadataBackfillPreview:
    def test_previews_safe_backfill_candidates_without_mutation(self, conversation_service, store):
        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.set_provisional_title(conv.id, "vamos trabalhar no maestro")
        conversation_service.add_message(conv.id, "user", "Vamos validar checkpoint visibility")
        conversation_service.add_message(conv.id, "assistant", "Vamos revisar o handoff")
        before = store.get_conversation(conv.id)

        report = conversation_service.preview_metadata_backfill(mode="safe", limit=5)

        after = store.get_conversation(conv.id)
        candidate = next(item for item in report["candidates"] if item["conversation_id"] == conv.id)
        assert report["mode"] == "metadata_backfill_preview"
        assert report["mutated"] is False
        assert report["profile"] == "backfill_safe"
        assert candidate["actions"]["title"] == "apply"
        assert after.title == before.title
        assert after.metadata == before.metadata

    def test_force_backfill_marks_existing_metadata_for_regeneration(
        self, conversation_service
    ):
        conv = conversation_service.start_conversation(
            interface="cli",
            title="Existing conversation title",
        )
        conversation_service.add_message(conv.id, "user", "Vamos validar metadata")
        conversation_service.add_message(conv.id, "assistant", "Podemos regenerar tudo")

        report = conversation_service.preview_metadata_backfill(mode="force", limit=5)

        candidate = next(item for item in report["candidates"] if item["conversation_id"] == conv.id)
        assert report["profile"] == "backfill_force"
        assert candidate["actions"]["title"] == "regenerate"


class TestConversationServiceMetadataBackfillApply:
    def test_applies_safe_backfill_to_bounded_candidates(
        self, conversation_service, store, mocker
    ):
        import json

        mocker.patch(
            "memory.services.conversation.generate_conversation_title",
            return_value="Maestro checkpoint validation",
        )
        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.set_provisional_title(conv.id, "vamos trabalhar no maestro")
        conversation_service.add_message(conv.id, "user", "Vamos validar checkpoint visibility")
        conversation_service.add_message(conv.id, "assistant", "Vamos revisar o handoff")

        report = conversation_service.apply_metadata_backfill(mode="safe", limit=5)

        stored = store.get_conversation(conv.id)
        metadata = json.loads(stored.metadata)
        assert report["mode"] == "metadata_backfill_apply"
        assert report["mutated"] is True
        assert report["changed_count"] == 1
        assert stored.title == "Maestro checkpoint validation"
        assert metadata["last_metadata_update_source"] == "metadata_backfill_apply"

    def test_force_backfill_regenerates_existing_metadata(
        self, conversation_service, store, mocker
    ):
        import json

        mocker.patch(
            "memory.services.conversation.generate_conversation_title",
            return_value="Regenerated metadata title",
        )
        mocker.patch(
            "memory.services.conversation.generate_conversation_summary",
            return_value="Regenerated summary paragraph.",
        )
        mocker.patch(
            "memory.services.conversation.generate_conversation_tags",
            return_value=["metadata backfill", "conversation maintenance"],
        )
        conv = conversation_service.start_conversation(
            interface="cli",
            title="Old generated title",
        )
        conversation_service.add_message(conv.id, "user", "Vamos validar metadata")
        conversation_service.add_message(conv.id, "assistant", "Podemos regenerar tudo")
        store.update_conversation(conv.id, summary="Old summary", tags=json.dumps(["old"]))

        report = conversation_service.apply_metadata_backfill(mode="force", limit=5)

        stored = store.get_conversation(conv.id)
        assert report["profile"] == "backfill_force"
        assert stored.title == "Regenerated metadata title"
        assert stored.summary == "Regenerated summary paragraph."
        assert json.loads(stored.tags) == ["metadata backfill", "conversation maintenance"]


class TestConversationServiceMetadataLifecycleApply:
    def test_applies_safe_repair_title_and_records_metadata(self, conversation_service, store):
        import json

        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.set_provisional_title(conv.id, "vamos trabalhar no maestro")
        conversation_service.add_message(conv.id, "user", "Vamos validar checkpoint visibility")
        conversation_service.add_message(conv.id, "assistant", "Vamos revisar o handoff")

        report = conversation_service.apply_metadata_lifecycle(
            conv.id,
            title="Maestro checkpoint visibility validation",
        )

        stored = store.get_conversation(conv.id)
        metadata = json.loads(stored.metadata)
        assert report["mode"] == "apply"
        assert report["mutated"] is True
        assert report["changed"]["title"] == "Maestro checkpoint visibility validation"
        assert stored.title == "Maestro checkpoint visibility validation"
        assert metadata["title_status"] == "generated"
        assert metadata["title_source"] == "metadata_lifecycle_apply"
        assert metadata["metadata_lifecycle_version"] == 1
        assert metadata["last_metadata_update_source"] == "metadata_lifecycle_apply"

    def test_preserves_manual_title_lock_even_when_title_provided(
        self, conversation_service, store
    ):
        conv = conversation_service.start_conversation(interface="cli", title="Initial title")
        conversation_service.add_message(conv.id, "user", "Quero corrigir títulos")
        conversation_service.add_message(conv.id, "assistant", "Vamos desenhar a correção")
        conversation_service.update_title(conv.id, "Manual conversation title")
        before = store.get_conversation(conv.id)

        report = conversation_service.apply_metadata_lifecycle(
            conv.id,
            title="Generated replacement title",
        )

        after = store.get_conversation(conv.id)
        assert report["mutated"] is False
        assert report["skipped"]["title"] == "manual_lock_preserved"
        assert after.title == before.title
        assert after.metadata == before.metadata

    def test_does_not_apply_refine_candidate_without_explicit_review(
        self, conversation_service, store
    ):
        conv = conversation_service.start_conversation(
            interface="cli",
            title="Initial editorial session",
        )
        conversation_service.add_message(conv.id, "user", "Let's begin")
        conversation_service.add_message(conv.id, "assistant", "Ready")
        store.update_conversation(
            conv.id,
            summary=(
                "Editorial workflow for Raphael Albino manuscript. "
                "Scrivener import, cover briefing, Kindle export, EPUB validation, "
                "chapter cleanup, raw text hygiene, and publishing preparation."
            ),
        )
        before = store.get_conversation(conv.id)

        report = conversation_service.apply_metadata_lifecycle(
            conv.id,
            title="Better editorial workflow title",
        )

        after = store.get_conversation(conv.id)
        assert report["dry_run"]["fields"]["title"]["decision"] == "refine_candidate"
        assert report["skipped"]["title"] == "candidate_decision_requires_explicit_review"
        assert after.title == before.title
        assert after.metadata == before.metadata

    def test_generated_apply_creates_tags_from_clean_temporary_summary_when_stored_summary_is_raw(
        self, conversation_service, store, mocker
    ):
        import json

        mocker.patch(
            "memory.services.conversation.generate_conversation_summary",
            return_value="Metadata lifecycle maintenance for conversation titles summaries and tags.",
        )
        mocker.patch(
            "memory.services.conversation.generate_conversation_tags",
            return_value=["metadata lifecycle", "conversation maintenance", "ariad"],
        )
        conv = conversation_service.start_conversation(interface="cli", title="Metadata")
        conversation_service.add_message(conv.id, "user", "Vamos tratar metadados")
        conversation_service.add_message(conv.id, "assistant", "Podemos usar manutenção contextual")
        conversation_service.add_message(conv.id, "user", "Também revisar tags")
        conversation_service.add_message(conv.id, "assistant", "Gerar tags sem ruído técnico")
        store.update_conversation(
            conv.id,
            summary="Raw summary with `code`, /Users/alissonvale/path, 10px, 1b63c00",
        )

        report = conversation_service.apply_generated_metadata_lifecycle(conv.id)

        stored = store.get_conversation(conv.id)
        tags = json.loads(stored.tags)
        assert report["dry_run"]["fields"]["summary"]["decision"] == "refine_candidate"
        assert report["changed"]["tags"] == tags
        assert "1b63c00" not in tags
        assert "10px" not in tags
        assert "metadata lifecycle" in tags

    def test_generated_apply_creates_ready_metadata_from_report(
        self, conversation_service, store, mocker
    ):
        import json

        mocker.patch(
            "memory.services.conversation.generate_conversation_title",
            return_value="Metadata Lifecycle Planning",
        )
        mocker.patch(
            "memory.services.conversation.generate_conversation_summary",
            return_value="Clean metadata lifecycle planning summary.",
        )
        mocker.patch(
            "memory.services.conversation.generate_conversation_tags",
            return_value=["metadata lifecycle", "conversation maintenance"],
        )
        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.add_message(conv.id, "user", "Vamos tratar o título")
        conversation_service.add_message(conv.id, "assistant", "Podemos criar uma política")
        conversation_service.add_message(conv.id, "user", "Também resumo e tags")
        conversation_service.add_message(conv.id, "assistant", "Então precisamos de readiness por campo")

        report = conversation_service.apply_generated_metadata_lifecycle(conv.id)

        stored = store.get_conversation(conv.id)
        metadata = json.loads(stored.metadata)
        assert report["mutated"] is True
        assert report["changed"]["title"] == "Metadata Lifecycle Planning"
        assert report["changed"]["summary"] == "Clean metadata lifecycle planning summary."
        assert "tags" in report["changed"]
        assert stored.title == "Metadata Lifecycle Planning"
        assert stored.summary == "Clean metadata lifecycle planning summary."
        assert json.loads(stored.tags)
        assert metadata["last_metadata_update_source"] == "metadata_lifecycle_apply"

    def test_applies_summary_and_tags_when_ready(self, conversation_service, store):
        import json

        conv = conversation_service.start_conversation(interface="cli", title="Metadata lifecycle")
        conversation_service.add_message(conv.id, "user", "Vamos tratar o título")
        conversation_service.add_message(conv.id, "assistant", "Podemos criar uma política")
        conversation_service.add_message(conv.id, "user", "Também resumo e tags")
        conversation_service.add_message(conv.id, "assistant", "Então precisamos de readiness por campo")

        report = conversation_service.apply_metadata_lifecycle(
            conv.id,
            summary="Conversation metadata lifecycle planning.",
            tags=["metadata", "conversation"],
        )

        stored = store.get_conversation(conv.id)
        metadata = json.loads(stored.metadata)
        assert report["mutated"] is True
        assert stored.summary == "Conversation metadata lifecycle planning."
        assert json.loads(stored.tags) == ["metadata", "conversation"]
        assert metadata["summary_status"] == "generated"
        assert metadata["tags_status"] == "generated"

    def test_dry_run_remains_non_mutating_after_apply_path_exists(
        self, conversation_service, store
    ):
        conv = conversation_service.start_conversation(interface="cli")
        conversation_service.set_provisional_title(conv.id, "vamos trabalhar no maestro")
        conversation_service.add_message(conv.id, "user", "Vamos validar checkpoint visibility")
        conversation_service.add_message(conv.id, "assistant", "Vamos revisar o handoff")
        before = store.get_conversation(conv.id)

        report = conversation_service.dry_run_metadata_lifecycle(conv.id)

        after = store.get_conversation(conv.id)
        assert report["mutated"] is False
        assert after.title == before.title
        assert after.metadata == before.metadata
