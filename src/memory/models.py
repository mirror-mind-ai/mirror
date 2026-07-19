"""Pydantic models for the memory system."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import NamedTuple

from pydantic import BaseModel, ConfigDict, Field


class _DomainModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class Message(BaseModel):
    id: str = Field(default_factory=lambda: _uuid())
    conversation_id: str
    role: str  # 'user', 'assistant', 'system'
    content: str
    created_at: str = Field(default_factory=lambda: _now())
    token_count: int | None = None
    metadata: str | None = None


class Conversation(_DomainModel):
    id: str = Field(default_factory=lambda: _uuid())
    title: str | None = None
    started_at: str = Field(default_factory=lambda: _now())
    ended_at: str | None = None
    interface: str  # 'claude_code', 'cli', 'django'
    persona: str | None = None
    journey: str | None = None
    summary: str | None = None
    tags: str | None = None  # JSON array
    metadata: str | None = None


class ConversationSummary(_DomainModel):
    id: str
    title: str | None = None
    started_at: str | None = None
    persona: str | None = None
    journey: str | None = None
    message_count: int = 0


class RuntimeSession(_DomainModel):
    session_id: str
    conversation_id: str | None = None
    interface: str | None = None
    mirror_active: bool = False
    persona: str | None = None
    journey: str | None = None
    hook_injected: bool = False
    active: bool = True
    started_at: str = Field(default_factory=lambda: _now())
    updated_at: str = Field(default_factory=lambda: _now())
    closed_at: str | None = None
    metadata: str | None = None


class MemorySummary(_DomainModel):
    id: str
    memory_type: str
    layer: str
    title: str
    content: str
    context: str | None = None
    journey: str | None = None
    persona: str | None = None
    tags: str | None = None
    created_at: str


class Memory(_DomainModel):
    id: str = Field(default_factory=lambda: _uuid())
    conversation_id: str | None = None
    memory_type: str  # 'decision', 'insight', 'idea', 'journal', 'tension', 'learning', 'pattern', 'commitment', 'reflection'
    layer: str = "ego"  # 'self', 'ego', 'shadow'
    title: str
    content: str
    context: str | None = None
    journey: str | None = None
    persona: str | None = None
    tags: str | None = None  # JSON array
    created_at: str = Field(default_factory=lambda: _now())
    relevance_score: float = 1.0
    embedding: bytes | None = None
    metadata: str | None = None
    last_accessed_at: str | None = None
    use_count: int = 0
    readiness_state: str = "observed"


class Consolidation(_DomainModel):
    """A consolidation proposal: a cluster of related memories with a proposed action.

    Actions:
    - 'merge': distill the cluster into one sharper memory
    - 'identity_update': update a structural identity layer (ego, self) with the pattern
    - 'shadow_candidate': mark the cluster as shadow material for the mm-shadow pass

    Status lifecycle: pending → accepted | rejected
    """

    id: str = Field(default_factory=lambda: _uuid())
    action: str  # 'merge' | 'identity_update' | 'shadow_candidate'
    proposal: str  # full LLM-generated proposal text (markdown)
    result: str | None = None  # content actually written (accepted or user-edited)
    source_memory_ids: str  # JSON-encoded list of Memory.id values
    target_layer: str | None = None  # 'ego', 'self', 'shadow'
    target_key: str | None = None  # 'behavior', 'soul', etc.
    rationale: str | None = None  # one-sentence LLM rationale
    status: str = "pending"  # 'pending' | 'accepted' | 'rejected'
    created_at: str = Field(default_factory=lambda: _now())
    reviewed_at: str | None = None


class Identity(BaseModel):
    id: str = Field(default_factory=lambda: _uuid())
    layer: str  # 'self', 'ego', 'user', 'organization', 'persona'
    key: str  # 'soul', 'behavior', 'identity', 'principles', or persona_id
    content: str
    version: str = "1.0.0"
    created_at: str = Field(default_factory=lambda: _now())
    updated_at: str = Field(default_factory=lambda: _now())
    metadata: str | None = None


class IdentityIntegration(BaseModel):
    id: str = Field(default_factory=lambda: _uuid())
    layer: str
    key: str
    content: str
    source: str = "soul_mode"
    origin: str | None = None
    conversation_id: str | None = None
    journal_id: str | None = None
    created_at: str = Field(default_factory=lambda: _now())
    status: str = "active"
    metadata: str = "{}"


class Attachment(_DomainModel):
    id: str = Field(default_factory=lambda: _uuid())
    journey_id: str
    name: str
    description: str | None = None
    content: str
    content_type: str = "markdown"  # markdown, text, yaml
    tags: str | None = None  # JSON array
    embedding: bytes | None = None
    created_at: str = Field(default_factory=lambda: _now())
    updated_at: str = Field(default_factory=lambda: _now())
    metadata: str | None = None


class Task(_DomainModel):
    id: str = Field(default_factory=lambda: _uuid())
    journey: str | None = None
    title: str
    status: str = "todo"  # 'todo', 'doing', 'done', 'blocked'
    due_date: str | None = None  # ISO date (YYYY-MM-DD)
    scheduled_at: str | None = None  # ISO datetime (YYYY-MM-DDTHH:MM) for fixed-time items
    time_hint: str | None = None  # free text such as "late afternoon" or "morning"
    stage: str | None = None  # stage/cycle within the journey
    context: str | None = None
    source: str = "manual"  # 'manual', 'journey_path', 'conversation', 'week_plan'
    created_at: str = Field(default_factory=lambda: _now())
    updated_at: str = Field(default_factory=lambda: _now())
    completed_at: str | None = None
    metadata: str | None = None


class ExtractedWeekItem(_DomainModel):
    """Item extracted from a weekly plan."""

    title: str
    due_date: str  # YYYY-MM-DD, always resolved by the LLM
    scheduled_at: str | None = None  # YYYY-MM-DDTHH:MM for fixed-time items
    time_hint: str | None = None  # "morning", "afternoon", "late afternoon", etc.
    journey: str | None = None
    context: str | None = None


VALID_MEMORY_LAYERS = frozenset({"self", "ego", "shadow"})
VALID_MEMORY_TYPES = frozenset(
    {"decision", "insight", "idea", "tension", "learning", "pattern", "commitment", "reflection"}
)

# AI-23 (CV9.E2.S23): the only identity layers a consolidation-sourced
# identity_update may target. The mirror's own inferred-identity layers
# (self/soul, ego/behavior, ego/identity) are legitimate consolidation
# targets; `user` is user-authored, `organization`/`personas`/`journeys` are
# structural, and `shadow` has its own path (mm-shadow) — a model proposing
# any of those as an identity_update target is a bug by definition, not a
# legitimate proposal.
VALID_IDENTITY_UPDATE_LAYERS = frozenset({"self", "ego"})


class ExtractedMemory(_DomainModel):
    """Memory extracted by the LLM before id and embedding are assigned."""

    title: str
    content: str
    context: str | None = None
    memory_type: str
    layer: str = "ego"
    tags: list[str] = Field(default_factory=list)
    journey: str | None = None
    persona: str | None = None


@dataclass
class IdentityDescriptor:
    """Routing-optimized descriptor for a persona or journey stored in the sidecar table."""

    layer: str
    key: str
    descriptor: str
    generated_at: str


@dataclass
class ReceptionResult:
    """Output of the reception classifier for one Mirror Mode turn."""

    personas: list[str]  # ordered, most relevant first; [] = ego responds alone
    journey: str | None  # slug of the best-matching journey, or None
    touches_identity: bool  # true when the message invites deep self-examination
    touches_shadow: bool  # true when there is evidence of avoidance/contradiction/pattern

    @classmethod
    def empty(cls) -> "ReceptionResult":
        """Safe fallback when classification fails or is disabled."""
        return cls(personas=[], journey=None, touches_identity=False, touches_shadow=False)


class ExtractedTask:
    """Task extracted by the LLM from a conversation."""

    def __init__(
        self,
        title: str,
        due_date=None,
        journey=None,
        stage=None,
        context=None,
    ):
        self.title = title
        self.due_date = due_date
        self.journey = journey
        self.stage = stage
        self.context = context


class SearchResult(NamedTuple):
    """Search result supporting attributes and tuple unpacking."""

    memory: "Memory"
    score: float


class SearchOutcome(NamedTuple):
    """A search's results plus whether it ran degraded (lexical-only fallback)."""

    results: list[SearchResult]
    degraded: bool


def _uuid() -> str:
    import uuid

    return uuid.uuid4().hex[:8]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
