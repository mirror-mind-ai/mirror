[< Specs](../index.md)

# Welcome Card

A short, state-aware message the mirror surfaces once when a runtime starts.
Replaces nothing essential — it is not a banner or a menu. It exists to make
the mirror feel **continuous** across sessions: when you open it, you should
sense that something already lives there.

The welcome is computed by the core and rendered by each runtime as a
single block. One source, four interfaces, one voice.

---

## Principles

1. **One unit, not many.** Welcome appears in one place per startup. Never
   duplicated between popup and footer, never split into a sequence of
   notifications.
2. **State, not decoration.** Content reflects the current state of the mirror
   (active journey, recent insight, recent conversation). Static banners are
   forbidden.
3. **Silence when there is no signal.** If the mirror has nothing meaningful
   to say, the welcome is empty and nothing renders. The command must be safe
   to call in any state.
4. **Local-first and network-tolerant.** Welcome composition uses SQLite reads,
   lightweight git inspection, and an optional remote release check bounded to
   5 seconds. It does not depend on the network: remote failures are silent and
   never hold startup past that bound. No LLM, no embeddings. Must run quickly
   on a warm database.
5. **First person.** The mirror speaks as the user. The closing invitation is
   not "How can I help you?" — it is `Where shall we begin?`.

---

## Anatomy

The welcome is **three stable lines** plus an optional release/update notice and
a closing invitation:

```
◇ Mirror · <user>
Version <version> · channel <stable|main>
<N> journeys · <N> personas · <N> memories · <N> conversations · since <Month YYYY>
[New Version Available: vX.Y.Z — <release title>]
[Ask: "what changed?" or "update my Mirror"]

→ Where shall we begin?
```

| Line | When it appears | Source |
|------|-----------------|--------|
| Header (`◇ Mirror · <user>`) | Always, if a Mirror home is resolvable | the resolved Mirror home's name |
| Version (`Version <version> · channel <channel>`) | Always, when header renders | the installed version (`package.json` of the running tree) and the channel this install follows, as `runtime channel` reports it |
| Stats | Always, when header renders | counts from the database |
| Update notice | Only when the install's own check, or a cached verdict that still applies, shows an update | the update-awareness cache; for a package, its channel's dist-tag on the registry; for a clone, `git ls-remote` against its own remote and its own local refs |
| Invitation (`→ Where shall we begin?`) | Always, when header renders | constant |

If the header cannot be resolved (no `MIRROR_HOME`, no `MIRROR_USER`), the
welcome is empty. There is no other path to empty output — a fresh database
still shows the welcome, even when every counter is zero.

### Version and update notice

The welcome shows the installed Mirror Mind version and update channel so the user can immediately see which runtime they are using and whether it follows the stable release channel or the main dogfooding channel.

The update notice answers for the install that is running, never for the
directory the welcome is rendered in. Pi renders it in the person's project,
so a check that read the current directory would report on that project
(CR135). The install is read from where the front door lives:

- a **package** asks the registry for its channel's dist-tag, as
  `runtime update --check` does (`npm view mirror-mind dist-tags`). npm runs in
  the install's own directory, so a project's `.npmrc` cannot choose the
  registry, and without npm's retries;
- a **clone** asks its own remote with `git ls-remote`, and the local
  `N commits behind` line counts its own checkout against its fetched channel
  branch;
- an install the runtime cannot identify is not checked.

On the `stable` channel the check runs at every render, so a release published
today appears at the next session start. On `main` it never runs, and the card
shows the cached verdict. The remote reads of one render share a 5-second
budget. A check that cannot answer leaves the cache as it was, and the card
shows what the cache knows. The check does not fetch, mutate refs, back up, run
migrations, or update files. Each check adds one line to `front-door.log`: what
it asked, how it answered, and how long it took.

A cached update for the installed version, or for an older one, no longer
applies: neither the card nor the status line shows it. A successful
`runtime update` records `up_to_date` for the home it updated.

