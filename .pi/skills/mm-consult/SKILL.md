---
name: "mm-consult"
description: Asks other LLMs through OpenRouter with Mirror identity context
user-invocable: true
---

# Consult

Sends prompts with Mirror identity context to other models through OpenRouter.

## Syntax

```
/mm-consult <family> [tier] ["question"]
/mm-consult credits
```

- **family:** `gemini`, `grok`, `deepseek`, `openai`, `claude`, `llama`, or a direct model ID
- **tier:** `lite` (default), `mid`, `flagship`
- **question present:** send it directly
- **question missing:** synthesize the current conversation and create the prompt

## Flow

> Through the front door the model call has a 10-minute ceiling (`MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS`); a call killed at the ceiling is spent but leaves no `llm_calls` row. Direct Python invocation had no bound (CR072).

### Explicit Question

Analyze the message to determine persona and journey using Mirror routing.

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts consult FAMILY TIER "QUESTION" \
  [--persona PERSONA] [--journey JOURNEY] [--org]
```

**Examples:**
- `/mm-consult gemini lite "draft an opening for this article"` → `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts consult gemini lite "draft an opening for this article" --persona writer`
- `/mm-consult deepseek "is this design overengineered?"` → `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts consult deepseek "is this design overengineered?" --persona engineer`

The script prints the response, cost, and balance. Always show the complete response to the user without summarizing or omitting it.

### No Question

When the user omits the question, synthesize Mirror Mode content (reflection, strategy, content — not Builder Mode code or architecture) into a self-contained prompt, then call:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts consult FAMILY TIER "SYNTHESIZED_PROMPT" \
  [--persona PERSONA] [--journey JOURNEY] [--org]
```

The synthesized prompt must be self-contained — the external LLM has no access to the conversation.

## Credits

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts consult credits
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
