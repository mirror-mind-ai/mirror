"""CV9.E2.S28 (AI-14) — hand-authored corpus + labeled queries, BEFORE embedding.

This is the source of truth a human reads and edits. `generate_fixtures.py`
consumes this module, calls the real embedding API once per unique text, and
writes the frozen, committed `corpus.json` / `queries.json` this eval module
actually loads at run time.

## Relevance rubric

A memory is RELEVANT to a query if a person who typed that exact query, at the
moment they needed it, would recognize the memory as an on-topic, useful
result — because it addresses the same decision, entity, project, or theme the
query names. A memory is NOT relevant merely for incidental keyword overlap
(both mention "business" but concern unrelated topics). A query may have more
than one relevant memory (real corpora aren't 1:1).

Labels below were authored by reading the CORPUS ONLY — never by running the
ranker and observing its output. That independence is what makes hit@k/MRR a
measurement of the ranker, not a self-fulfilling echo of it.

## Corpus design notes (why these 30, not fewer/more/different)

- Grouped into 7 clusters (pricing/business, XP engineering, nomad travel,
  writing, marketing, personal/shadow reflections, distractors) so relevance
  judgments are principled, not arbitrary.
- `created_at` is spread ~2026-02 to ~2024-12, deliberately NOT correlated
  with which memories are query-relevant — including one deliberately OLD but
  correct memory (`c14`, ~20 months back) so a strong semantic/lexical match
  can still win despite weak recency, and a few RECENT distractors (`c28`)
  so recency alone cannot wrongly promote an off-topic memory. If recency,
  reinforcement, or relevance_score correlated with correctness, the
  instrument would measure those signals in isolation, not the hybrid ranker
  the audit finding is actually about.
- `relevance_score`/`use_count`/access-log entries vary on a light,
  deterministic pattern independent of the query labels, for the same reason.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CorpusMemory:
    id: str
    title: str
    content: str
    created_at: str
    memory_type: str = "insight"
    layer: str = "ego"
    relevance_score: float = 0.5
    use_count: int = 0
    access_count: int = 0
    last_accessed_at: str | None = None


@dataclass
class LabeledQuery:
    id: str
    text: str
    relevant_ids: list[str]
    rationale: str
    top_k: int = 5


FROZEN_NOW = "2026-08-01T12:00:00Z"

# ---------------------------------------------------------------------------
# Corpus (30 synthetic, fictional memories — never real Navigator data)
# ---------------------------------------------------------------------------

CORPUS: list[CorpusMemory] = [
    # --- Cluster A: course pricing & business model ---
    CorpusMemory(
        "c01",
        "Moved to tiered membership pricing",
        "Decided to move from a one-time course purchase to a tiered "
        "membership model to improve retention.",
        "2026-02-14T09:00:00Z",
        relevance_score=0.6,
    ),
    CorpusMemory(
        "c02",
        "Considered raising the flagship course price",
        "Considered raising the flagship course price by 30% after "
        "validating higher perceived value from case studies.",
        "2026-07-20T09:00:00Z",
        use_count=1,
    ),
    CorpusMemory(
        "c03",
        "Black Friday discount promotion",
        "Ran a discount promotion during Black Friday that converted better "
        "than expected, informing future launch timing.",
        "2025-11-25T09:00:00Z",
    ),
    CorpusMemory(
        "c04",
        "Added payment plans to reduce cart abandonment",
        "Debated whether to offer payment plans; decided yes after seeing "
        "cart abandonment tied to the upfront cost.",
        "2026-05-02T09:00:00Z",
        relevance_score=0.6,
    ),
    CorpusMemory(
        "c05",
        "Refund requests traced to onboarding gap",
        "Analyzed refund requests and found most came from students who "
        "never started the course, pointing to an onboarding problem.",
        "2025-09-10T09:00:00Z",
        use_count=2,
        access_count=1,
        last_accessed_at="2026-06-01T09:00:00Z",
    ),
    # --- Cluster B: XP / software engineering practice ---
    CorpusMemory(
        "c06",
        "TDD paired session removed a junior dev's fear",
        "Paired with a junior developer using strict TDD and noticed the "
        "fear of breaking things disappeared within a week.",
        "2026-06-01T09:00:00Z",
        relevance_score=0.7,
    ),
    CorpusMemory(
        "c07",
        "Refactored a tangled billing module",
        "Refactored a tangled billing module into smaller functions after a "
        "bug took too long to trace.",
        "2025-08-22T09:00:00Z",
    ),
    CorpusMemory(
        "c08",
        "Test guides now required before implementation",
        "Decided every story needs a written test guide before implementation starts, not after.",
        "2026-07-05T09:00:00Z",
        use_count=3,
        access_count=2,
        last_accessed_at="2026-07-20T09:00:00Z",
    ),
    CorpusMemory(
        "c09",
        "Code review flagged duplicated logic",
        "Reviewed a pull request that introduced duplicated logic and asked "
        "for it to be extracted into a shared function.",
        "2026-01-18T09:00:00Z",
    ),
    CorpusMemory(
        "c10",
        "CI failures dropped with local test runs",
        "Reflected on how continuous integration failures dropped once the "
        "team started running tests locally before pushing.",
        "2025-12-02T09:00:00Z",
        relevance_score=0.6,
    ),
    # --- Cluster C: nomad travel & logistics ---
    CorpusMemory(
        "c11",
        "Chose Lisbon for co-working and time zone overlap",
        "Chose to spend three months in Lisbon for the reliable co-working "
        "infrastructure and time zone overlap with clients.",
        "2026-03-11T09:00:00Z",
    ),
    CorpusMemory(
        "c12",
        "eSIM and backup hotspot beat hotel wifi",
        "Learned that having a reliable eSIM and a backup hotspot mattered "
        "more than hotel wifi quality.",
        "2026-07-28T09:00:00Z",
        use_count=1,
    ),
    CorpusMemory(
        "c13",
        "Furnished monthly rentals over a long-term lease",
        "Decided against a long-term lease after realizing furnished "
        "monthly rentals gave more flexibility for a nomad schedule.",
        "2025-10-05T09:00:00Z",
        relevance_score=0.6,
    ),
    CorpusMemory(
        "c14",
        "Compared visas across three countries",
        "Compared visa requirements across three countries before choosing "
        "where to base for the next quarter.",
        "2024-12-01T09:00:00Z",  # deliberately old — stress-tests recency
    ),
    CorpusMemory(
        "c15",
        "Packing light made spontaneous city changes easier",
        "Noted how packing light with two carry-ons made spontaneous city changes far easier.",
        "2026-04-19T09:00:00Z",
    ),
    # --- Cluster D: writing / book project ---
    CorpusMemory(
        "c16",
        "Committed to 500 words every morning",
        "Committed to writing 500 words every morning before opening email, "
        "regardless of how the day looked.",
        "2026-06-15T09:00:00Z",
        use_count=2,
        access_count=1,
        last_accessed_at="2026-07-10T09:00:00Z",
    ),
    CorpusMemory(
        "c17",
        "Cut a chapter that repeated earlier ideas",
        "Cut an entire chapter that repeated ideas already covered better elsewhere in the book.",
        "2025-07-30T09:00:00Z",
    ),
    CorpusMemory(
        "c18",
        "One sharper example beats three weak ones",
        "Decided the book's central argument needed one sharper example "
        "instead of three weaker ones.",
        "2026-02-28T09:00:00Z",
        relevance_score=0.6,
    ),
    CorpusMemory(
        "c19",
        "Early readers flagged where they got bored",
        "Sent the first three chapters to five readers and asked "
        "specifically where they got bored.",
        "2026-01-09T09:00:00Z",
    ),
    # --- Cluster E: marketing / audience building ---
    CorpusMemory(
        "c20",
        "Case studies doubled engagement over generic tips",
        "Switched from posting generic tips to sharing specific, numbered "
        "case studies and saw engagement double.",
        "2026-03-22T09:00:00Z",
    ),
    CorpusMemory(
        "c21",
        "Paid ad test targeted warm leads only",
        "Ran a small paid ad test targeting people who had already "
        "downloaded a free guide, not cold audiences.",
        "2026-05-30T09:00:00Z",
        use_count=1,
    ),
    CorpusMemory(
        "c22",
        "Clever subject lines hurt newsletter opens",
        "Realized the newsletter open rate dropped after the subject lines "
        "became more clever than clear.",
        "2026-07-12T09:00:00Z",
        relevance_score=0.6,
    ),
    CorpusMemory(
        "c23",
        "Replying to early comments increased follow-ups",
        "Started replying personally to the first ten comments on every "
        "post, which noticeably increased follow-up replies.",
        "2025-11-02T09:00:00Z",
    ),
    # --- Cluster F: personal reflections (self/ego/shadow) ---
    CorpusMemory(
        "c24",
        "Overcommitting to speaking engagements",
        "Noticed a recurring pattern of overcommitting to speaking "
        "engagements and then resenting the travel required.",
        "2026-04-05T09:00:00Z",
        layer="shadow",
        relevance_score=0.6,
    ),
    CorpusMemory(
        "c25",
        "Freedom, not certainty, drives real decisions",
        "Recognized that freedom, not certainty, is the value most of my real decisions protect.",
        "2025-09-28T09:00:00Z",
        layer="self",
    ),
    CorpusMemory(
        "c26",
        "Avoided a hard conversation with a business partner",
        "Caught myself avoiding a hard conversation with a business partner "
        "for the third time this month.",
        "2026-06-25T09:00:00Z",
        layer="shadow",
        use_count=1,
    ),
    CorpusMemory(
        "c27",
        "Calm after declining a misaligned partnership",
        "Felt genuine calm after finally saying no to a partnership that "
        "didn't align with long-term goals.",
        "2025-08-14T09:00:00Z",
        layer="self",
        relevance_score=0.6,
    ),
    # --- Cluster G: distractors (plausible-sounding, off-topic) ---
    CorpusMemory(
        "c28",
        "New coffee roastery near the apartment",
        "Tried a new coffee roastery near the apartment and liked the "
        "medium roast better than the dark one.",
        "2026-07-18T09:00:00Z",  # recent distractor — recency shouldn't win
    ),
    CorpusMemory(
        "c29",
        "Fixed flaky wifi by moving the router",
        "Fixed a flaky wifi router by moving it away from the microwave, "
        "which had been interfering with the signal.",
        "2026-06-10T09:00:00Z",
    ),
    CorpusMemory(
        "c30",
        "Documentary about deep sea bioluminescence",
        "Watched a documentary about deep sea exploration and found the "
        "bioluminescence footage striking.",
        "2025-10-20T09:00:00Z",
    ),
]

# ---------------------------------------------------------------------------
# Labeled queries (18 — within the confirmed 15-25 range)
# ---------------------------------------------------------------------------

QUERIES: list[LabeledQuery] = [
    LabeledQuery(
        "q01-raise-price",
        "raising the price of my course",
        ["c02"],
        "c02 is specifically about raising the flagship course price; c01/c04 "
        "are pricing-adjacent but concern a different decision (membership "
        "model, payment plans), not a price raise.",
    ),
    LabeledQuery(
        "q02-membership-model",
        "switching to a membership pricing model",
        ["c01"],
        "c01 is the direct record of that decision.",
    ),
    LabeledQuery(
        "q03-refund-requests",
        "why are students requesting refunds",
        ["c05"],
        "c05 is the direct analysis of refund causes.",
    ),
    LabeledQuery(
        "q04-tdd-junior",
        "test-driven development with a junior engineer",
        ["c06"],
        "c06 directly describes a TDD pairing session.",
    ),
    LabeledQuery(
        "q05-refactor-billing",
        "refactoring a messy billing module",
        ["c07"],
        "c07 is the direct record of that refactor.",
    ),
    LabeledQuery(
        "q06-test-guide",
        "writing a test guide before implementing a story",
        ["c08"],
        "c08 is the direct decision record.",
    ),
    LabeledQuery(
        "q07-duplicated-logic",
        "code review found duplicated logic",
        ["c09"],
        "c09 directly describes that review.",
    ),
    LabeledQuery(
        "q08-ci-failures",
        "why do CI builds keep failing",
        ["c10"],
        "c10 directly addresses CI failure causes.",
    ),
    LabeledQuery(
        "q09-choose-nomad-base",
        "choosing a city to live in for a few months as a nomad",
        ["c11", "c14"],
        "c11 (Lisbon choice) and c14 (comparing visas across countries) both "
        "concern choosing a nomad base — c14 is deliberately dated ~20 "
        "months back, stress-testing that a weak-recency but strongly "
        "relevant memory can still surface.",
    ),
    LabeledQuery(
        "q10-connectivity",
        "internet connectivity while traveling",
        ["c12"],
        "c12 directly addresses eSIM/hotspot reliability.",
    ),
    LabeledQuery(
        "q11-rental-vs-lease",
        "furnished rental versus long-term lease",
        ["c13"],
        "c13 is the direct decision record.",
    ),
    LabeledQuery(
        "q12-writing-habit",
        "building a daily writing habit",
        ["c16"],
        "c16 directly describes the 500-words-a-day commitment.",
    ),
    LabeledQuery(
        "q13-trim-book-content",
        "cutting content from the book",
        ["c17", "c18"],
        "c17 (cut a repetitive chapter) and c18 (cut to one sharper example) "
        "both concern trimming/sharpening the book's content.",
    ),
    LabeledQuery(
        "q14-reader-feedback",
        "getting early readers to give feedback on a manuscript",
        ["c19"],
        "c19 directly describes that feedback round.",
    ),
    LabeledQuery(
        "q15-newsletter-engagement",
        "why did newsletter engagement drop",
        ["c22"],
        "c22 directly addresses the open-rate drop.",
    ),
    LabeledQuery(
        "q16-paid-ads",
        "testing paid ads for the course",
        ["c21"],
        "c21 is the direct record of that ad test.",
    ),
    LabeledQuery(
        "q17-avoiding-conversation",
        "recognizing a pattern of avoiding a difficult conversation",
        ["c26"],
        "c26 directly describes that avoidance pattern (shadow layer).",
    ),
    LabeledQuery(
        "q18-overcommitting-travel",
        "overcommitting to speaking engagements",
        ["c24"],
        "c24 is the direct record of that pattern.",
    ),
]
