# Contract Model and Persistence

## Recommended persistence decision

Use dedicated revision and proposal tables rather than placing the full contract inside `identity.metadata`.

Journey identity metadata is suitable for small display and linkage fields such as `project_path`, `parent_journey`, icon, and color. A context contract has revision history, confirmation state, user-visible proposals, validation rules, and future audit needs. Treating it as an opaque nested metadata object would make concurrent updates, history, proposal review, and restoration unnecessarily fragile.

The database remains the runtime source of truth. Project files may later import or export contracts, but runtime activation reads the active database revision.

## Domain models

### JourneyContextContract

```python
class JourneyContextContract(_DomainModel):
    id: str
    journey: str
    revision: int
    schema_version: str = "1"
    status: str  # active | superseded | disabled
    contract_json: str
    source: str  # manual | conversational | migration | restore
    created_at: str
    activated_at: str | None
    supersedes_id: str | None
    confirmed_by: str | None  # user | migration
    confirmation_context: str | None
```

### ContextContractProposal

```python
class ContextContractProposal(_DomainModel):
    id: str
    journey: str
    base_contract_id: str | None
    base_revision: int | None
    status: str  # pending | accepted | rejected | expired | superseded
    proposal_json: str
    rationale: str
    source_conversation_id: str | None
    source_message_id: str | None
    created_at: str
    reviewed_at: str | None
```

### ContextResolution

`ContextResolution` is a returned DTO, not necessarily a persisted row.

```python
class ContextResolution(_DomainModel):
    journey: str | None
    contract_id: str | None
    contract_revision: int | None
    profile_id: str | None
    persona: str | None
    mode: str
    reason_code: str
    reason: str
    required_sources: list[ResolvedContextSource]
    optional_sources: list[ResolvedContextSource]
    warnings: list[str]
    degraded: bool
```

## Proposed SQLite schema

```sql
CREATE TABLE journey_context_contracts (
    id TEXT PRIMARY KEY,
    journey TEXT NOT NULL,
    revision INTEGER NOT NULL,
    schema_version TEXT NOT NULL DEFAULT '1',
    status TEXT NOT NULL,
    contract_json TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    activated_at TEXT,
    supersedes_id TEXT REFERENCES journey_context_contracts(id),
    confirmed_by TEXT,
    confirmation_context TEXT,
    CHECK(status IN ('active', 'superseded', 'disabled')),
    CHECK(revision >= 1),
    UNIQUE(journey, revision)
);

CREATE UNIQUE INDEX ux_journey_context_contracts_one_active
    ON journey_context_contracts(journey)
    WHERE status = 'active';

CREATE INDEX idx_journey_context_contracts_history
    ON journey_context_contracts(journey, revision DESC);

CREATE TABLE context_contract_proposals (
    id TEXT PRIMARY KEY,
    journey TEXT NOT NULL,
    base_contract_id TEXT REFERENCES journey_context_contracts(id),
    base_revision INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    proposal_json TEXT NOT NULL,
    rationale TEXT NOT NULL,
    source_conversation_id TEXT REFERENCES conversations(id),
    source_message_id TEXT REFERENCES messages(id),
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    CHECK(status IN ('pending', 'accepted', 'rejected', 'expired', 'superseded'))
);

CREATE INDEX idx_context_contract_proposals_journey_status
    ON context_contract_proposals(journey, status, created_at DESC);
```

SQLite cannot cleanly enforce that `journey` references only `identity` rows whose layer is `journey` without a composite reference and an additional constant column. The service must validate journey existence transactionally, and journey removal must count contract and proposal associations in `Store.delete_unassociated_journey()`.

## Contract JSON v1