Update-awareness cache lives under:

```text
<mirror-home>/runtime/update-check.json
```

Users can disable remote welcome checks with:

```bash
MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off
```

When a new version is visible, the welcome labels it as `New Version Available`
and invites the user to ask Mirror in natural language: `what changed?` or
`update my Mirror`. Runtimes that support notification levels should render this
welcome with stronger emphasis than the normal startup notice.

### Why stats and not narrative

An earlier iteration of the welcome showed the active journey and the last
insight from that journey. Useful as a signal, but it created a false
expectation: the welcome is rendered as a `ctx.ui.notify` popup and is **not
part of the conversation context the model receives**. A user reading `Last
insight: "X"` would naturally ask the assistant about X and get a confused
or hallucinated reply.

Stats fix this by removing the narrative content from the welcome. Numbers
do not invite conversation — they just convey scale, structure, and
longevity. To converse about state, the user activates Mirror Mode
(`/mm-mirror`) which loads identity and memories into the conversation
context properly.

### Stats

The stats line shows five values, always in this order, always separated by
` · `:

| Value | Computation |
|-------|-------------|
| `<N> journeys` | Active journeys: identity rows with `layer='journey'` whose content declares `Status: active`. Same source as `list_active_journeys()`. |
| `<N> personas` | Identity rows with `layer='persona'`. |
| `<N> memories` | `COUNT(*) FROM memories`. |
| `<N> conversations` | `COUNT(*) FROM conversations`. |
| `since <Month YYYY>` | `MIN(started_at) FROM conversations`, formatted as `since <abbrev-month> <year>`. When there are no conversations, render `since today`. |

Counts above 1000 use a thousands separator (`1,247 memories`). Counts
below that render bare (`5 journeys`). Values of zero render literally
(`0 memories`) — a fresh mirror should look new, not pretend not to be.

---

## Contract: `mirror welcome`

Prints the composed welcome to stdout and exits 0. Always exits 0 even when
no welcome is produced (empty output).

```
Usage: mirror welcome [--mirror-home PATH] [--status-line]
```

Behaviour:

- Reads the active Mirror home from `--mirror-home`, `MIRROR_HOME`, or
  `MIRROR_USER` (standard resolution).
- Emits an empty string if `MIRROR_WELCOME=off` is set.
- Emits an empty string if the Mirror home cannot be resolved.
- Otherwise composes the welcome per the rules above.
- May perform a remote release check for the running install, bounded to 5
  seconds, unless disabled with `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off`. The
  current directory never changes the answer.
- Does not fetch, mutate refs, back up, migrate, or update files.
- `--status-line` renders a compact runtime status signal from cached state only,
  and spawns nothing. It shows `⬆` only for a cached update newer than the
  installed version.

Stdout is the rendering. There is no JSON variant. Runtimes must not parse —
they just display the string verbatim.

---

## Runtime integration

Each runtime calls `mirror welcome` once at session start. The
display rules are:

| Runtime | Render | Notes |
|---------|--------|-------|
| Pi | `ctx.ui.notify(welcome, "info")` once if non-empty | Status bar calls `mirror welcome --status-line` and shows `◇ <user> · <indicator>` |
| Codex | `printf` to terminal once if non-empty | Same string |
| Gemini CLI | `printf` to terminal once if non-empty | Same string |
| Claude Code | `/mm:welcome` skill prints it on demand | No automatic injection |

Pi must not also notify the session-start summary string (logging status,
extraction counts) — that information stays in the footer status. The welcome
is the only popup.

---

## Skills

`/mm-welcome` (Pi, Gemini), `$mm-welcome` (Codex), `/mm:welcome` (Claude Code)
all invoke the same command. Useful when:

- `quietStartup: true` is on and the user wants to see the welcome
- The user wants a snapshot mid-session
- A new runtime starts and the welcome was missed
