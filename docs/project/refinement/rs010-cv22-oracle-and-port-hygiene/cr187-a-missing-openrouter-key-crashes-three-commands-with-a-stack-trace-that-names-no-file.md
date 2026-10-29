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

### Plan (2026-10-29; reviewed through four lenses, approved by the Navigator)

**Objective.** A command that needs `OPENROUTER_API_KEY` and finds none stops before
doing anything, with one line that names the file the key goes in. A key that OpenRouter
refuses is answered the same way: one line, no stack trace. Nothing the person wrote is
lost, and the commands that report on an install say that the key is missing.

**What planning found.**

- The front door already has the handler this needs. Errors that escape a route go
  through `namedRefusal()` in `main`, which answers a known refusal with one line and an
  exit code. `ProviderConfigError` is not on its list, so it reaches Node as a stack
  trace.
- The key is read lazily, at the first model call, so a failing command may already have
  done work:
  - A keyless `journal` copies the whole database into its pre-write snapshot (434 KB on
    a fresh, seeded home), then fails. It classifies the entry with a model call before
    it writes anything, so the entry is never kept.
  - A keyless `consult` ask does the same: it opens the database for its ledger, taking
    the snapshot, before the route asks for providers.
- Two more commands misreport the cause:
  - `descriptor generate` prints "skipped (empty response)" for every persona and exits
    0. A golden grades that behavior for any provider error.
  - On a keyless home, `consolidate scan` says "No memories with embeddings found". That
    is true only because nothing can be embedded without a key.
- A wrong key fails just as badly: `consult credits` with a bogus key prints
  `LlmTransportError: provider returned HTTP 401` as a stack trace. The transport already
  classifies 401 and 403 as `auth`. On an embedding call, though, `generateEmbeddingSafely`
  wraps the error in an `EmbeddingError` that drops that classification. A command that
  only embeds, such as `consolidate apply`, could not be answered by name.
- The provider trims the key, so a key of only spaces is missing.
- Nothing in the product embeds a memory later. An entry kept without its embedding would
  stay that way.
- `memories --search` already knows why a search degraded: `degradedKind` is `config` for
  a missing key.
- `soul harvest save` already keeps the harvest when its embedding fails, so it can be
  retried.
- The diagnose findings that read the environment are added outside the golden-graded
  `diagnoseRuntime`, so a key finding moves no golden. A status line does: all 27
  renders of `runtime-status`.
- CI sets no key, and the replay variables are set per test. A test of the live path
  without a key cannot reach the network.

**Decisions, approved by the Navigator, 2026-10-29.**

1. `journal` with no key refuses before any work, and says the entry was not saved.
2. The key is checked up front, before the database opens, in the seven commands that
   cannot work without it: `consult`, `journal`, `week plan`, `descriptor generate`,
   `consolidate scan`, `consolidate apply`, and `shadow scan`. The front-door handler
   answers everything else.
3. A key OpenRouter refuses (HTTP 401 or 403) is included: it is the same person, a minute
   later.

**Behavior.**

All the sentences are built in one place, `providers/config.ts`, and name the file that
`configFilePath()` resolves. The consequence comes first:

```text
Error: the journal entry was not saved, because OPENROUTER_API_KEY is not configured. Add OPENROUTER_API_KEY=<your key> to <config>, then run the same command again.
Error: nothing was done, because OPENROUTER_API_KEY is not configured. Add OPENROUTER_API_KEY=<your key> to <config>, then run the same command again.
Error: OpenRouter refused OPENROUTER_API_KEY (HTTP 401). Check the key where it is set: the environment, the clone's .env, or <config>.
```

- `journal` prints the first line; the other six commands checked up front print the
  second.
- A command that only reaches the key at its first model call, such as `soul harvest
  save`, prints `Error: OPENROUTER_API_KEY is not configured. Add OPENROUTER_API_KEY=<your
  key> to <config>.` It makes no claim about what was done. Neither does the refused-key
  line.
- When the config file does not exist yet, the instruction also says to create it
  readable only by its owner: `(a new file; make it readable only by you: chmod 600
  <config>)`. Otherwise a hand-made file holding the key would be `0644`. No message, doc,
  or example shows `echo` with a real key.
- Every missing-key and refused-key line exits 2, as a missing home does: in
  decisions.md, configuration failures exit 2.
- The up-front check runs only in live mode. A replay fixture needs no key, so tests and
  CI behave as before.
- For `consult` ask, the check runs before the ledger database is opened.
- One predicate, `hasOpenRouterKey` (trimmed), serves the up-front check, the status line,
  and the diagnose finding.