```json
{
  "schema_version": "1",
  "name": "How we work in O Sentido do Ser",
  "description": "Journey-specific collaboration profiles.",
  "default_profile": "authoring",
  "profiles": [
    {
      "id": "authoring",
      "name": "Authoring",
      "description": "Create, continue, or rewrite book prose while preserving the work's voice.",
      "modes": ["Mirror Mode"],
      "persona": "escritora-ensaista",
      "match": {
        "examples": [
          "Rewrite this passage.",
          "Continue the chapter.",
          "Turn these notes into prose."
        ],
        "keywords": ["rewrite", "continue the chapter"]
      },
      "context": [
        {
          "type": "project_file",
          "path": "docs/obra/voz.md",
          "requirement": "required",
          "label": "Voice guide"
        },
        {
          "type": "project_file",
          "path": "docs/obra/rubrica-de-revisao.md",
          "requirement": "required",
          "label": "Editorial rubric"
        }
      ]
    },
    {
      "id": "editorial-diagnosis",
      "name": "Editorial diagnosis",
      "description": "Evaluate voice, structure, rhythm, coherence, and reader experience without silently rewriting.",
      "modes": ["Mirror Mode"],
      "persona": "editor",
      "match": {
        "examples": [
          "Diagnose this chapter.",
          "Evaluate the structure without rewriting."
        ],
        "keywords": ["editorial diagnosis", "critical reading"]
      },
      "context": [
        {
          "type": "project_file",
          "path": "docs/obra/rubrica-de-revisao.md",
          "requirement": "required",
          "label": "Editorial rubric"
        }
      ]
    }
  ]
}
```

## Profile schema

Required fields:

- `id`: kebab-case, unique inside the contract, 3 to 64 characters;
- `name`: user-facing name, 1 to 100 characters;
- `description`: classifier-facing task description, 20 to 500 characters;
- `modes`: non-empty subset of supported modes;
- `persona`: existing persona key or `null` for ego-only operation;
- `match.examples`: one to eight bounded examples;
- `context`: zero to eight typed sources.

Optional fields:

- `match.keywords`: deterministic high-confidence hints, maximum sixteen;
- `instructions`: short profile-specific behavior, maximum 2,000 characters;
- `enabled`: defaults to true.

Profile instructions are untrusted journey-owned guidance. They are framed below hard constraints and cannot override mode, safety, or permission policies.

## Context source schema v1

The first release should implement only `project_file`. A typed union keeps later expansion possible without accepting arbitrary shapes.

```json
{
  "type": "project_file",
  "path": "docs/architecture.md",
  "requirement": "required",
  "label": "Architecture"
}
```

Rules:

- `path` is relative to the journey's `project_path`;
- absolute paths, parent traversal, symlinks, unsupported suffixes, and special files are rejected;
- `requirement` is `required` or `optional`;
- duplicate canonical paths are rejected;
- contracts may declare at most eight sources per profile.

Future source types may include `attachment_query`, `extension_capability`, `identity_reference`, and `memory_query`. Each type requires a separate schema, trust policy, budget, and resolver. Do not accept generic URI or executable source fields.

## Revision behavior

Accepting a proposal runs one transaction:

1. Verify the proposal is pending.
2. Verify its base revision still matches the active revision.
3. Validate the proposed contract and all referenced identities.
4. Mark the previous active contract superseded.
5. Insert the next active revision.
6. Mark the proposal accepted.
7. Commit.

If the base revision changed, acceptance fails with a stale proposal error. The service may create a new rebased proposal, but must not merge model-generated patches automatically.

Restoring an older revision creates a new revision whose content copies the selected historical contract. It does not reactivate the old row or rewrite history.

## Validation posture

Use strict Pydantic models with `extra="forbid"`. Validate before every write and after every read. A malformed active contract is a visible core error, not a silent empty contract.

Validation includes:

- journey exists;
- persona exists;
- profile IDs are unique;
- default profile exists and is enabled;
- supported modes only;
- bounded descriptions, examples, instructions, profiles, and sources;
- source-specific safety validation;
- valid status transitions;
- revision monotonicity;
- one active contract per journey.
