[< Product](index.md)

# Python API

Reference for developers integrating programmatically with Mirror Core.

## CLI vs. Python API

- **CLI** (`uv run python -m memory ...`) — the runtime interface. Use for
  seeding, inspecting, and operating the mirror from a shell or a skill.
- **Python API** (`from memory import MemoryClient`) — the programmatic
  interface. Use when building extensions, scripting multi-step workflows, or
  integrating Mirror Core into another tool.

The two serve different purposes. Most users never need the Python API directly.
For extension authoring patterns and integration examples, see
[docs/product/extensions/authoring-guide.md](extensions/authoring-guide.md).

---

## MemoryClient

The public façade for all Mirror Core operations.

```python
from memory import MemoryClient

mem = MemoryClient()                        # uses MEMORY_ENV from environment
mem = MemoryClient(env="test")              # explicit environment
mem = MemoryClient(db_path="/path/to/db")   # explicit database path
```

**Always close the client when done.** `MemoryClient` holds a SQLite
connection. Python's garbage collector does not reliably release OS file
descriptors. Use as a context manager or call `close()` explicitly:

```python
with MemoryClient() as mem:
    mem.add_message(conv.id, role="user", content="...")
```

---

## Lifecycle

### `close() -> None`

Close the underlying SQLite connection and release its file descriptors.
Safe to call multiple times. After `close()`, the client must not be used.

### `__enter__` / `__exit__`

Context manager support. Calls `close()` on exit.

### `reset() -> None`

Delete all database data. Blocked in production (`MEMORY_ENV=production`).
Use only in test or development environments.

---

## Conversations

### `start_conversation(interface, persona=None, journey=None, title=None) -> Conversation`

Open a new conversation session.

| Parameter | Type | Description |
|---|---|---|
| `interface` | `str` | Runtime identifier: `"pi"`, `"claude_code"`, `"gemini_cli"`, `"codex"` |
| `persona` | `str \| None` | Active persona slug |
| `journey` | `str \| None` | Active journey slug |
| `title` | `str \| None` | Human-readable title |

Returns: `Conversation` with `id`, `interface`, `persona`, `journey`, `started_at`.

### `add_message(conversation_id, role, content, token_count=None) -> Message`

Append a message to a conversation.

| Parameter | Type | Description |
|---|---|---|
| `conversation_id` | `str` | Conversation ID from `start_conversation` |
| `role` | `str` | `"user"` or `"assistant"` |
| `content` | `str` | Message text |

Returns: `Message`.

### `end_conversation(conversation_id, extract=True) -> list[Memory]`

Close a conversation and optionally run memory extraction.

Extraction fires only when a journey is set and the conversation has at least
four messages (quality guard). Returns the list of extracted `Memory` objects,
or `[]` when extraction does not run.

---

## Memories

### `add_memory(title, content, memory_type, layer="ego", ...) -> Memory`

Store a memory directly, without extraction.

| Parameter | Type | Description |
|---|---|---|
| `title` | `str` | Short title |
| `content` | `str` | Full memory text |
| `memory_type` | `str` | One of: `decision`, `insight`, `idea`, `journal`, `tension`, `learning`, `pattern`, `commitment`, `reflection` |
| `layer` | `str` | One of: `self`, `ego`, `shadow`, `persona`, `journey`, `journey_path` |
| `journey` | `str \| None` | Journey slug |
| `persona` | `str \| None` | Persona slug |

Returns: `Memory`.

### `add_journal(content, title=None, layer=None, journey=None, ...) -> Memory`

Store a journal entry as a memory with `memory_type="journal"`.

### `search(query, limit=5, memory_type=None, layer=None, journey=None) -> list[SearchResult]`

Hybrid search across memories.

Returns a ranked list of `SearchResult` objects. Each `SearchResult` has a
`memory` attribute (`Memory`) and a `score` attribute (`float`).

Hybrid scoring combines semantic similarity (cosine), recency, FTS5 lexical
search, honest reinforcement, and manual relevance, followed by MMR
deduplication.

### `log_use(memory_id) -> None`

