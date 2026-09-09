"""Generate the Explorer handoff golden fixture (CV22.DS7.US7 plateau 3).

`services/explorer_handoff.py` writes five Markdown documents into the USER'S
OWN PROJECT, under `<project>/docs/project/explorations/<slug>/`. Two properties
therefore matter more than the document text:

**1. The redaction matrix.** `_obfuscate_sensitive_text` runs five `re.sub`
passes over conversation transcripts before they are written to
`full-conversation.md`. An under-matching port does not fail a test -- it writes
a real path, key, or address into a file the user then commits. Every pattern
has a positive row AND a near-miss row that must NOT be redacted, because a port
that over-matches destroys evidence just as silently.

The dialect differences are load-bearing in both directions:

  * `\\s` -- Python's includes U+001C-U+001F and excludes U+FEFF; JavaScript's
    is the opposite. Live in `[^\\s)\\]]+`, `\\s*=\\s*`, and `[^\\s]+`.
  * `\\d` -- Python's matches EVERY Unicode decimal digit (category Nd);
    JavaScript's `\\d` is ASCII-only. A phone number in Devanagari or
    Arabic-Indic digits is redacted by the oracle and, in a naive port, is not.
    This is the under-redaction direction: the dangerous one.
  * `\\b` -- Python's word boundary is Unicode-aware because `\\w` is;
    JavaScript's is ASCII. The phone pattern is anchored by two of them.
  * `(?i)` -- an inline flag with no JavaScript equivalent.
  * `\\1` in a replacement is `$1` in JavaScript, and `String.replace` also
    interprets `$&`, `` $` ``, `$'`, and `$$` in the replacement string.

**2. The directory allocation.** The folder name is `kebab_slug` of a
CALLER-SUPPLIED title, and collisions append `-2`, `-3`, ... The corpus includes
titles that slug to nothing, to path-traversal-looking input, and to an existing
directory, so the confinement and the collision loop are graded rather than
assumed.

The documents themselves are graded as exact bytes, all five, because they are
files a human reads and a Builder session parses.

Run:  uv run python ts/parity/generate_explorer_handoff_golden.py
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "explorer-handoff.golden.json"

JOURNEY = "probe-journey"

# --- redaction corpus -----------------------------------------------------
# Each entry is (name, text). Positive rows must redact; `_negative` rows must
# survive untouched.
REDACTION_CORPUS: list[tuple[str, str]] = [
    # /Users path
    ("path_simple", "the file is at /Users/nav/dev/project/src/main.ts today"),
    ("path_stops_at_paren", "see (/Users/nav/notes.md) for the detail"),
    ("path_stops_at_bracket", "see [/Users/nav/notes.md] for the detail"),
    ("path_to_end_of_line", "/Users/nav/dev/project"),
    ("path_negative_home", "the file is at /home/nav/dev/project/src/main.ts"),
    ("path_negative_relative", "the file is at ./Users/nav/notes.md"),
    ("path_unit_separator_terminator", "/Users/nav/a\u001fand more"),
    ("path_bom_terminator", "/Users/nav/a\ufeffand more"),
    ("path_nbsp_terminator", "/Users/nav/a\u00a0and more"),
    # secret assignment
    ("secret_api_key", "api_key=sk_live_abcdefghijklmnop in the env"),
    ("secret_api_dash_key", "api-key=abcdefghijklmnop in the env"),
    ("secret_apikey_no_separator", "apikey=abcdefghijklmnop in the env"),
    ("secret_uppercase", "API_KEY=ABCDEFGHIJKLMNOP in the env"),
    ("secret_mixed_case_token", "ToKeN = abcdefghijklmnop in the env"),
    ("secret_password", "password=hunter2 and nothing else"),
    ("secret_spaces_around_equals", "secret  =  abcdefghijklmnop"),
    ("secret_negative_no_equals", "the api_key is stored in the vault"),
    ("secret_negative_other_word", "monkey=abcdefghijklmnop"),
    ("secret_dollar_in_value", "token=abc$&def$1ghi and more"),
    # sk- keys
    ("sk_key_long", "sk-abcdefghijklmnopqrstuvwxyz0123 is the key"),
    ("sk_key_exactly_twelve", "sk-abcdefghijkl is the key"),
    ("sk_key_negative_eleven", "sk-abcdefghijk is too short"),
    ("sk_key_with_dashes_underscores", "sk-abc_def-ghi_jkl-mno is the key"),
    # email
    ("email_simple", "write to nav@example.com about it"),
    ("email_plus_tag", "write to nav+mirror@example.co.uk about it"),
    ("email_negative_no_tld", "write to nav@localhost about it"),
    ("email_negative_single_char_tld", "write to nav@example.c about it"),
    # phone
    ("phone_international", "call +55 21 99999-1234 tomorrow"),
    ("phone_parens", "call (21) 9999-1234 tomorrow"),
    ("phone_negative_short", "call 12345 tomorrow"),
    ("phone_unicode_digits", "call +٩٩ ٢١ ٩٩٩٩٩ ١٢٣٤ tomorrow"),
    ("phone_devanagari_digits", "call १२३४५६७८९० today"),
    # interactions
    ("combined_all_patterns", "nav@example.com ran /Users/nav/x with api_key=sk-abcdefghijklmnop at +55 21 99999-1234"),
    ("empty", ""),
    ("no_sensitive_content", "a perfectly ordinary sentence about exploration"),
]


def build(tmp_root: Path) -> dict[str, Any]:
    from memory.services.explorer_handoff import (
        HandoffConversationSource,
        HandoffSourceMessage,
        _obfuscate_sensitive_text,
        write_builder_handoff_artifacts,
    )
    from memory.services.explorer_story import (
        ExplorerAttractor,
        ExplorerExperimentProposal,
        ExplorerSourceConversation,
        ExplorerStory,
    )

    payload: dict[str, Any] = {}

    # --- redaction matrix -------------------------------------------------
    payload["redaction"] = [
        {"name": name, "input": text, "expected": _obfuscate_sensitive_text(text)}
        for name, text in REDACTION_CORPUS
    ]

    # --- stories ----------------------------------------------------------
    minimal = ExplorerStory(journey=JOURNEY)
    full = ExplorerStory(
        journey=JOURNEY,
        id="01J0STORY",
        title="A title",
        status="active",
        current_exploratory_story="Parity is cheap to claim and expensive to prove.",
        narrative_field_summary="Two cores, one database, one denominator nobody trusts.",
        last_story_card="The oracle moved while we were reading it.",
        attractors=(
            ExplorerAttractor(
                label="grade the surface, not the intent",
                description="every verbatim card becomes a golden ✦",
                status="accepted",
            ),
            ExplorerAttractor(label="one gate per lived mode"),
        ),
        experiment_proposal=ExplorerExperimentProposal(
            title="port one ritual command end to end",
            description="small enough to finish, whole enough to learn the shape",
            status="proposed",
        ),
        source_conversations=(ExplorerSourceConversation(conversation_id="c1"),),
    )

    def sources(with_messages: bool) -> tuple[HandoffConversationSource, ...]:
        messages = (
            (
                HandoffSourceMessage(role="user", content="my key is api_key=sk-abcdefghijklmnop"),
                HandoffSourceMessage(
                    role="assistant", content="I read /Users/nav/dev/project and mailed nav@example.com"
                ),
            )
            if with_messages
            else ()
        )
        return (
            HandoffConversationSource(
                conversation_id="c1", title="Where parity breaks", role="origin", messages=messages
            ),
            HandoffConversationSource(
                conversation_id="c2", title=None, role="source evidence", messages=()
            ),
        )

    # --- artifact writes --------------------------------------------------
    cases: list[dict[str, Any]] = []

    def write_case(
        name: str,
        story: ExplorerStory,
        *,
        title: str,
        summary: str | None = None,
        editorial_synthesis: str | None = None,
        source_conversations: tuple[HandoffConversationSource, ...] = (),
        include_full_conversation: bool = False,
        pre_existing: list[str] | None = None,
    ) -> None:
        project = tmp_root / f"project-{len(cases):02d}"
        project.mkdir(parents=True)
        for existing in pre_existing or []:
            (project / "docs" / "project" / "explorations" / existing).mkdir(parents=True)

        handoff = write_builder_handoff_artifacts(
            project,
            story,
            title=title,
            summary=summary,
            editorial_synthesis=editorial_synthesis,
            source_conversations=source_conversations,
            include_full_conversation=include_full_conversation,
        )

        base = Path(handoff.artifact_dir)
        documents = {
            path.relative_to(project).as_posix(): path.read_text(encoding="utf-8")
            for path in sorted(base.rglob("*"))
            if path.is_file()
        }
        cases.append(
            {
                "name": name,
                "title": title,
                "summary": summary,
                "editorial_synthesis": editorial_synthesis,
                "include_full_conversation": include_full_conversation,
                "pre_existing": pre_existing or [],
                "story": {
                    "journey": story.journey,
                    "id": story.id,
                    "title": story.title,
                    "status": story.status,
                    "current_exploratory_story": story.current_exploratory_story,
                    "narrative_field_summary": story.narrative_field_summary,
                    "last_story_card": story.last_story_card,
                    "attractors": [
                        {"label": a.label, "description": a.description, "status": a.status}
                        for a in story.attractors
                    ],
                    "experiment_proposal": (
                        {
                            "title": story.experiment_proposal.title,
                            "description": story.experiment_proposal.description,
                            "status": story.experiment_proposal.status,
                        }
                        if story.experiment_proposal
                        else None
                    ),
                },
                "sources": [
                    {
                        "conversation_id": s.conversation_id,
                        "title": s.title,
                        "role": s.role,
                        "messages": [
                            {"role": m.role, "content": m.content} for m in s.messages
                        ],
                    }
                    for s in source_conversations
                ],
                "handoff": {
                    "title": handoff.title,
                    "summary": handoff.summary,
                    "readiness": handoff.readiness,
                    "artifact_dir": Path(handoff.artifact_dir).relative_to(project).as_posix(),
                    "index_path": Path(handoff.index_path).relative_to(project).as_posix(),
                    "exploratory_story_path": Path(handoff.exploratory_story_path)
                    .relative_to(project)
                    .as_posix(),
                    "handoff_info_path": Path(handoff.handoff_info_path)
                    .relative_to(project)
                    .as_posix(),
                    "product_design_proposal_path": Path(handoff.product_design_proposal_path)
                    .relative_to(project)
                    .as_posix(),
                    "full_conversation_path": (
                        Path(handoff.full_conversation_path).relative_to(project).as_posix()
                        if handoff.full_conversation_path
                        else None
                    ),
                },
                "documents": documents,
            }
        )

    write_case("minimal_story", minimal, title="A first exploration")
    write_case(
        "full_story_with_sources",
        full,
        title="Parity is a rendering problem",
        summary="Enough shape to plan, not enough to commit.",
        editorial_synthesis="The wall was never the database.",
        source_conversations=sources(False),
    )
    write_case(
        "full_conversation_is_obfuscated",
        full,
        title="With transcript evidence",
        summary="carries raw messages",
        source_conversations=sources(True),
        include_full_conversation=True,
    )
    # `include_full_conversation` with NO sources writes no transcript file and
    # flips the checklist rows that depend on it.
    write_case(
        "include_full_conversation_without_sources",
        full,
        title="Asked for a transcript with nothing to write",
        include_full_conversation=True,
    )
    # Directory allocation.
    write_case(
        "slug_collision_appends_suffix",
        minimal,
        title="Parity is a rendering problem",
        pre_existing=["parity-is-a-rendering-problem", "parity-is-a-rendering-problem-2"],
    )
    write_case(
        "title_slugs_to_nothing_falls_back_to_story_text",
        ExplorerStory(journey=JOURNEY, current_exploratory_story="the story text wins"),
        title="!!!",
    )
    write_case(
        "title_and_story_slug_to_nothing_falls_back_to_journey",
        ExplorerStory(journey=JOURNEY),
        title="   ",
    )
    write_case(
        "traversal_looking_title_is_slugged_flat",
        minimal,
        title="../../etc/passwd",
    )
    write_case(
        "accented_and_unicode_title",
        minimal,
        title="Explorações — o que ficou vivo ✦",
    )
    write_case(
        "very_long_title_is_capped",
        minimal,
        title="an exploration title " * 12,
    )

    payload["artifacts"] = cases
    return payload


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "handoff-fixture"
        root.mkdir()
        # `memory.config` re-applies `.env` on import; clear the ambient
        # environment so the generator cannot reach a developer's real home or
        # write into a real project (CR065).
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
            os.environ.pop(key, None)
        os.environ["MIRROR_HOME"] = str(root)
        os.environ["MIRROR_USER"] = root.name
        os.environ["DB_PATH"] = str(root / "memory.db")

        payload = build(root)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    redacted = sum(1 for row in payload["redaction"] if row["input"] != row["expected"])
    print(
        f"{len(payload['redaction'])} redaction rows ({redacted} redact, "
        f"{len(payload['redaction']) - redacted} must survive), "
        f"{len(payload['artifacts'])} artifact writes"
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
