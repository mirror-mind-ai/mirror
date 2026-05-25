[< Docs](../index.md)

# Engineering Principles

Guidelines for code architecture, testing, and process. These principles apply
to all work on this codebase.

---

## Code

**Service layer is the architecture.**
`MemoryClient` is a façade. Services are the implementation. Storage handles
persistence. The import direction rule and full layer model are in
[docs/product/architecture.md](../product/architecture.md).

**English everywhere.**
Variable names, function names, CLI commands, schema columns, identity layer
keys, commit messages, and documentation are all English. The only exceptions
are user-authored content (journal entries, journey descriptions) and
migration-only code that handles old schemas.

**No logic in interfaces.**
Skill scripts (`.claude/skills/`, `.pi/skills/`) are entry points. They may
parse arguments and call `sys.exit`, but they do not contain business logic.
Logic belongs in `src/memory/skills/` or the relevant service.

**Small, focused modules.**
One module, one responsibility. `conversation.py` handles conversation
lifecycle. `extraction.py` handles LLM extraction. `search.py` handles hybrid
search. Do not grow a module sideways — extract a new one.

**Explicit over implicit.**
Production database mutations require explicit confirmation. Extraction requires
explicit guard conditions (journey + ≥4 messages). The system does not guess;
it requires.

---

## Testing

**Unit tests mock I/O, never hit real APIs.**
The CI must pass without `OPENAI_API_KEY` or `OPENROUTER_API_KEY`. Unit tests
mock embedding generation and LLM extraction. If a test calls a real API, it is
an integration test and must be explicitly marked as such.

**Integration tests hit a real SQLite file.**
The test database is `memory_test.db` under `MEMORY_DIR`. Integration tests use
`MEMORY_ENV=test`. They are not mocked — they exercise real database reads and
writes.

**Smoke tests use an isolated environment.**
End-to-end validation uses a temporary `HOME` and explicit `MEMORY_DIR` to
prevent touching the production database. The environment variables must be set
to empty strings before subprocess invocation to prevent `.env` from
repopulating them.

**Coverage is pragmatic.**
The current threshold is 40%. This is deliberately low — the system has complex
I/O-heavy paths that are expensive to test fully. Raise the threshold as the
core stabilizes and coverage gaps are closed intentionally.

**Every story ends with a concrete verification moment.**
The test guide for a story is not a description — it is a sequence of
copy-paste-runnable commands with expected output. Someone should be able to
run through it without reading the plan.

---

## Process

**Design before code.**
For non-trivial work: explore the codebase, design the approach, present for
approval. The plan becomes the story doc. Only then write code.

**TDD by default.**
Tests exist before marking a story done. For behavior changes, tests come
first. The CI gate is the minimum bar — it does not substitute for judgment
about test quality.

**Small stories, concrete verification.**
A story should be completable in one session. If it cannot be verified
end-to-end at the end of the session, it is too large — split it. The full
story lifecycle, including checkpoints and coherence checks, lives in the
[Development Guide](development-guide.md).

**Docs updated in the same cycle.**
When code changes: update the relevant docs in the same commit or the same PR.
Docs that describe a state the code no longer reflects are worse than no docs.

**Refactoring evaluated in-cycle.**
When a story is done, ask: what design debt did we accumulate? What can we clean
now without breaking scope? Refactoring is not a separate track — it is part of
delivery.

**Commits stay small and English.**
One concern per commit. Descriptive English message. No `fix stuff`, no `WIP`,
no Portuguese names in commit messages.

**Versions and release notes are part of delivery.**
From CV9.E5 onward, version bumps follow the prospective rule in
[Versioning](versioning.md), and future releases receive narrative release notes
as defined in [Release Notes](release-notes.md).

---

**See also:** [Product Principles](../product/principles.md) ·
[Development Guide](development-guide.md) · [Architecture](../product/architecture.md)
