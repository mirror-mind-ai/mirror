"""Bounded local agent-run prototype for the web console."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AgentPrototypeResult:
    intent: str
    mirror_home: str | None
    proposal: list[str]
    boundaries: list[str]
    next_step: str

    def to_dict(self) -> dict[str, object]:
        return {
            "intent": self.intent,
            "mirrorHome": self.mirror_home,
            "proposal": self.proposal,
            "boundaries": self.boundaries,
            "nextStep": self.next_step,
        }


def run_agent_prototype(*, intent: str, mirror_home: Path | None) -> AgentPrototypeResult:
    clean_intent = " ".join(intent.strip().split())
    if not clean_intent:
        raise ValueError("Agent run intent is required")
    if len(clean_intent) > 1000:
        raise ValueError("Agent run intent must be at most 1000 characters")
    return AgentPrototypeResult(
        intent=clean_intent,
        mirror_home=str(mirror_home) if mirror_home else None,
        proposal=[
            "Receive and normalize the user intent.",
            "Inspect only the selected Mirror boundary and operation metadata.",
            "Return a proposal instead of mutating local state.",
        ],
        boundaries=[
            "Read-only prototype.",
            "No autonomous writes.",
            "No arbitrary shell command.",
            "No git, migration, update, or file mutation.",
            "Future agent execution must use approved operation capabilities.",
        ],
        next_step="Review this proposal. Future stories can replace the prototype body with a real headless agent behind the same run contract.",
    )
