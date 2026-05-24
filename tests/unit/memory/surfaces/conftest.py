import numpy as np
import pytest


@pytest.fixture
def emb_vec():
    return np.ones(1536, dtype=np.float32) / np.sqrt(1536)


@pytest.fixture
def mock_memory_embedding(mocker, emb_vec):
    mocker.patch("memory.services.memory.generate_embedding", return_value=emb_vec)
    mocker.patch("memory.intelligence.search.generate_embedding", return_value=emb_vec)
    return emb_vec


@pytest.fixture
def attachment_service(store):
    from memory.services.attachment import AttachmentService

    return AttachmentService(store)


@pytest.fixture
def identity_service(store, attachment_service):
    from memory.services.identity import IdentityService

    return IdentityService(store, attachments=attachment_service)


@pytest.fixture
def journey_service(store, identity_service):
    from memory.services.journey import JourneyService

    return JourneyService(store, identity=identity_service)


@pytest.fixture
def memory_service(store):
    from memory.intelligence.search import MemorySearch
    from memory.services.memory import MemoryService

    return MemoryService(store, search_engine=MemorySearch(store))


@pytest.fixture
def task_service(store, journey_service):
    from memory.services.tasks import TaskService

    return TaskService(store, journeys=journey_service)


@pytest.fixture
def conversation_service(store, memory_service, task_service):
    from memory.services.conversation import ConversationService

    return ConversationService(store, memories=memory_service, tasks=task_service)
