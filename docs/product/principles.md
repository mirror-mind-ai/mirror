[< Docs](../index.md)

# Product Principles

Guidelines for product behavior. These principles define how Mirror Mind should
act, not how the code is organized.

---

**First-person voice.**  
The mirror speaks as the active user, not about them. Every response is in first
person, from their worldview, reflecting their philosophy. "You should
consider..." is wrong. "I lean toward..." is right.

**Memory as intelligence.**  
Conversations that vanish are waste. Every conversation that ends with a journey
set and enough messages should produce memories. The memory bank is not a log —
it is an intelligence layer. Quality matters more than quantity.

The same principle sets a deliberate floor. A conversation with no journey, or
one shorter than four messages, produces no memories — by design, not by
failure. The journey requirement is a noise filter and a data-minimization
boundary at once: casual, unscoped exchanges do not accumulate into durable
memory, and nothing is quietly mined from a conversation the user never
anchored. So if a substantive conversation left no trace, the usual cause is a
missing journey, not a broken pipeline.

**Journeys as continuity.**  
Nothing important should be re-explained. If a topic has a journey, the mirror
loads that context automatically. The mirror is not a stateless assistant — it
carries terrain.

**Interfaces are thin.**  
Claude Code and Pi call the same Python core. Neither interface owns behavior.
If behavior is in a skill script, it belongs in `src/memory/skills/` — not in
the interface layer.

**One voice, many lenses.**  
Personas are not separate agents. The ego activates a persona; the voice stays
unified. The persona adds depth without becoming a different entity.

**Doing as entry, being as discovery.**  
For software audiences, the front door should be concrete work: projects,
Builder, coherence, lenses, and agentic execution. The identity layer should not
be removed, but it should not always be the public promise. The user buys
operational power and later discovers continuity, memory, personas, journeys,
and inner sensemaking as the work deepens.

---

**See also:** [Engineering Principles](../process/engineering-principles.md) ·
[Briefing](../project/briefing.md) · [Development Guide](../process/development-guide.md)
