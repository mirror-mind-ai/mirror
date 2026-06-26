---
name: "mm:consult"
description: Asks other LLMs through OpenRouter with Mirror context
user-invocable: true
---

# Consult

Sends prompts with Mirror identity context to other models through OpenRouter.

## Syntax

```
/mm:consult <family> [tier] ["question"]
/mm:consult credits
```

- **family:** `gemini`, `grok`, `deepseek`, `openai`, `claude`, `llama`, or a direct model ID such as `google/gemini-2.5-pro`
- **tier:** `lite` (default), `mid`, `flagship`
- **question present:** send it directly
- **question missing:** synthesize the current conversation and create the prompt

## Flow

### Explicit Question

Analyze the message to determine persona and journey using the same Mirror routing.

```bash
uv run python -m memory consult FAMILY TIER "QUESTION" \
  [--persona PERSONA] [--journey JOURNEY] [--org]
```

**Examples:**
- `/mm:consult gemini lite "draft an opening for this article"` -> `uv run python -m memory consult gemini lite "draft an opening for this article" --persona writer`
- `/mm:consult deepseek "is this design overengineered?"` -> `uv run python -m memory consult deepseek "is this design overengineered?" --persona engineer`

The script prints the response, cost, and balance. Always show the complete response to the user without summarizing or omitting it. Any Claude comments come after the full response.

### No Question

When the user omits the question, they want a second opinion on the current conversation. Synthesize only Mirror Mode content: reflection, strategy, and content. Ignore Builder Mode content such as code, debugging, and project architecture.

1. Synthesize the context into a self-contained prompt: topic, goal, relevant journey/attachments/references, what was discussed or decided, and what the user is asking now.
2. Formulate a clear request for the external LLM.
3. Send it as an ask:

```bash
uv run python -m memory consult FAMILY TIER "SYNTHESIZED_PROMPT" \
  [--persona PERSONA] [--journey JOURNEY] [--org]
```

The synthesized prompt must be self-contained. The external LLM has no access to the conversation, so include concrete details instead of vague references like "as discussed."

Example prompt:

```
I am preparing episode 5 of the Reflexo series, about leadership and complexity.
The episode covers [key script points]. I have already suggested topics A, B, and C.

Suggest 3 alternative article topics for software leaders, keeping depth without academicism.
```

## Credits

```bash
uv run python -m memory consult credits
```

Shows OpenRouter usage and remaining balance.

## Available Families And Tiers

| Family | Lite | Mid | Flagship |
|---------|------|-----|----------|
| gemini | gemini-2.5-flash-lite | gemini-2.5-flash | gemini-2.5-pro |
| grok | grok-3-mini | grok-3 | grok-4.1-fast |
| deepseek | deepseek-chat | deepseek-v3.2 | deepseek-r1 |
| openai | gpt-5.4-nano | gpt-5.4-mini | gpt-5.4 |
| claude | haiku-4.5 | sonnet-4.6 | opus-4.6 |
| llama | llama-3.3-70b-instruct | llama-4-scout | llama-4-maverick |
