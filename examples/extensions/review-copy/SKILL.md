---
name: "ext-review-copy"
description: Sends copy to multiple LLMs and generates structured HTML reviews
user-invocable: true
---

# Review Copy

> Reference external skill example.
>
> Installed into `~/.mirror-minds/<user>/extensions/review-copy/` with:
>
> ```bash
> mirror extensions install review-copy --extensions-root examples/extensions
> ```
>
> Typed as `/ext-review-copy` on Pi, Claude Code, and Grok Build;
> `$mirror-ext-<user>:ext-review-copy` on Codex; `/mirror-ext-<user>:ext-review-copy`
> on Antigravity, once each runtime is wired with the step the install prints.
>
> Its files land under `~/.mirror-minds/<user>/runtime/`: `skills/pi/ext-review-copy/`
> for Pi, and `skills/claude/ext-review-copy/`, carried by the home's plugin
> `plugin/mirror-ext-<user>/`, for the other four.

Sends a copy file to multiple models through OpenRouter and generates an HTML
report with side-by-side reviews, synthesis, and a recommended next step.

## Syntax

Arguments, whatever name the runtime invoked the skill by:

```text
<file> <model1> [model2] [model3] ...
```

- **file** — path to the copy text file (`.txt`, `.md`, etc.)
- **models** — one or more models in `family` or `family tier` format

Examples:

```text
/ext-review-copy ~/Downloads/lp_v9.txt grok flagship, llama flagship, deepseek flagship
/ext-review-copy ~/copy.txt gemini, openai flagship, deepseek
```

When tier is omitted, default to `flagship`.

## Flow

### 1. Read the file

Read the specified file content.

### 2. Identify journey and context

Infer the related journey from the file name/content when possible. If one is
clear, include `--journey JOURNEY_ID` in consult calls.

### 3. Build the review prompt

Use this prompt with the file content inserted:

```text
Review the following copy as a world-class copywriter. I am the author and want radical honesty — no flattery, only what sharpens the blade.

Structure your response in exactly three sections:

(1) WHAT WORKS WELL
List the strongest elements — what is already effective, resonant, or well-crafted.

(2) WHAT COULD IMPROVE
List specific weaknesses — what is redundant, unclear, emotionally flat, or structurally weak.

(3) TOP 5 SUGGESTIONS
Give 5 specific, actionable suggestions. Each should include what to change and why. If relevant, provide actual rewrite examples.

---
COPY:

{COPY_CONTENT}
```

### 4. Ask the models in parallel

For each requested model, run:

```bash
mirror consult FAMILY TIER "PROMPT" [--journey JOURNEY_ID]
```

Run consult calls in parallel where possible and capture each full response.

### 5. Generate the HTML report

Save the output file at:

```text
~/Downloads/<project-slug>_AI_Reviews_<YYYY-MM-DD>.html
```

Required report structure:
- one card per model
- extracted sections for strengths, weaknesses, and top suggestions
- one highlighted quote per model
- one synthesis section covering convergence, divergence, and recommended next steps
- one modal/full section per model with the unabridged response

Grid rules:
- 1 model → 1 column
- 2 models → 2 columns
- 3+ models → 3 columns max

### 6. Confirm delivery

After saving the HTML, tell the user the full generated file path.

## Boundary contract

This extension should orchestrate stable Mirror commands such as:
- `mirror consult`
- file reads/writes

It should not depend on internal Mirror modules.
