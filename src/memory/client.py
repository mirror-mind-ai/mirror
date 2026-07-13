"""MemoryClient: unified facade for the memory system."""

from pathlib import Path

from memory.db import get_connection
from memory.intelligence.search import MemorySearch
from memory.models import Attachment, Conversation, Identity, Memory, Message, SearchResult, Task
from memory.services.attachment import AttachmentService
from memory.services.conversation import ConversationService
from memory.services.identity import IdentityService
from memory.services.journey import JourneyService
from memory.services.memory import MemoryService
from memory.services.operation_runs import OperationRunService
from memory.services.runtime_session import RuntimeSessionService
from memory.services.tasks import TaskService
from memory.storage.store import Store
from memory.surfaces import SurfaceService


def _require_journey(value: str | None, *, argument: str = "journey") -> str:
    if value is None:
        raise TypeError(f"missing required argument: '{argument}'")
    return value


class MemoryClient:
    def __init__(self, env: str | None = None, db_path: str | Path | None = None):
        from memory.config import MEMORY_ENV, db_path_for_env, require_db_path

        if env is None:
            env = MEMORY_ENV

        if db_path is not None:
            self.db_path = Path(db_path).expanduser()
        elif env == MEMORY_ENV:
            self.db_path = require_db_path()
        else:
            self.db_path = db_path_for_env(env)
        self.env = env
        self.conn = get_connection(self.db_path)
        self.store = Store(self.conn)
        self.search_engine = MemorySearch(self.store)

        # Services, wired bottom-up.
        self.runtime_sessions = RuntimeSessionService(self.store)
        self.operation_runs = OperationRunService(self.store)
        self.attachments = AttachmentService(self.store)
        self.identity = IdentityService(self.store, self.attachments)
        self.journeys = JourneyService(self.store, self.identity)
        self.tasks = TaskService(self.store, self.journeys)
        self.memories = MemoryService(self.store, self.search_engine)
        self.conversations = ConversationService(self.store, self.memories, self.tasks)
        self.surfaces = SurfaceService(
            identity=self.identity,
            journeys=self.journeys,
            memories=self.memories,
            conversations=self.conversations,
            tasks=self.tasks,
            attachments=self.attachments,
        )

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    # --- Lifecycle ---

    def close(self) -> None:
        """Close the underlying SQLite connection and release its file descriptors.

        Safe to call multiple times. After close(), the client must not be used.

        This matters under concurrency: Python's sqlite3.Connection does not
        release OS file descriptors through refcount-based cleanup alone on
        Python 3.14 — only on explicit close() or process exit. Long-running
        processes that create many short-lived clients (tests, scripts,
        pooled workers) will exhaust ``RLIMIT_NOFILE`` without this call.
        """
        conn = getattr(self, "conn", None)
        if conn is not None:
            try:
                conn.close()
            finally:
                self.conn = None  # type: ignore[assignment]

    def __enter__(self) -> "MemoryClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def __del__(self) -> None:
        # Best-effort cleanup if the caller forgets to close(). Not a substitute
        # for explicit close() — __del__ only runs when the GC gets around to it.
        try:
            self.close()
        except Exception:
            # __del__ must never raise; any error during close is swallowed.
            pass

    def reset(self) -> None:
        """Delete all database data. Blocked in production."""
        if self.is_production:
            raise RuntimeError(
                "reset() is blocked in production. Use MEMORY_ENV=development or MEMORY_ENV=test."
            )
        if self.conn is None:
            raise RuntimeError("reset() cannot run after close()")
        self.conn.executescript("""
            DELETE FROM memory_access_log;
            DELETE FROM conversation_embeddings;
            DELETE FROM runtime_sessions;
            DELETE FROM memories;
            DELETE FROM messages;
            DELETE FROM conversations;
            DELETE FROM identity;
            DELETE FROM attachments;
            DELETE FROM tasks;
        """)
        self.conn.commit()

    # --- Conversations ---

    def start_conversation(
        self, interface: str, persona=None, journey=None, title=None
    ) -> Conversation:
        return self.conversations.start_conversation(interface, persona, journey, title)

    def add_message(
        self, conversation_id: str, role: str, content: str, token_count=None
    ) -> Message:
        return self.conversations.add_message(conversation_id, role, content, token_count)

    def end_conversation(self, conversation_id: str, extract: bool = True) -> list[Memory]:
        return self.conversations.end_conversation(conversation_id, extract)

    # --- Memories ---

    def add_memory(
        self,
        title: str,
        content: str,
        memory_type: str,
        layer: str = "ego",
        context=None,
        persona=None,
        tags=None,
        conversation_id=None,
        journey=None,
    ) -> Memory:
        return self.memories.add_memory(
            title,
            content,
            memory_type,
            layer,
            context,
            journey,
            persona,
            tags,
            conversation_id,
        )

    def search(
        self,
        query: str,
        limit: int = 5,
        memory_type=None,
        layer=None,
        journey=None,
    ) -> list[SearchResult]:
        return self.memories.search(query, limit, memory_type, layer, journey)

    def get_by_type(self, memory_type: str) -> list[Memory]:
        return self.memories.get_by_type(memory_type)

    def get_by_layer(self, layer: str) -> list[Memory]:
        return self.memories.get_by_layer(layer)

    def get_by_journey(self, journey: str) -> list[Memory]:
        return self.memories.get_by_journey(journey)

    def get_timeline(self, start: str, end: str) -> list[Memory]:
        return self.memories.get_timeline(start, end)

    def log_use(self, memory_id: str) -> None:
        """Mark a memory as used in a response (increments use_count).

        Use is distinct from retrieval: a memory can be retrieved many times
        but should only be marked used when the model explicitly draws on it.
        Use is the stronger signal in honest reinforcement scoring.
        """
        self.store.log_use(memory_id)

    # --- Journal ---

    def add_journal(
        self,
        content: str,
        title=None,
        layer=None,
        tags=None,
        conversation_id=None,
        journey=None,
        metadata=None,
    ) -> Memory:
        return self.memories.add_journal(
            content,
            title,
            layer,
            tags,
            conversation_id,
            journey,
            metadata,
        )

    # --- Identity ---

    def set_identity(
        self,
        layer: str,
        key: str,
        content: str,
        version: str = "1.0.0",
        metadata: str | None = None,
    ) -> Identity:
        return self.identity.set_identity(layer, key, content, version, metadata)

    def get_identity(self, layer=None, key=None) -> str | list[Identity] | None:
        return self.identity.get_identity(layer, key)

    def load_mirror_context(
        self,
        persona=None,
        journey=None,
        org: bool = False,
        query=None,
        touches_identity: bool = True,
        touches_shadow: bool = False,
    ) -> str:
        return self.identity.load_mirror_context(
            persona, journey, org, query, touches_identity, touches_shadow
        )

    def load_full_identity(self) -> str:
        return self.identity.load_full_identity()

    # --- Journeys ---

    def get_journey_path(self, journey: str) -> str | None:
        return self.journeys.get_journey_path(journey)

    def set_journey_path(self, journey: str | None = None, content: str | None = None) -> Identity:
        if content is None:
            raise TypeError("set_journey_path() missing required argument: 'content'")
        return self.journeys.set_journey_path(_require_journey(journey), content)

    def get_journey_status(self, journey=None) -> dict:
        return self.journeys.get_journey_status(journey)

    def list_active_journeys(self) -> list[dict]:
        return self.journeys.list_active_journeys()

    def detect_journey(self, query: str, threshold: float = 0.35) -> list[tuple[str, float, str]]:
        return self.journeys.detect_journey(query, threshold)

    def detect_persona(self, query: str, threshold: float = 1.0) -> list[tuple[str, float, str]]:
        return self.identity.detect_persona(query, threshold)

    def get_sync_file(self, journey: str) -> str | None:
        return self.journeys.get_sync_file(journey)

    def set_sync_file(self, journey: str | None = None, file_path: str | None = None) -> None:
        if file_path is None:
            raise TypeError("set_sync_file() missing required argument: 'file_path'")
        return self.journeys.set_sync_file(_require_journey(journey), file_path)

    # --- Tasks ---

    def add_task(
        self,
        title: str,
        journey=None,
        due_date=None,
        scheduled_at=None,
        time_hint=None,
        stage=None,
        context=None,
        source: str = "manual",
    ) -> Task:
        return self.tasks.add_task(
            title, journey, due_date, scheduled_at, time_hint, stage, context, source
        )

    def list_tasks(self, journey=None, status=None, open_only: bool = False) -> list[Task]:
        return self.tasks.list_tasks(journey, status, open_only)

    def find_tasks(self, title_fragment: str, journey=None) -> list[Task]:
        return self.tasks.find_tasks(title_fragment, journey)

    def complete_task(self, task_id: str) -> None:
        return self.tasks.complete_task(task_id)

    def update_task(self, task_id: str, **kwargs) -> None:
        return self.tasks.update_task(task_id, **kwargs)

    def ingest_week_plan(self, text: str) -> list[dict]:
        return self.tasks.ingest_week_plan(text)

    def save_week_items(self, items: list) -> list[Task]:
        return self.tasks.save_week_items(items)

    def import_tasks_from_journey_path(self, journey: str) -> list[Task]:
        return self.tasks.import_tasks_from_journey_path(journey)

    def sync_tasks_from_file(self, journey: str) -> dict:
        return self.tasks.sync_tasks_from_file(journey)

    # --- Attachments ---

    def add_attachment(
        self,
        journey_id: str | None = None,
        name: str | None = None,
        content: str | None = None,
        description=None,
        content_type: str = "markdown",
        tags=None,
    ) -> Attachment:
        if name is None:
            raise TypeError("add_attachment() missing required argument: 'name'")
        if content is None:
            raise TypeError("add_attachment() missing required argument: 'content'")
        return self.attachments.add_attachment(
            _require_journey(journey_id, argument="journey_id"),
            name,
            content,
            description,
            content_type,
            tags,
        )

    def get_attachments(self, journey_id: str) -> list[Attachment]:
        return self.attachments.get_attachments(journey_id)

    def get_attachment(
        self, journey_id: str | None = None, name: str | None = None
    ) -> Attachment | None:
        if name is None:
            raise TypeError("get_attachment() missing required argument: 'name'")
        return self.attachments.get_attachment(
            _require_journey(journey_id, argument="journey_id"), name
        )

    def remove_attachment(self, journey_id: str | None = None, name: str | None = None) -> bool:
        if name is None:
            raise TypeError("remove_attachment() missing required argument: 'name'")
        return self.attachments.remove_attachment(
            _require_journey(journey_id, argument="journey_id"), name
        )

    def search_attachments(
        self,
        journey_id: str | None = None,
        query: str | None = None,
        limit: int = 3,
    ) -> list[tuple[Attachment, float]]:
        if query is None:
            raise TypeError("search_attachments() missing required argument: 'query'")
        return self.attachments.search_attachments(
            _require_journey(journey_id, argument="journey_id"), query, limit
        )

    def search_all_attachments(self, query: str, limit: int = 5) -> list[tuple[Attachment, float]]:
        return self.attachments.search_all_attachments(query, limit)
