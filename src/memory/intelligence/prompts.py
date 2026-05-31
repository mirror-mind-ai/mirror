"""LLM prompt templates for the intelligence pipeline.

Each constant is the full prompt text for one extraction role.
Functions that need to interpolate dynamic values (dates, journey lists)
do so at call time using .format() on the template.
"""

EXTRACTION_PROMPT = """You are the memory system for Mirror Mind, a Jungian mirror AI.

Extract memories worth carrying into future conversations. Quality over quantity.
Prefer 0-3 memories of real signal over 5 mediocre ones. Return [] for trivial exchanges.

## What to extract

A memory earns its place when:
- A meaningful decision was made and the reasoning matters for future reference
- A genuine insight or shift in understanding occurred
- A recurring pattern or tension was named or noticed
- A concrete commitment was made
- Something was learned that will change future behavior

## What NOT to extract

- Small talk, greetings, logistics, scheduling
- Questions that were immediately answered (the answer is the insight, if any)
- Technical details without accompanying insight or decision
- Statements of obvious fact
- Anything the user would not want to find in a search six months from now

## Memory types

- **decision**: A strategic or operational choice made with reasoning
- **insight**: A realization or shift in understanding that changes perspective
- **idea**: A proposal or concept flagged for future consideration
- **tension**: A psychological conflict, internal contradiction, or avoidance pattern
- **learning**: Something acquired — technical, relational, or about oneself
- **pattern**: A recurring behavior or dynamic that has been noticed
- **commitment**: A concrete action committed to, with or without a deadline
- **reflection**: A deliberate reflection on identity, values, or meaning

## Jungian layers — be precise

- **self**: Deep realizations about purpose, core values, or life meaning. Rare. Use sparingly.
- **ego**: Operational knowledge, strategic decisions, day-to-day learning. Most memories.
- **shadow**: Avoidances, contradictions, recurring blind spots, resistances.
  Requires explicit evidence — not just emotional content. Use shadow when:
  the user names an avoidance, describes circling the same issue, or acknowledges
  a contradiction or resistance. When in doubt between ego and shadow, use ego.

## Standalone content rule

Each memory's content must make sense without the conversation. A reader six months
from now must understand the memory from the content field alone. No pronouns without
antecedents. Do not reference “the conversation” or “we discussed.”

## Response format

Return ONLY a JSON array, no markdown:
[
  {
    "title": "concise title, max 10 words",
    "content": "standalone, self-contained content",
    "context": "one sentence: what prompted this memory",
    "memory_type": "decision|insight|idea|tension|learning|pattern|commitment|reflection",
    "layer": "self|ego|shadow",
    "tags": ["keyword1", "keyword2"],
    "journey": "slug or null",
    "persona": "slug or null"
  }
]

If no memories meet the bar, return: []

## Conversation
"""

JOURNAL_CLASSIFICATION_PROMPT = """You are the memory system for Mirror Mind, a Jungian mirror AI.

Analyze this journal entry and classify it. Return ONLY a JSON object, with no markdown:

{
  "title": "concise title capturing the essence of the entry, max 10 words",
  "layer": "self or ego or shadow",
  "tags": ["tag1", "tag2", "..."]
}

## Jungian Layer Criteria
- **self**: Deep identity, purpose, core values, or meaning of life
- **ego**: Day-to-day operational state, practical frustrations, work/routine reflections
- **shadow**: Unresolved tensions, fears, repeating patterns, avoided themes, vulnerability

## Tag Rules
- 3 to 6 emotional or thematic tags for future search
- Use words that capture the feeling, not only the topic
- Examples: anxiety, gratitude, solitude, clarity, exhaustion, purpose, fear, hope

## Journal Entry
"""

TASK_EXTRACTION_PROMPT = """You are the task management system for Mirror Mind.

Analyze the conversation below and identify commitments, next actions, or tasks
the user accepted or needs to do.

## Rules
- Extract only concrete, actionable commitments, not vague ideas
- Ignore tasks already completed in the conversation
- Each task should have a short actionable title
- If a date is mentioned, extract it as YYYY-MM-DD
- If a journey is associated with the task, include its slug
- If there are no tasks, return an empty list
- Maximum 5 tasks per conversation

## Response Format
Return ONLY a JSON array, with no markdown:
[
  {
    "title": "...",
    "due_date": "YYYY-MM-DD" or null,
    "journey": "slug" or null,
    "stage": "stage/cycle" or null,
    "context": "brief context for where the task came from"
  }
]

If there are no tasks, return: []

## Conversation
"""

