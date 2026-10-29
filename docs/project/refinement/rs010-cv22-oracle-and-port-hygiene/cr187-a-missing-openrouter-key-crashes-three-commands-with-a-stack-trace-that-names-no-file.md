[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR187 — A missing `OPENROUTER_API_KEY` crashes `consult`, `journal`, and `week plan` with a stack trace that names no file, and the journal entry is lost

## Problem

Every model call reads the key through `resolveProviderConfig`
(`ts/src/providers/config.ts`). When the key is not set, it throws
`ProviderConfigError("OPENROUTER_API_KEY is not configured.")`. That sentence names no
file. A package reads the key from the environment or from
`${XDG_CONFIG_HOME:-~/.config}/mirror/env`, and a clone also from its own `.env`.

This is where a person meets the missing key:

- **`consult`, `journal`, and `week plan`.** Nothing catches the error. Each command
  prints a Node stack trace, with this machine's absolute source paths, and exits 1.
- **`journal` loses the entry.** After the crash, no table in the database has gained a
  row, so the text the person wrote is gone.
- **`memories --search`.** It degrades to lexical search and says
  `⚠ Degraded: lexical-only search (embedding unavailable — offline or no API key).`
  That is honest, but it does not say where the key goes.
- **`runtime status` and `runtime diagnose`.** They say nothing about the key, so the two
  commands meant to report drift cannot report this.
- **The configuration reference.** `docs/reference/configuration.md` says "set
  `OPENROUTER_API_KEY` in `.env` or the shell". A package has no `.env`. Getting Started
  (section 4) and REFERENCE.md's Configuration section both name the config file.

Every package install starts without the key. `init` writes `MIRROR_USER` and tells the
person to add the key by hand. When someone moves from a clone to the package (CR185),
the key is exactly the line left behind in the clone's `.env`.

## Expected Behavior

- A command that needs the key and finds none prints one line and exits non-zero. The
  line names the file this install reads (`configFilePath()`, so `XDG_CONFIG_HOME` is
  honored) and the line to add, `OPENROUTER_API_KEY=<your key>`. It never prints a stack
  trace or the key itself.
- `journal` never drops the person's text silently. It either keeps the entry without its
  embedding, or says plainly that the entry was not saved.
- The degraded-search note names the same file.
- `runtime status` says whether a key is configured, never its value. `runtime diagnose`
  reports a missing key as a finding whose repair route names the file.
- The configuration reference names the config file, as Getting Started does.

## Impact

Medium. A person who skips `init`'s "add your key" step, or who moves from a clone and
leaves the key in the clone's `.env`, meets a stack trace on their first `consult`,
`journal`, or `week plan`. On `journal` they also lose what they wrote. The commands that
diagnose an install are silent about the cause.

## Plan Or Decision

Captured, unassigned, 2026-10-29, at the Navigator's direction. It comes from CR185's
review, which excluded this gap. Planning decides:

- the exit code;
- whether `journal` keeps an entry without its embedding (and how that embedding arrives
  later), or refuses before accepting the entry;
- the shape of the status line and of the diagnose finding;
- whether one front-door handler for `ProviderConfigError` covers every command, as the
  handling of `MirrorHomeNotConfiguredError` does.

Related but separate:

- CR178: a configuration error counts as an extraction attempt, so a missing key at
  session end can quarantine conversations.
- CR129: the same stack-trace shape, for `mirror mcp` with no home.
- CR185: the not-configured home sentence this one should mirror.

## Evidence

Reproduced 2026-10-29 through this checkout's front door, with a scratch `HOME`, a home
created by `init probe` and seeded, `MIRROR_USER=probe`, and `OPENROUTER_API_KEY` blank:

- `consult openai/gpt-5-mini "hello"` printed this, then a stack through
  `LiveLlmProvider.complete` and `runConsultAsk` (`ts/src/consult/core.ts:64`):

  ```text
  file:///…/ts/src/providers/config.ts:187
      throw new ProviderConfigError("OPENROUTER_API_KEY is not configured.");
            ^

  ProviderConfigError: OPENROUTER_API_KEY is not configured.
  ```

  It ended with `Node.js v26.12.1` and exited 1.
- `journal "a note about the day"` printed a stack ending in `withLiveWriteDbAsync` and
  `runJournalContentRoute` (`ts/src/frontDoor/cli.ts`), and exited 1. The row counts of
  every table were compared before and after the run, and none had changed.
- `week plan` printed a stack ending in `runWeekPlanContentRoute`, and exited 1.
- `memories --search "hello"` exited 0 with the degraded note quoted above.
- Neither `runtime status` nor `runtime diagnose` printed a line about the key.

## Outcome

Pending: captured, not planned.
