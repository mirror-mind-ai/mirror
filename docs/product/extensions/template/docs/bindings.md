# Bindings

> Replace this template with the actual binding documentation of the
> extension.

For each capability declared under `mirror_context_providers` in
`skill.yaml`, document:

- **Capability id.** Matches `skill.yaml`.
- **What it returns.** The shape and approximate size of the text injected
  into the prompt. Include a sample output (truncated if long).
- **When it fires.** Any conditions inside the provider that decide whether
  to return text or `null`.
- **Suggested personas.** Why these personas, what kind of conversation
  they cover.
- **Dependencies on data.** What rows must exist in the schema for the
  provider to produce useful output. If the database is empty, what
  happens.
- **Performance characteristics.** Approximate latency. If the provider
  hits the LLM or makes network calls, say so.

Then provide a copy-pasteable section showing how to bind:

```bash
mirror ext <id> bind <capability> --persona <persona_id>
mirror ext <id> bindings
```

And how to inspect the result inside Mirror Mode (a sample prompt
fragment).

If the extension provides no capabilities, replace this document with a
single line: `This extension does not register Mirror Mode context
providers.`
