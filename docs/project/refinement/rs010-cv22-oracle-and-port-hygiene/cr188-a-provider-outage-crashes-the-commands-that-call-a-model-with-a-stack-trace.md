[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR188 — A timeout, an outage, a rate limit, or a server error crashes the commands that call a model with a stack trace, and `journal` loses the entry

## Problem

CR187 made a missing key, and a key OpenRouter refuses (HTTP 401 or 403), one line each.
Every other transport failure still escapes the command. An `LlmTransportError` of kind
`timeout`, `rate_limit`, `provider_error` (a refused connection, DNS, TLS, or an HTTP 5xx),
or `malformed_output` reaches Node as a stack trace showing this machine's source paths,
and the command exits 1.

The transport already knows what happened (`ts/src/providers/openrouter.ts`). It
classifies the failure, says whether a retry is worth it, honours `retry-after` on a 429,
and keeps nothing the provider sent back. Nothing turns that classification into a
sentence for the person.

The commands on this path are `consult`, `journal`, `week plan`, `consolidate scan`,
`consolidate apply`, `shadow scan`, and `soul harvest save`:

- `journal` loses the entry. With a key present, the up-front check passes and the
  pre-write snapshot is taken; then the model call fails, and nothing the person wrote is
  kept.
- `soul harvest save` already keeps the harvest for a retry.
- `descriptor generate` catches the failure for each persona, prints "skipped (empty
  response)", and exits 0. A golden grades that behavior.
- `memories --search` degrades to lexical search and says "offline or no API key", which
  is correct and stays as it is.

## Expected Behavior

- A transport failure that escapes a command prints one line and exits non-zero. It
  never prints a stack trace, anything the provider sent back, or the key. The line says
  what happened (timed out after N s, could not reach OpenRouter, rate limited with the
  wait when known, OpenRouter answered HTTP 5xx, or an answer that was not valid), and
  whether trying again is worth it.
- `journal` never silently drops the person's text on a transient failure. Either the
  entry is kept and finished later, or the line says plainly that it was not saved and
  that running the same command again is safe.
- `descriptor generate` names the real cause instead of "skipped (empty response)",
  unless planning decides that the golden-graded line stays.

## Impact

Medium. A flaky connection, an OpenRouter incident, or a rate limit is ordinary. When one
happens, the person meets a stack trace that names source files, and on `journal` they
also lose what they wrote. An agent relaying the output passes on a trace instead of an
instruction.

## Plan Or Decision

Captured, unassigned, 2026-10-29, at the Navigator's direction, from CR187's exclusions.
Planning decides:

- the exit code: 1 for an operational failure, or 2, as a missing or refused key is a
  configuration failure;
- the wording for each kind;
- whether `journal` keeps the entry after a transient failure, or refuses with "not
  saved". Nothing in the product embeds a memory later (CR187), so keeping it needs that
  piece too.
- whether the answer belongs in `namedRefusal`, beside CR187's refused key, or in each
  route;
- whether `descriptor generate`'s golden-graded skip line changes.

Related but separate:

- CR187: the missing and refused key, and the handler this would extend.
- CR178: at session end, failed extraction attempts count toward a conversation's
  quarantine.
- CR129: the same stack-trace shape, for `mirror mcp`.

## Evidence

Reproduced 2026-10-29 through this checkout's front door. The setup was a scratch home
created by `init probe` and seeded, a fake key, and `MEMORY_LLM_MAX_RETRIES=0`. Neither
case reached OpenRouter.

- **Timeout.** Every LLM timeout was set to 0.001 s.
  - `journal "a note about the day"` printed
    `LlmTransportError: provider call timed out after 1ms` with a stack trace through
    `attempt` (`ts/src/providers/openrouter.ts:176`), and exited 1. The memory count was
    0 before and 0 after: the entry was not kept.
  - `consult credits` printed the same error and stack trace, and exited 1.
- **Connection refused.** `NODE_USE_ENV_PROXY=1` was set, with `HTTPS_PROXY` pointing at
  a closed local port.
  - `week plan "Monday: write"` printed `LlmTransportError: provider connection failed`
    with a stack trace through `openrouter.ts:186`, and exited 1.
  - `memories --search` degraded and printed its general note, as it should.

## Outcome

Pending: captured, not planned.
