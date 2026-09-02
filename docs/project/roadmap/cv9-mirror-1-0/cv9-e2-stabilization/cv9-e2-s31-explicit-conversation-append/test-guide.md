[< CV9.E2.S31](index.md)

# Test Guide — CV9.E2.S31 Explicit Conversation Append Boundary

## Automated Validation

Focused commands to be finalized with implementation paths:

```bash
uv run pytest tests/unit/memory/services/test_conversation_append.py -v
uv run pytest tests/integration/memory/storage/test_conversation_append.py -v
uv run pytest tests/integration/memory/cli/test_conversations_append.py -v
```

Required full gate:

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

Expected:

- focused contract, service, storage, CLI, privacy, transaction and regression tests pass;
- full keyless unit/integration suite passes;
- Ruff, format, mypy and diff checks satisfy the repository gate;
- no model or network credential is required.

## Required Test Matrix

| Boundary | Scenario | Expected |
|---|---|---|
| stdin | exactly 262,144 UTF-8 bytes | read completes within bound; request then validates normally |
| stdin | 262,145 or more bytes | `limit_exceeded`, no JSON parse and no DB write |
| UTF-8 | multibyte content below/at/above 51,200 bytes | byte-accurate acceptance/rejection |
| parser containment | metadata nested deeply enough to raise `RecursionError` | bounded `malformed_request`, nonzero exit, no traceback/echo/write |
| UTF-8 containment | unpaired surrogate in content | bounded `malformed_request`, nonzero exit, no traceback/echo/write |
| metadata containment | unpaired surrogate or equivalent encoding failure in metadata | bounded `malformed_request`, nonzero exit, no traceback/echo/write |
| metadata | caller object fits alone but full envelope exceeds 4,096 bytes | `limit_exceeded`, no write |
| timestamp | equivalent offset timestamps | same canonical UTC persisted/comparison value |
| message ID | empty string | rejected before any write |
| message ID | space, tab, or other whitespace | rejected before any write |
| message ID | embedded newline | rejected before any write; raw ID is not echoed |
| message ID | embedded control character | rejected before any write; raw ID is not echoed |
| message ID | Unicode or other multibyte character | rejected before any write |
| message ID | 129 ASCII characters | rejected before any write |
| message ID | UUID `550e8400-e29b-41d4-a716-446655440000` | accepted by `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}` and safely echoed in receipt |
| message ID | timestamp-shaped `turn:2026-08-29T12:00:00.000Z` | accepted with period, hyphen, and colon and safely echoed in receipt |
| batch | new user and assistant pair | both inserted atomically in request order receipt |
| retry | complete identical retry | accepted; all `existing`; no duplicate |
| retry | one existing and one absent | existing acknowledged; missing inserted once |
| conflict | same ID, another conversation | complete request rejected; no new rows |
| conflict | same ID, divergent role/content/time/source/metadata | complete request rejected; no new rows |
| failure | injected second-insert SQLite failure | all absent inserts rolled back |
| authority | missing exact conversation | `conversation_not_found`; nothing created |
| authority | Journey mismatch | `journey_mismatch`; no write |
| lifecycle | exact ended conversation | append accepted; `ended_at` unchanged |
| lifecycle | late append after extraction | transcript grows; extraction state/memories unchanged |
| sessions | stale runtime session points elsewhere | ignored; exact payload destination receives batch |
| sessions | SQL trace/authorizer | no read or write of `runtime_sessions` |
| ordering | equal `created_at` values | reads ordered by `created_at, id` |
| privacy | success and every failure | no content, caller metadata, environment, secret, path or raw exception echoed |
| receipt safety | accepted and rejected message IDs | success echoes only validated single-line ASCII IDs of at most 128 characters; invalid raw IDs are not reflected |
| regression | ordinary logger/backfill | behavior unchanged |

## Navigator Validation

Run only against an isolated temporary Mirror home/database. The final copy-paste smoke script must:

1. capture the production database checksum without opening it for writes;
2. create an isolated Journey, destination conversation and unrelated stale runtime session;
3. invoke `conversations append` with JSON stdin;
4. verify exact inserted rows and canonical metadata envelope;
5. retry and verify `existing` states;
6. mark the isolated conversation ended and complete a missing retry against the original exact ID;
7. verify `ended_at`, runtime sessions, extraction metadata and memories did not change;
8. reject empty, whitespace, newline, control, Unicode, and 129-character message IDs before any write;
9. accept a UUID and `turn:2026-08-29T12:00:00.000Z`, confirming receipts echo only validated ASCII IDs bounded to 128 characters;
10. run conflict, mismatch, malformed, UTF-8 byte-limit and oversized-envelope cases;
11. confirm the production checksum is unchanged.

Expected observation: the exact destination receives one atomic batch; repeat and late-generation retries are no-ops or complete only missing rows; no ambient runtime state influences the result.

Pass condition: all public receipts, exit statuses, canonical stored values, rollback evidence and unchanged-state assertions match `index.md` and `plan.md`.

Fail condition: any duplicate, partial write, invalid ID reaching storage, unsafe or overlong ID echoed in a receipt, implicit destination selection, runtime-session access, reopen/extraction side effect, unbounded read, UTF-8 limit error, data leak or undocumented public reason.

## Validation Evidence

Implementation reached Navigator Validation on
`feature/cv9-e2-s31-explicit-conversation-append` without commit, push, version
bump, or release action.

- Initial RED: the three focused test modules failed collection because
  `memory.services.conversation_append` did not exist.
- Navigator-correction RED: deep metadata leaked `RecursionError`; unpaired
  surrogates leaked `UnicodeEncodeError`; the CLI produced no bounded receipt.
- GREEN: 34 focused contract, storage, and CLI tests pass, including bounded
  containment with no traceback, payload echo, or database write.
- Related conversation regression selection passes.
- Isolated CLI smoke passes initial append, complete retry, missing-message late
  append to an ended conversation, canonical metadata, deterministic ordering,
  atomic conflict rejection, and unchanged runtime-session/conversation
  lifecycle state.
- `ruff check src/ tests/`, `ruff format --check src/ tests/`, scoped mypy for
  the three changed source modules, and `git diff --check` pass.
- The complete non-live suite reports 2,630 passed and one external-baseline failure:
  `tests/unit/memory/cli/test_runtime.py::test_connect_read_only_recovers_wal_database_without_sidecars`
  fails while querying its recovered fixture with `sqlite3.OperationalError:
  unable to open database file`. A controlled comparison using the same Python
  3.10.6, SQLite 3.51.0, variables, TMPDIR, and basetemp reproduces the identical
  failure in both S31 and a clean `origin/main` worktree. Read-only `connect()`
  returns lazily, then the first `SELECT` fails before the existing read-write
  recovery branch can run; neither the test nor `src/memory/cli/runtime.py` is
  changed by this Story.
- Full-repository mypy remains a pre-existing red gate with 131 errors in 29
  files; none is reported in the S31 source modules, which pass a scoped check.

Navigator acceptance remains pending. The gate divergences above are reported as
debt/evidence rather than silently attributed to S31.

## Conscious Exclusions

- No live model/provider test.
- No production database mutation.
- No Harness outbox compatibility test in Mirror; the consumer owns legacy outbox adaptation.
- No tag, stable promotion, GitHub Release or installed-runtime update at story validation.
