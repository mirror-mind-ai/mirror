# Plan — CV22.DS5.US2 Extraction Record/Replay Parity

## Objective

Port the conversation extraction core path to TypeScript behind replayable LLM and embedding providers, without front-door routing. This story should make TS capable of taking an ended conversation on a database copy and producing Python-compatible extracted memory/task/summary persistence effects using scrubbed replay fixtures only.

## Python behavior to preserve

Reference files:

- `src/memory/intelligence/extraction.py`
- `src/memory/services/conversation.py`
- `src/memory/services/memory.py`
- `src/memory/services/tasks.py`
- `src/memory/models.py`

Core flow from `ConversationService._run_extraction`:

1. Load conversation and messages.
2. Return `[]` unless the conversation exists, has a `journey`, and has at least 4 messages.
3. Resolve transcript display name from `identity(user, identity)` when the known regex matches; otherwise use `User`.
4. Format transcript as `**{user_name}:** ...` for user messages and `**Mirror:** ...` for assistant messages.
5. Extract candidate memories through the configured extraction model.
6. Parse JSON responses after stripping optional markdown fences; malformed or non-list responses return `[]`.
7. Build `ExtractedMemory` values with Python-compatible validation: required `title`, `content`, `memory_type`; default `layer = "ego"`; default `tags = []`; reject unknown/invalid memory objects; backfill missing `persona`/`journey` from the conversation.
8. If two-pass curation is enabled, call curation only when candidates and existing memories exist; malformed/failed curation responses fail open by returning original candidates.
9. Extract tasks through a separate LLM call; failures must not block memory extraction. Create only tasks not already found by title fragment within the journey.
10. Generate summary through replayed LLM when summary mode is enabled, otherwise use Python's naive summary (`user`/`assistant` content chunks up to 500 chars, joined and truncated to 2000 chars). Store `summary[:1000]` and a conversation summary embedding.
11. Persist extracted memories using embedding text `"{title}. {content}" + " Context: {context}" when context exists`, JSON tags when present, `conversation_id`, and Python-compatible defaults.
12. Mark conversation metadata with `extracted: true` after successful extraction.

## Implementation Scope

Add a TS extraction core; do **not** route runtime commands yet.

Likely files:

```text
ts/src/providers/llm.ts                 # LLM provider interface + replay provider
ts/src/extraction/json.ts               # fenced JSON parser shared by extraction-style LLM outputs
ts/src/extraction/conversation.ts       # transcript formatting, extractMemories/extractTasks/curation helpers
ts/src/conversation/extraction.ts       # DB-copy orchestration and persistence effects
ts/test/extraction/*.test.ts            # parser/model/fixture tests
ts/test/conversation/extraction.test.ts # DB-copy orchestration tests
```

The final structure may differ if existing TS organization suggests a better seam, but keep the same boundaries:

- Provider replay separated from extraction parsing.
- Extraction parsing separated from DB persistence.
- DB persistence accepts injected providers and deterministic `now`/`id` generators.

## Provider / Fixture Contract

Introduce a text-generation provider abstraction, for example:

```ts
interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}
```

A replay provider should:

- Load through the existing `loadReplayFixture` safety checks.
- Support multiple role-keyed responses in one fixture (`extraction`, `task_extraction`, `summary`, optional `curation`).
- Preserve enough response metadata for optional `llm_calls` parity later, but logging front-door behavior is not required in this story.
- Refuse unsafe fixtures with unsanitized authorization headers, configured secrets, raw private transcripts, or real provider payloads.

CI must use replay fixtures only. Live-provider transport may be left as a manual/future seam and is not required for closure.

## Acceptance Behavior

```text
Given an ended conversation on a database copy with a journey and at least 4 messages
And scrubbed replay fixtures for extraction, task extraction, optional summary, and embeddings
When TS extraction runs with deterministic now/id generators
Then memory rows, task rows, conversation summary/embedding, and extracted metadata match the Python oracle semantics
And malformed extraction/curation/task responses fail the same way Python does
And no live provider call, credential, raw transcript fixture, or production DB mutation is required in CI
```

## Test Plan

Automated tests should cover:

1. `formatTranscript` matches Python role labels and spacing.
2. `_parse_json_response` parity: raw JSON, fenced JSON, empty string, malformed JSON.
3. `extractMemories` parsing:
   - valid objects become extracted memories;
   - missing optional `layer` defaults to `ego`;
   - missing `journey`/`persona` are inherited from conversation context;
   - malformed items are skipped;
   - non-list response returns `[]`.
4. `extractTasks` parsing:
   - valid task objects are returned;
   - missing `journey` inherits from conversation;
   - malformed task items are skipped;
   - task provider failure is swallowed by orchestration.
5. Curation helper:
   - no candidates => `[]`;
   - no existing memories => original candidates and no LLM call;
   - malformed curation response => original candidates;
   - valid curation response returns valid extracted memories only.
6. DB-copy orchestration:
   - guard returns no changes when no journey or fewer than 4 messages;
   - valid replay run inserts expected memory rows with embeddings and JSON tags;
   - valid replay run inserts only non-duplicate conversation tasks;
   - summary and summary embedding are stored when summary is enabled;
   - conversation metadata gains `extracted: true`;
   - persistence uses copy DB helpers only.
7. Fixture hygiene:
   - unsafe fixture with bearer token/configured secret is rejected;
   - committed fixtures contain scrubbed synthetic transcripts, not private/raw conversation content.

## Validation Commands

Run from repo root unless noted:

```bash
cd ts
npm run typecheck
npm run lint
npm test
npm test -- test/extraction/*.test.ts test/conversation/*.test.ts test/providers/*.test.ts
cd ..
git diff --check
rg 'Authorization: Bearer|OPENROUTER_API_KEY|api_key|apiKey|secret|token' ts/test ts/src
```

The focused test glob may be adjusted to the final test paths.

## E2E Decision

Runtime E2E/front-door cutover is deferred to `CV22.DS5.US4`. Required validation for this story is core-level replay and DB-copy persistence parity. Optional live-provider smoke is allowed manually outside CI if credentials are present, but it is not required and must not produce committed raw provider payloads.

## Out of Scope

- Routing `conversation_logger`, `extract-pending`, `end-session`, or any front-door extraction command to TS.
- Consult command parity.
- Live LLM/embedding calls in CI.
- Redesigning extraction prompts, memory quality, task policy, or metadata lifecycle.
- Schema custody transfer or Python deletion.
- Committing real provider payloads, private prompts/transcripts, production DB artifacts, or credentials.

## Navigator Validation Route

1. Inspect provider/extraction files and confirm replay/provider separation.
2. Inspect DB orchestration and confirm it mutates only supplied DB connections/copies.
3. Confirm `ts/src/frontDoor/routing.ts` remains unchanged for extraction-related commands.
4. Run validation commands.
5. Inspect secret/payload grep hits and confirm they are intentional fake test strings or implementation patterns only.

## Pass Condition

- Automated checks pass.
- TS parser/orchestration behavior matches the Python contracts listed above.
- DB-copy tests prove memory/task/summary/metadata persistence effects.
- CI requires no live provider credentials or network.
- No front-door extraction route is cut over before `CV22.DS5.US4`.

## Fail Condition

- Extraction semantics diverge from Python without an explicit decision.
- A malformed provider response crashes where Python would fail open/return empty.
- A live provider call or real credential is required in CI.
- A production DB can be mutated by the tests or story validation.
- Real provider payloads, raw private transcripts, or secrets are committed.