- `namedRefusal` answers every `ProviderConfigError` with its own message. That also
  turns the argv-secret refusal into one line. It also answers a refused key, whether the
  refusal arrived as an `LlmTransportError` or as an `EmbeddingError`, which now keeps
  the transport's kind and status. No line ever carries the key or a response body.
- `memories --search` says which cause degraded it:
  - for a missing key:
    `⚠ Degraded: lexical-only search (OPENROUTER_API_KEY is not configured: add it to <config>).`
  - for a refused key:
    `⚠ Degraded: lexical-only search (OpenRouter refused OPENROUTER_API_KEY: check the key where it is set).`
  - for every other cause, today's note.
- `runtime status` gains a line after `Models:`, either `OpenRouter key: configured` or
  `OpenRouter key: not configured`. It never prints the value, and it does not change
  the verdict, so the update gate is untouched.
- `runtime diagnose` gains an `openrouter_key_missing` finding at attention level. It says
  that embeddings, memory extraction, and `consult` are off, and its recommendation is
  the same add-the-key instruction.

**Affected files.**

- `ts/src/providers/config.ts`: the sentences, `hasOpenRouterKey`, and
  `requireOpenRouterKey`.
- `ts/src/providers/familyProviders.ts`: `requireFamilyProviders`, and the
  decision-only `requireKeyForFamily` that the `consult` ask path calls before it opens
  its database.
- `ts/src/providers/embedding.ts`: `EmbeddingError` keeps the transport's kind and status.
- `ts/src/search/memorySearch.ts`: the degraded cause uses the kept kind.
- `ts/src/frontDoor/cli.ts` (`journal`, `week plan`, `descriptor generate`,
  `consolidate apply`, `consolidate scan`, `shadow scan`, and the `consult` ask path) and
  `ts/src/frontDoor/consultRoute.ts`: the up-front check.
- `ts/src/frontDoor/namedRefusal.ts`: the missing key and the refused key.
- `ts/src/frontDoor/searchRoute.ts`: the degraded notes.
- `ts/src/runtime/status.ts`: the status line. `ts/src/runtime/diagnose.ts` and
  `ts/src/frontDoor/runtimeRoute.ts`: the finding.
- Tests:
  - Unit tests:
    - the sentence builders, including the new-file clause;
    - `hasOpenRouterKey` for unset, empty, spaces only, and set;
    - `namedRefusal` for the missing key, an `LlmTransportError` auth, an
      `EmbeddingError` that kept an auth kind, and the argv-secret refusal;
    - `generateEmbeddingSafely` keeping the kind;
    - search's note for each cause;
    - the status line both ways;
    - the diagnose finding, present and absent;
    - a replay family resolving without a key;
    - a canary key that no output contains.
  - A front-door test with a scratch home. `OPENROUTER_API_KEY` is set to the empty
    string, never left unset, because this checkout's `.env` supplies a real one on a
    developer machine. `MEMORY_ENV` is pinned. Each of the seven commands answers in one
    line and exits 2, with no stack trace and no new file under `backups/`. `journal`
    writes no row. The test also covers search's note, the status line, and the diagnose
    finding.
- Golden: in `runtime-status`, the line `OpenRouter key: not configured` in all 27
  renders, since the tests render with no key. The edit is made by a script that asserts
  the counts, with a row in the README.
- `scripts/smoke_npm_package.sh`: the package lane has no key, so the smoke checks that
  `journal` refuses in one line naming `$CONFIG`, takes no snapshot, and that status and
  diagnose say the key is missing.
- Docs: the configuration reference's `OPENROUTER_API_KEY` entry (the config file
  readable only by its owner, where a key comes from, and what a missing or refused key
  does), and REFERENCE.md's table row.

**Checks.**

- Test-driven: each behavior above starts as a failing test.
- The verification checklist and the repository checks.
- The suite also under `MEMORY_ENV=test`, through `test_leaves_nothing.sh`, as CI runs it.
- `bash scripts/smoke_npm_package.sh`.

**Navigator validation.** Run on the package lane, as for CR185:

