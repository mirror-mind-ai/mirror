[< S7 index](index.md)

# CV9.E4.S7 — Plan: Python API Doc

---

## Purpose and Audience

`docs/product/api.md` is written for **developers who need to interact with Mirror Core
programmatically** — extension authors building `command-skill` extensions,
contributors adding new capabilities to Mirror Core, and anyone scripting
against the memory system outside of the CLI.

This is a reference document, not a tutorial. It answers: what methods exist,
what do they take, and what do they return? Worked examples and integration
patterns live in `docs/product/extensions/` (the extension authoring guide),
not here.

---

## Opening Section

One short section before the method reference explaining when to use the Python
API versus the CLI:

- **CLI** (`python -m memory ...`) — the runtime interface. Use for seeding,
  inspecting, and operating the mirror from a shell or a skill.
- **Python API** (`from memory import MemoryClient`) — the programmatic
  interface. Use when building extensions, scripting multi-step workflows, or
  integrating Mirror Core into another tool.

The two are not alternatives — they serve different purposes. Most users never
need the Python API directly.

---

## Structure

Methods organized by domain. For each method: signature, parameters, return
type, and one-line description. No prose beyond what is needed to understand
the method.

```
## MemoryClient

Instantiation

## Conversations

start_conversation
add_message
end_conversation

## Memories

add_memory
add_journal
search

## Identity and Journeys

get_identity
set_identity
get_journey_path
set_journey_path
list_active_journeys
detect_journey
get_journey_status
load_mirror_context

## Tasks

add_task
complete_task
list_tasks
import_tasks_from_journey_path

## Attachments

add_attachment
search_attachments
search_all_attachments

## Lifecycle

close
__enter__ / __exit__
log_use
```

---

## Method Entry Format

Each method entry follows this pattern:

```
### method_name(param: type, ...) -> ReturnType

One-line description of what the method does.

| Parameter | Type | Description |
|---|---|---|
| param | type | what it is |

Returns: what the return value is.
```

Keep parameter tables only when there are three or more parameters. For one or
two parameters, inline the description.

---

## Instantiation

```python
from memory import MemoryClient

mem = MemoryClient()                    # uses MEMORY_ENV from environment
mem = MemoryClient(env="test")          # explicit environment
```

Note the lifecycle: `MemoryClient` holds a SQLite connection. Always close it
explicitly or use as a context manager:

```python
with MemoryClient() as mem:
    mem.add_message(...)
```

---

## Content Source

The authoritative source for method signatures is `src/memory/__init__.py`
(the `MemoryClient` façade) and `src/memory/client.py`. Read these files at
execution time to ensure signatures are current — do not copy from
`REFERENCE.md`, which is being removed as the API source in S3.

---

## What This Document Does Not Cover

- Internal/private methods (anything prefixed with `_`)
- Service layer below `MemoryClient` (`ConversationService`,
  `MemoryService`, etc.) — the public façade is the documented surface
- CLI commands — those are in `REFERENCE.md`
- Extension authoring patterns — those are in `docs/product/extensions/`
- Automated doc generation — this is a handwritten reference, consistent
  with the rest of the doc set

---

## See also

- [S7 index](index.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
- [S6 — Cross-Reference Audit](../cv9-e4-s6-cross-reference-audit/index.md)
- [Extension authoring guide](../../../../../product/extensions/authoring-guide.md)