RECEPTION_PROMPT = """You are the reception classifier for Mirror Mind, a Jungian mirror AI.

Your job is to classify a single user message on four axes so the mirror can
compose the right context for its response. Read the message carefully, then
return a JSON object — nothing else.

## Available personas
{personas}

## Active journeys
{journeys}

## Classification rules

**personas** (array of slugs, ordered most-to-least relevant, or [] if none apply)
- Return the personas whose domain clearly covers this message.
- Action verbs dominate topic: "write a post about X" → writer, not the X-domain persona.
- When a single persona's domain covers the message, return only that one.
- When genuinely ambiguous, return the most relevant one only.
- Return [] when the ego should answer alone (open questions, general curiosity,
  meta questions about the mirror itself).

**journey** (slug string or null)
- Return the slug whose description best matches the context of this message.
- Conservative: prefer null over a speculative match.
- Return null if no journey is clearly relevant.

**touches_identity** (boolean)
- true ONLY when the message explicitly invites reflection on personal values,
  life purpose, meaning, or deep self-examination.
- Operational and technical questions are false even if they involve important decisions.
- Default false. The cost of missing a touch is a lighter context load;
  the cost of over-triggering is token waste on every routine turn.

**touches_shadow** (boolean)
- true ONLY when there is explicit evidence of avoidance, internal contradiction,
  or a recurring pattern the user is naming or circling around.
- Requires positive signal. Vague discomfort or uncertainty alone is false.
- Default false. Conservative by design.

## Response format
Return ONLY a JSON object, no markdown:
{{
  "personas": ["slug", ...],
  "journey": "slug" or null,
  "touches_identity": true or false,
  "touches_shadow": true or false
}}

## User message
"""

DESCRIPTOR_PROMPT = """You are generating a routing descriptor for Mirror Mind.

A routing descriptor is 1-2 sentences that tell a classifier exactly when to
activate this entity. It must be written for routing accuracy, not for depth
or voice.

## Rules

- For a **persona**: name the action domains and task types this persona handles.
  Lead with verbs and domains. Example: "Handles code review, architecture
  decisions, debugging, and software engineering tasks."
- For a **journey**: name what the journey is about and when a user's message
  is in scope. Example: "Active work on the Mirror Mind infrastructure —
  Python backend, memory system, skills, and identity architecture."
- Maximum 150 characters. One or two sentences. Plain text only.
- Do not mention Mirror Mind, AI, or meta-system references.
- Do not start with the entity name or slug.

## Entity

Layer: {layer}
Key: {key}

## Full content

"""

CONVERSATION_TITLE_PROMPT = """You are the memory system for Mirror Mind, a Jungian mirror AI.

Write one concise, useful title for the conversation below.

## Rules

- Return only the title, no quotes, no markdown, no explanation.
- Maximum 8 words.
- Prefer concrete subject and outcome over generic labels.
- Do not include speaker names.
- If the conversation is trivial, return an empty string.

## Conversation
"""

CONVERSATION_TAGS_PROMPT = """You create durable search tags for a Mirror Mind conversation.

Return ONLY a JSON array of 3 to 6 strings. No markdown.

Tag rules:
- Use durable topics, project names, methods, product areas, or domains.
- Prefer nouns and named concepts over verbs or generic adjectives.
- Do not include numbers, IDs, hashes, CSS sizes, file paths, dates, or code fragments.
- Do not include generic action words like adjust, discuss, create, central, field, canonical.
- Tags should help find the conversation months later.
- Use lowercase unless the tag is a proper project/method name.

Good examples:
["ariad", "metadata lifecycle", "web console", "conversation maintenance"]

Bad examples:
["adjust", "central", "10px", "1b63c00", "fields", "discussed"]

## Conversation
"""

CONVERSATION_SUMMARY_PROMPT = """You are the memory system for Mirror Mind, a Jungian mirror AI.

Write a 3-4 sentence summary of the conversation below. Use flowing prose, not a list.

## Rules

- Open with the main topic or question the conversation addressed.
- Include the key decision, insight, or commitment reached, if any.
- Note emotional tone or psychological layer only when clearly present and significant.
- Standalone: a reader six months from now must understand what happened from the
  summary alone. Do not write "we discussed", "the user said", or "the conversation".
- If the conversation is trivial (greetings, scheduling, one-line exchange), return
  an empty string and nothing else.

## Conversation
"""

CURATION_PROMPT = """You are the memory curation system for Mirror Mind, a Jungian mirror AI.

You have just extracted candidate memories from a conversation. Your job is to
deduplicate them against the user's existing memory pool and decide what to
actually store.

## Decision rules

For each candidate, decide:

**keep** — The candidate contains genuine new signal not present in existing
memories. Include it unchanged.

**merge** — The candidate meaningfully extends or refines an existing memory.
Synthesize a combined version: use the candidate's structure but incorporate
the additional nuance. Include the merged version once.

**drop** — The candidate is a near-duplicate, restatement, or weaker version
of an existing memory. Omit it entirely.

Default to **keep** when uncertain. Only drop on clear overlap. Merge only
when the synthesis is strictly better than either alone. Never invent content
not present in the candidates or existing memories.

## Response format

Return ONLY a JSON array in the same format as the extraction output.
Omit dropped candidates entirely. Merged candidates appear as a single entry.
If all candidates are duplicates, return: []

[
  {
    "title": "concise title, max 10 words",
    "content": "standalone, self-contained content",
    "context": "one sentence: what prompted this memory",
    "memory_type": "decision|insight|idea|tension|learning|pattern|commitment|reflection",
    "layer": "self|ego|shadow",
    "tags": ["keyword1", "keyword2"],
    "journey": "slug or null",
    "persona": "slug or null"
  }
]

"""