Mark a memory as used in a response. Increments `use_count`, which is the
stronger reinforcement signal. Call this when the model explicitly draws on a
specific memory in its answer.

---

## Identity and Journeys

### `get_identity(layer=None, key=None) -> str | list[Identity] | None`

Read an identity record from the database.

- `get_identity("self", "soul")` → `str` content of that record
- `get_identity(layer="persona")` → `list[Identity]` of all persona records
- `get_identity()` → `list[Identity]` of all identity records

### `set_identity(layer, key, content, version="1.0.0", metadata=None) -> Identity`

Write an identity record. Creates or replaces the record at `(layer, key)`.

### `load_mirror_context(persona=None, journey=None, org=False, query=None, touches_identity=True, touches_shadow=False) -> str`

Build the full mirror context string used in Mirror Mode. Composes identity
layers, relevant memories, journey context, and attachments into a single
formatted string for injection into the AI prompt.

| Parameter | Type | Description |
|---|---|---|
| `persona` | `str \| None` | Persona to load |
| `journey` | `str \| None` | Journey to include |
| `query` | `str \| None` | Query for memory and attachment search |
| `touches_identity` | `bool` | When `False`, omits self/soul and ego/identity layers (lightweight mode) |
| `touches_shadow` | `bool` | When `True`, includes shadow layer content if present |

Returns: formatted context string.

### `get_journey_path(journey) -> str | None`

Return the journey path content (living status document) for a journey.

### `set_journey_path(journey, content) -> Identity`

Write the journey path for a journey.

### `list_active_journeys() -> list[dict]`

Return all active journeys as a list of dicts with `id`, `key`, `content`,
and metadata.

### `detect_journey(query, threshold=0.35) -> list[tuple[str, float, str]]`

Score the query against all journeys. Returns `(journey_id, score, match_type)`
tuples, sorted by score descending.

### `get_journey_status(journey=None) -> dict`

Return status, stage, and journey-path content for a journey. If `journey` is
`None`, returns status for all active journeys.

### `detect_persona(query, threshold=1.0) -> list[tuple[str, float, str]]`

Score the query against all persona routing keywords. Returns
`(persona_id, score, match_type)` tuples. The default threshold is permissive;
pass a lower value to get only high-confidence matches.

---

## Tasks

### `add_task(title, journey=None, due_date=None, scheduled_at=None, stage=None, source="manual") -> Task`

Create a task.

### `complete_task(task_id) -> None`

Mark a task as done.

### `list_tasks(journey=None, status=None, open_only=False) -> list[Task]`

List tasks, optionally filtered by journey, status, or open-only.

### `import_tasks_from_journey_path(journey) -> list[Task]`

Parse tasks from the journey path document and store them.

---

## Attachments

Attachments are reference documents stored per journey and searched
semantically. Use them for specs, research notes, financial context, or any
long-form document the mirror should be able to retrieve during a session.

### `add_attachment(journey_id, name, content, ...) -> Attachment`

Store a document. Generates an embedding at ingestion time.

| Parameter | Type | Description |
|---|---|---|
| `journey_id` | `str` | Journey this attachment belongs to |
| `name` | `str` | Unique name within the journey |
| `content` | `str` | Document text |

### `search_attachments(journey_id, query, limit=3) -> list[tuple[Attachment, float]]`

Semantic search within one journey's attachments. Returns `(Attachment, score)`
tuples sorted by score descending.

### `search_all_attachments(query, limit=5) -> list[tuple[Attachment, float]]`

Semantic search across all journeys' attachments. Use when the journey is unknown.

### `get_attachments(journey_id) -> list[Attachment]`

List all attachments for a journey.

### `get_attachment(journey_id, name) -> Attachment | None`

Retrieve a specific attachment by name.

### `remove_attachment(journey_id, name) -> bool`

Delete an attachment. Returns `True` if the attachment existed and was removed.

---

**See also:** [Architecture](architecture.md) ·
[Extension Authoring Guide](extensions/authoring-guide.md) ·
[REFERENCE.md](../../REFERENCE.md)