```bash
S=$(mktemp -d)
(cd ~/dev/workspace/mirror-dev && npm pack --silent --pack-destination "$S")
npm install -g --silent --prefix "$S/prefix" "$S"/mirror-mind-*.tgz
m() { env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u OPENROUTER_API_KEY HOME="$S" PATH="$S/prefix/bin:$PATH" mirror "$@"; }
m init probe >/dev/null && m seed >/dev/null
mv "$S/.mirror-minds/probe/backups" "$S/backups.aside"   # set the snapshot aside
m journal "a note about the day"     # 1. "Error: the journal entry was not saved, because … Add … $S/.config/mirror/env, then …"
ls "$S/.mirror-minds/probe/backups"  #    "No such file or directory": no snapshot was taken
m week plan "Monday: write"          # 2. "Error: nothing was done, because …"
m consult credits                    # 3. the same, for consult
m memories --search "day"            # 4. the degraded note names the file
m runtime status | grep OpenRouter   # 5. OpenRouter key: not configured
m runtime diagnose | grep -A3 openrouter_key_missing   # 6. the finding, naming the file
printf 'OPENROUTER_API_KEY=sk-or-v1-wrong\n' >> "$S/.config/mirror/env"
m runtime status | grep OpenRouter   # 7. OpenRouter key: configured (the value is never printed)
m consult credits                    # 8. "Error: OpenRouter refused OPENROUTER_API_KEY (HTTP 401). Check the key where it is set: …"
```

Step 8 makes one real request to OpenRouter with a bogus key. It is refused and spends
nothing.

Pass: steps 1, 2, 3, and 8 print one line each, exit 2, with no stack trace; the file named
is the scratch home's; step 1 recreates no `backups/`; and no step prints the key.
Fail: a stack trace, a line that names no file, a `backups/` after step 1, or a key on screen.

**Exclusions.**

- CR178: extraction at session end with no key, and the quarantine it can cause.
- Other transport failures: network down, timeouts, rate limits, and server errors still
  reach Node as stack traces in these commands. That can be captured separately if wanted.
- With a wrong key, `descriptor generate` still prints "skipped (empty response)" for each
  persona. That is golden-graded behavior for any provider error, and the up-front check
  only sees whether a key is present.
- Checking that a key works before using it.
- `build load` and `mirror load` keep degrading as they do now.
- Release notes are written at release time. Commit, push, and release remain separate
  gates.

**Driver and Delivery.** `@viniciusteles` on `main`, confirmed by the Navigator
2026-10-29.

### Review (2026-10-29)

The plan was reviewed through four lenses before approval: product designer, engineer,
quality assurance, and security engineer. All four agreed with decisions 1 and 2. What
each contributed is folded into the plan above:

- **Product designer:** the consequence comes first; the wrong key, the journey's next
  step, is included; the configuration reference links Getting Started for where a key
  comes from; the up-front check stays limited to the seven commands.
- **Engineer:** `consult`'s ask path checks before its ledger database opens (verified: it
  took a snapshot); one trimmed predicate for status, diagnose, and the check; the
  overloaded `ProviderConfigError` keeps one class, with search's reliance on it
  documented at the site; the helper's contract stated in its comment; tests for spaces
  only, for replay never refusing, and for no new snapshot.
- **Quality assurance:** the acceptance criteria above; spawned tests blank the key with
  the empty string and pin `MEMORY_ENV`; transport failures other than a refused key are
  left as a known risk.
- **Security engineer:** the owner-only clause when the config file does not exist yet;
  no `echo` of a real key; a canary test that no output carries the key; a refused-key
  line that echoes neither the key nor the response. No other objection.

### Implementation evidence (2026-10-29)

The work went in as five commits on `main`, test-first, each one green:

1. `a92c5a6e`: the sentences and their trimmed predicate; `requireFamilyProviders` and
   `requireKeyForFamily`; `EmbeddingError` keeping the transport's kind and status; and
   `namedRefusal` answering a missing key and a refused key.
2. `19fe8238`: the commands that cannot work without the key check it up front.
3. `3fd7f13f`: the degraded-search notes.
4. `8f881435`: the status line and the diagnose finding, with the golden edit and its
   README row.
5. `89a6df93`: the configuration reference, REFERENCE.md, and the package smoke.

**Tests.** 28 new tests: unit tests for config, embedding, memory search,
familyProviders, namedRefusal, the search route, status, and diagnose, plus
`openRouterKeyMissing.test.ts` through the real front door.

The whole suite ran twice:

- as CI runs it, with `MEMORY_ENV=test` and the key blank, through
  `test_leaves_nothing.sh`;
- with no `mirror` on the PATH.

Both gave 3618 tests: 3615 pass, 0 fail, 3 skipped. Nothing was left behind.

**Checks.**

- Clean: typecheck; `git diff --check`; and the retired-surface, pack-contents (507
  files), doc-link, skill-parity, temp-home, and Claude-plugin checks.