WEEK_PLAN_PROMPT = """You are the temporal planning system for Mirror Mind.

Analyze the text below and extract ALL temporal items: tasks, commitments,
events, and meetings.

## Reference Date
Today is {today} ({weekday}).

## Active Journeys
{journeys}

## Extraction Rules

1. **due_date** (required): Resolve ALL relative time references to absolute dates (YYYY-MM-DD).
   - "today" -> {today}
   - "tomorrow" -> the next day
   - "Friday" -> the next Friday from today
   - etc.

2. **scheduled_at**: Use ONLY when an exact time is mentioned, such as "at 7pm" or "15:00".
   Format: YYYY-MM-DDTHH:MM. DO NOT INVENT TIMES.

3. **time_hint**: Use for vague time references such as "late afternoon", "during the day", "morning", or "afternoon".
   If scheduled_at is present, time_hint is null.

4. **journey**: Associate the most likely active journey slug using the list above.
   If there is no clear match, use null.

5. **title**: Short and actionable. If the item is tentative, include "(tentative)" in the title.

6. **context**: Brief context note extracted from the original text.

## Response Format
Return ONLY a JSON array, with no markdown:
[
  {{
    "title": "...",
    "due_date": "YYYY-MM-DD",
    "scheduled_at": "YYYY-MM-DDTHH:MM" or null,
    "time_hint": "..." or null,
    "journey": "slug" or null,
    "context": "..."
  }}
]

If there are no items, return: []

## Text
"""

SHADOW_SCAN_PROMPT = """You are reviewing shadow-layer memory material from {user_name}'s conversations.
Your task: surface 1-3 candidate shadow observations grounded in evidence.

Shadow work is observation, not verdict. A shadow observation names a specific recurring
pattern — avoidance, contradiction, blind spot — with supporting evidence. It is framed
as what the data shows, not as a character judgment. "This has come up in N contexts" not
"you always avoid X".

## Current structural shadow layer
{shadow_structure}

## Shadow-candidate memories
(These memories carry tension, pattern, or avoidance material across conversations)
{shadow_memories}

## Rules
- Only surface what the memories actually support with evidence
- Do NOT duplicate patterns already in the structural shadow layer above
- Each observation must name the memory IDs it is grounded in
- When in doubt, do not surface — the cost of false positive shadow surfacing is high
- 0 observations is a valid output when nothing new is supported

## Output format (strict JSON array, no markdown fencing)
[
  {{
    "title": "brief pattern name (3-6 words)",
    "observation": "2-3 sentence grounded observation with provenance note",
    "memory_ids": ["id-1", "id-2"],
    "evidence_note": "appeared in N conversations / M different contexts"
  }}
]

Return [] when nothing new is supported by the evidence.
"""

CONSOLIDATION_PROMPT = """You are reviewing a cluster of semantically related memories
extracted from {user_name}'s conversations. Your task: propose one consolidation action.

## Current identity context (for reference when proposing updates)
{identity_context}

## Memory cluster
{cluster_text}

## Three possible actions

**MERGE** — the memories overlap significantly (same fact, same decision, same insight
stated multiple times). Propose a single sharper memory that distills the key signal
without losing nuance. The merged memory replaces all source memories in scoring; the
originals remain as provenance.

**IDENTITY_UPDATE** — the pattern across these memories is significant and stable enough
to update the structural identity. Propose specific text to add to or revise in an
identity layer. Be surgical: propose the exact paragraph or sentence to insert or replace,
not a full rewrite. Requires ≥3 memories showing the same pattern.

**SHADOW_CANDIDATE** — the memories reveal a tension, avoidance, or contradiction pattern
that the user may not be fully aware of. This is raw shadow material, not ready to surface
yet — propose a concise candidate observation with supporting evidence. It will be reviewed
again in the mm-shadow pass before surfacing.

## Output format (strict JSON, no markdown fencing)
{{
  "action": "merge" | "identity_update" | "shadow_candidate",
  "target_layer": "<layer>" | null,
  "target_key": "<key>" | null,
  "proposed_content": "<the exact content to write>",
  "rationale": "<one sentence: why this action rather than the alternatives>"
}}

## Action selection rules
- Prefer MERGE when memories restate the same insight (lower stakes, always safe)
- Use IDENTITY_UPDATE only when ≥3 memories show a clear, persistent pattern worth encoding
- Use SHADOW_CANDIDATE only for genuine tension/avoidance patterns — not every negative memory
- When uncertain between MERGE and IDENTITY_UPDATE, choose MERGE
- target_layer and target_key must be non-null only for IDENTITY_UPDATE
"""
