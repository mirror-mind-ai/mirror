[< Specs](../index.md)

# Welcome Card

A short, state-aware message the mirror surfaces once when a runtime starts.
Replaces nothing essential — it is not a banner or a menu. It exists to make
the mirror feel **continuous** across sessions: when you open it, you should
sense that something already lives there.

The welcome is computed by the Python core and rendered by each runtime as a
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
   lightweight git inspection, and an optional remote release check. It does not
   depend on the network: remote failures are silent and never block startup.
   No LLM, no embeddings. Must run quickly on a warm database.
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
[Update available: vX.Y.Z — <release title>]
[Ask: "what changed?" or "update my Mirror"]

→ Where shall we begin?
```

| Line | When it appears | Source |
|------|-----------------|--------|
| Header (`◇ Mirror · <user>`) | Always, if a Mirror home is resolvable | `resolve_mirror_home().name` |
| Version (`Version <version> · channel <channel>`) | Always, when header renders | installed package / `pyproject.toml` fallback plus local update channel |
| Stats | Always, when header renders | counts from the database |
| Update notice | Only when local refs or lightweight remote check show a stable update | update-awareness cache, `git ls-remote`, local release notes when available |
| Invitation (`→ Where shall we begin?`) | Always, when header renders | constant |

If the header cannot be resolved (no `MIRROR_HOME`, no `MIRROR_USER`), the
welcome is empty. There is no other path to empty output — a fresh database
still shows the welcome, even when every counter is zero.

### Version and update notice

The welcome shows the installed Mirror Mind version and update channel so the user can immediately see which runtime they are using and whether it follows the stable release channel or the main dogfooding channel.

The update notice is network-tolerant. The welcome can use a cached update
check or attempt a lightweight remote check with `git ls-remote` when the cache
is missing or older than 6 hours. It does not fetch, mutate refs, back up, run
migrations, or update files. If the remote check fails, the welcome still opens
normally.

Update-awareness cache lives under:

```text
<mirror-home>/runtime/update-check.json
```

Users can disable remote welcome checks with:

```bash
MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off
```

When an update is visible, the welcome invites the user to ask Mirror in natural
language: `what changed?` or `update my Mirror`.

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

## Contract: `python -m memory welcome`

Prints the composed welcome to stdout and exits 0. Always exits 0 even when
no welcome is produced (empty output).

```
Usage: python -m memory welcome [--mirror-home PATH] [--status-line]
```

Behaviour:

- Reads the active Mirror home from `--mirror-home`, `MIRROR_HOME`, or
  `MIRROR_USER` (standard resolution).
- Emits an empty string if `MIRROR_WELCOME=off` is set.
- Emits an empty string if the Mirror home cannot be resolved.
- Otherwise composes the welcome per the rules above.
- May perform a lightweight remote release check unless disabled with `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off`.
- Does not fetch, mutate refs, back up, migrate, or update files.
- `--status-line` renders a compact runtime status signal from cached state only.

Stdout is the rendering. There is no JSON variant. Runtimes must not parse —
they just display the string verbatim.

---

## Runtime integration

Each runtime calls `python -m memory welcome` once at session start. The
display rules are:

| Runtime | Render | Notes |
|---------|--------|-------|
| Pi | `ctx.ui.notify(welcome, "info")` once if non-empty | Status bar calls `python -m memory welcome --status-line` and shows `◇ <user> · <indicator>` |
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