- Lint is clean apart from the warning that was already there, in
  `testTempHomes.test.ts`.
- These smokes pass: migration structural parity, bootstrap custody, migrate-on-open,
  conversation lifecycle, Builder lifecycle, extension catalog, `smoke_mirror_mcp.sh`, and
  `smoke_runtime_update.sh`.
- `smoke_npm_package.sh` passes 95 checks, with a new step 5c for the package lane with
  no key.
- `smoke_claude_plugin.sh` fails at its known CR172 step, as it did before CR185.

**Decided while implementing.**

- **`consolidate apply` is not checked up front, although the plan listed it.** Its own
  route shows that only a `merge` proposal embeds; `identity_update` and
  `shadow_candidate` need no provider. An up-front check would refuse proposals that can
  be applied without a key. A keyless `merge` still gets the one-line answer from the
  front-door handler. The check covers six commands, not seven.
- `keyFileTarget` (the file plus the new-file clause) is split out of the instruction, so
  search's note names exactly what the refusals name.
- `smoke_npm_package.sh` now unsets `OPENROUTER_API_KEY` with the other variables. A
  developer shell that exports one would otherwise hide the keyless lane.
- The agent dry-ran the validation route on the package lane, and every step showed what
  it says, with no key printed. That run showed `ls -l`'s minute resolution was too
  coarse to prove no snapshot, so step 1 now sets `backups/` aside and checks that
  nothing recreates it. The dry run is evidence, not the Navigator's validation.

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

## Validation (2026-10-29, Navigator)

The Navigator ran the package-lane route: this checkout packed as
`mirror-mind-0.38.0.tgz`, installed into a scratch prefix, with a scratch home seeded by
`init probe` and `seed`, and no key anywhere.

1. With `backups/` set aside, `journal "a note about the day"` printed one line: "Error:
   the journal entry was not saved, because OPENROUTER_API_KEY is not configured. Add
   OPENROUTER_API_KEY=<your key> to …/.config/mirror/env, then run the same command
   again." Afterwards `ls` found no `backups/`, so no snapshot was taken.
2. `week plan` printed one line: "Error: nothing was done, because …".
3. `consult credits` printed the same line.
4. `memories --search "day"` printed
   `⚠ Degraded: lexical-only search (OPENROUTER_API_KEY is not configured: add it to …/.config/mirror/env).`
5. `runtime status` printed `OpenRouter key: not configured`.
6. `runtime diagnose` printed the `openrouter_key_missing` finding at attention level,
   with its recommendation naming the file.
7. With a wrong key added to the file, `runtime status` printed
   `OpenRouter key: configured`, and the value was not printed.
8. `consult credits` then printed "Error: OpenRouter refused OPENROUTER_API_KEY (HTTP
   401). Check the key where it is set: the environment, the clone's .env, or
   …/.config/mirror/env."

No step printed the key. The Navigator's shell does not show exit codes. Exit 2 is
asserted by the front-door test and by the package smoke. Accepted.

## Review (debt and proportionality)

No debt that blocks closure. These known limits are recorded in the exclusions:

- Transport failures other than a refused key (network down, timeouts, rate limits,
  server errors) still reach Node as stack traces in these commands.
- With a wrong key, `descriptor generate` still prints "skipped (empty response)" for
  each persona. That line is golden-graded.
- `consolidate apply` is not checked up front, because only a `merge` embeds. A keyless
  `merge` still takes its pre-write snapshot before the one-line answer.
- Search's note relies on `config` meaning a missing key inside `memories --search`. The
  reliance is documented at the site.

The change is proportionate: about 280 lines of product code across 11 files, much of it
comments, and 28 tests. A single helper serves the six call sites, each of which used to
end in a stack trace.

Follow-ups outside this CR:

- the transport failures above, if wanted, as a CR of their own;
- CR178, extraction at session end with no key, which is unchanged.

## Outcome

Done 2026-10-29. Driver @viniciusteles, delivery `main`:

- `a92c5a6e`: the sentences, the predicate, the helpers, the wrapper that keeps a
  refused key's kind, and the front-door handler;
- `19fe8238`: the six up-front checks;
- `3fd7f13f`: the degraded-search notes;
- `8f881435`: the status line and the diagnose finding;
- `89a6df93`: the docs and the package smoke;
- `adec4afd`: the record.

A missing key is now one line that says what was not done and where the key goes,
before anything is touched; a refused key is one line too. Status, diagnose, and search
all say it. No journal entry is lost to a missing key any more, and no output prints a
key.
