"""Persistence façade for the memory database.

The concrete table/aggregate operations live in focused storage components.
`Store` keeps the historical public API by combining those components behind one
SQLite connection.
"""

import sqlite3

from memory.db import get_connection
from memory.storage.attachments import AttachmentStore
from memory.storage.builder_workbench import BuilderWorkbenchStore
from memory.storage.consolidations import ConsolidationStore
from memory.storage.conversations import ConversationStore
from memory.storage.explorer_stories import ExplorerStoryStore
from memory.storage.identity import IdentityStore
from memory.storage.llm_calls import LLMCallStore
from memory.storage.memories import MemoryStore
from memory.storage.messages import MessageStore
from memory.storage.runtime_sessions import RuntimeSessionStore
from memory.storage.tasks import TaskStore


class Store(
    ConversationStore,
    ExplorerStoryStore,
    BuilderWorkbenchStore,
    RuntimeSessionStore,
    MessageStore,
    MemoryStore,
    IdentityStore,
    AttachmentStore,
    TaskStore,
    LLMCallStore,
    ConsolidationStore,
):
    def __init__(self, conn: sqlite3.Connection | None = None):
        self.conn = conn or get_connection()
