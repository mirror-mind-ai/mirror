[< Docs](index.md)

# Getting Started

Follow these steps and you will have a working mirror at the end. No persuasion
needed — you've already read the README. This is the setup sequence.

---

## 1. What You'll Need

### Subscription — the main cost decision

Mirror Mind is a framework; the actual AI conversation runs through a harness
you choose. The harness determines which subscription you need.

| Subscription | Harnesses unlocked | Pi support | Recommendation |
|---|---|---|---|
| [Codex Plus](https://openai.com/codex/) | Codex + Pi | ✅ Full | ✅ Best path |
| [Claude Code Pro](https://code.claude.com/docs) | Claude Code + Pi | ⚠️ API cost | If you already have it |

These are the subscriptions Mirror's authors have used. **If you don't have
either yet, start with Codex Plus.** It fully unlocks Pi (the preferred
harness) at no extra cost beyond the subscription. Claude Code Pro technically
allows Pi but charges Anthropic API rates when used through Pi. Antigravity is
Google's harness and comes with its own access; Mirror needs only the `agy`
command on your PATH.

### OpenRouter — always required

Create an account at [openrouter.ai](https://openrouter.ai), **add at least $5
in credits**, and generate an API key. This is required regardless of which
harness you use — a free account without credits will not work.

OpenRouter handles the memory infrastructure: generating embeddings, extracting
memories from conversations, and powering `/mm-consult`. Cost is pay-as-you-go;
a few cents per session. $5 will likely last months.

### Node.js 24+

Mirror Mind's core is TypeScript run directly by Node.js — no build step, and
no other language runtime to install. **Node.js 24 or newer** must be on your
`PATH`. Pi and the other harnesses are themselves Node applications, so you
likely have Node already — verify the version:

```bash
node --version   # must be v24.0.0 or newer
```

Install or upgrade from [nodejs.org](https://nodejs.org/). `runtime status`
reports the detected Node version. Currently POSIX (macOS/Linux) is the
supported platform; see [REFERENCE.md](../REFERENCE.md#platform-envelope) for
the platform envelope.

### Pi — recommended harness

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Full documentation: [Pi quick start](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#quick-start)

### Other harnesses

If you are not using Pi as your primary harness:

- [Codex](https://github.com/openai/codex)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Antigravity](https://github.com/google-antigravity/antigravity-cli)
- [Grok Build](https://x.ai/cli)

---

## 2. Install

```bash
npm install -g mirror-mind
```

That puts two commands on your `PATH`: `mirror`, the one you and your runtime
use for everything, and `mirror-hook`, which the runtimes' hooks call. There is
no clone, no build step, and nothing runs on install — installing Mirror Mind is
a file copy. Check it:

```bash
mirror
```

With no user configured yet, that prints three lines: that no user is
configured, the command to run next, and where your configuration will live.

> **Already running Mirror from a git clone?** See
> [Upgrading from a clone](#upgrading-from-a-clone) at the end of this page.
> **Working on Mirror itself?** The
> [development guide](process/development-guide.md) covers `npm link`.

---

## 3. Initialize

```bash
mirror init your-name
```

This does three things:

- creates your mirror home at `~/.mirror-minds/your-name/` and copies the
  identity templates into its `identity/` directory, with your name
  substituted — no manual editing required; the templates ship with real,
  opinionated content that works from session one;
- writes `MIRROR_USER=your-name` to your configuration file,
  `~/.config/mirror/env` (`$XDG_CONFIG_HOME/mirror/env` if you set that),
  created readable by you only;
- prints, for each runtime it finds on your `PATH`, the step that wires it to
  this install — the same steps as [section 6](#6-wire-your-runtime) below,
  with the install's path already filled in.

Your identity starts generic and sharpens through use. When something feels off,
refine it at your own pace:

```bash
mirror identity edit user identity
```

---

## 4. Configure

Open the configuration file `init` just created and add your OpenRouter key:

```text
# ~/.config/mirror/env
MIRROR_USER=your-name              # written by init; resolves to ~/.mirror-minds/<user>
OPENROUTER_API_KEY=sk-or-...       # embeddings, memory extraction, /mm-consult
```

The key is never taken from the command line, so it never lands in a shell
history. Mirror reads this file itself, on every command, from every runtime:
nothing passes a flag, and values already set in your shell take precedence over
it. The full variable reference is in the
[Configuration section of REFERENCE.md](../REFERENCE.md#configuration).

---

## 5. What Ships in Your Identity

The templates are editorial products, not fill-in forms. After `mirror init`,
your identity home contains real, usable content.

**Core identity** (used in every session):
- `self/soul.yaml` — worldview, operating principles, core role
- `ego/identity.yaml` — behavioral postures, how the mirror shows up
- `ego/behavior.yaml` — tone, intellectual method, universal constraints
- `user/identity.yaml` — your name, with room to deepen over time

**12 starter personas** — specialized lenses the mirror activates by context:

| Persona | Domain |
|---------|--------|
| `writer` | Writing, editing, voice, publishing |
| `thinker` | Ideas, decisions, conceptual clarity |
| `engineer` | Software, systems, debugging, architecture |
| `therapist` | Emotional processing, patterns, inner work |
| `strategist` | Business positioning, decisions, trade-offs |
| `coach` | Accountability, goals, habits, momentum |
| `researcher` | Inquiry, synthesis, evidence, analysis |
| `teacher` | Pedagogy, explanation, curriculum, mentoring |
| `doctor` | Health, symptoms, medical literacy |
| `financial` | Money, budgeting, investment, financial decisions |
| `designer` | Product design, UX, visual design, creative direction |
| `prompt-engineer` | Prompt design, AI system architecture, Mirror self-improvement |

**1 starter journey** — `personal-growth`, a broadly useful arc for reflection,
self-knowledge, and intentional change.

---

## 6. Wire Your Runtime

One documented step per runtime wires it to the installed package — two for
Codex and for Grok Build. `mirror init` printed these for the runtimes it found,
with `<pkg>` already filled in; `<pkg>` is `$(npm root -g)/mirror-mind`.

| Runtime | Step |
|---|---|
| **Pi** | `pi install "<pkg>"` — Pi loads the package in place, so `npm install -g` upgrades it too |
| **Claude Code** | `mkdir -p ~/.claude/skills && ln -s "<pkg>/plugins/mirror-mind" ~/.claude/skills/mirror-mind` — the plugin loads every session: its skills, its hooks, and the MCP server |
| **Codex** | 1. `codex plugin marketplace add "<pkg>"` 2. `codex plugin add mirror-mind@mirror-mind` — the package is a marketplace with one plugin, the same one Claude Code loads; at the next session Codex asks once to trust its hooks, and from then on the plugin loads every session: its skills, its hooks, and the MCP server |
| **Antigravity** | `agy plugin install "<pkg>/plugins/mirror-mind"` — one command stages the 25 skills and the plugin's agy-native layer (its rules, hooks file, and MCP entry): the skills, the Operating Instructions as rules, Mirror Mode context injected once per user turn, and each turn logged as `antigravity` from the transcript (CV21.DS7). agy has no session-end signal, so a conversation closes when your next session starts, like Codex's |
| **Grok Build** | 1. `grok plugin install "<pkg>/plugins/mirror-mind" --trust` 2. `ln -s "<pkg>/AGENTS.md" ~/.grok/rules/mirror-mind.md` — the first copies the plugin under `~/.grok/installed-plugins/` and enables it: its skills, its hooks, and the MCP server; `--trust` activates the hooks and the server, and Grok does not ask again. The second loads the Operating Instructions as a rule in every Grok session, in every project, about 2.2k tokens each (Grok shows a session-start hook's context on screen only, so the plugin cannot deliver them the way it does on Claude Code and Codex). Grok keeps a copy, so after an update `mirror runtime diagnose` names the command that brings it level — `grok plugin update` leaves a local copy as it is. If you also wired Claude Code, Grok already read the skills from that link, with no hooks; after step 1 each skill appears twice in Grok's menu, and the hooks run once (measured on grok 1.0.62, CV21.DS10.US1). The MCP server attaches to every session; Grok's model reaches its seven tools through its `search_tool` and `use_tool` meta-tools, as `mirror-mind__list_journeys`, the way Codex's does through `tool_search` (CV21.DS10.TS2) |

Each step was verified against the runtime's own documentation, or the runtime
itself where the documentation was silent; the versions and what each runtime
does with the step are in the
[runtime interface spec](product/specs/runtime-interface/index.md#installed-package-wiring).

Run the step, then re-run `mirror init your-name` any time to see it again.

---

## 7. Seed

```bash
mirror seed
```

This loads the identity YAML files from your user home into the database. The
mirror reads from the database at runtime; the YAMLs are the seed source.

If you are already inside a runtime: `/mm-seed` in Pi, `$mirror-mind:mm:seed`
in Codex, `/mirror-mind:mm:seed` in Claude Code and Antigravity.

---

## 8. Start Your First Session

Open your runtime **in any directory** — there is no project to be inside of.

### Pi (preferred)

```bash
pi
```

Then use mirror commands. Typing `/mm-` opens Pi's command menu, which lists each one
as `skill:mm-<name>`: pick it there.

```text
/mm-mirror
/mm-journeys
/mm-journey <slug>
/mm-build <slug>
/mm-consult ...
```

Pi is the preferred harness because it makes Mirror Mind effectively multi-model.

Mirror records a Pi session as it happens, in the home that session runs against. It
never imports Pi sessions afterwards: not your history from before Mirror, not
sessions you run without it, and not another home's. A skill you invoke, from the
menu or typed, is not recorded as something you said, and neither is its answer; a
question you ask with `/mm-mirror` is. An earlier version stored skills picked from
the menu as your words: `mirror conversations skill-turns` shows them and repairs them.


### Codex

```bash
codex
```

The first session after the install asks you to trust the plugin's hooks — four
of them, Mirror's — once. That dialog is expected; answer it and it does not
return until the plugin changes. A plugin's skills carry the plugin's name, as
they do in Claude Code:

```text
$mirror-mind:mm:mirror
$mirror-mind:mm:build <slug>
$mirror-mind:mm:consult ...
```

**If you wired Codex before the plugin** (a skills link, an `AGENTS.md` link,
and the wrapper script `scripts/codex-mirror.sh`, which the package no longer
ships — removed by CV21.DS4.TS5), undo those three, or every prompt carries the
skills and the Operating Instructions twice, and the old wrapper's import at
exit logs each turn a second time beside the plugin's hooks:

```bash
rm ~/.codex/skills/mirror-mind
rm ~/.codex/AGENTS.md          # or remove the Mirror section you appended
```

and start `codex` directly rather than through the wrapper your older install
carries. To take the plugin out again:
`codex plugin remove mirror-mind@mirror-mind`, then
`codex plugin marketplace remove mirror-mind`.

### Claude Code

```bash
claude
```

A plugin's skills carry the plugin's name. Type `/mm` and the menu lists them:

```text
/mirror-mind:mm:mirror
/mirror-mind:mm:journeys
/mirror-mind:mm:journey <slug>
```

(Inside a checkout of the repository, where Claude Code discovers the skills as
project resources, the same commands are `/mm:mirror`, `/mm:journeys`, and
so on.)

If your project has its own `AGENTS.md`, Claude Code reads it only when the project
has no `CLAUDE.md`; if it has one, add the line `@AGENTS.md` to it. Mirror's
instructions reach the model beside your project's either way, and nothing needs
merging. Mirror's status line is an optional step on Claude Code: see
[Mirror's status line in Claude Code](#mirrors-status-line-in-claude-code).

### Antigravity

```bash
agy
```

The plugin you installed loads with the session: its skills carry the plugin's
name, as in Claude Code —

```text
/mirror-mind:mm:mirror
/mirror-mind:mm:journeys
/mirror-mind:mm:journey <slug>
```

— the Operating Instructions arrive as the plugin's rules, and Mirror Mode
context is injected once per turn without an explicit invocation (measured on
agy 1.4.2, CV21.DS7.US4). Each turn is logged as `antigravity`; agy has no
session-end signal, so the conversation closes when your next session starts.

**If you used Gemini CLI before this version.** You did if, at an earlier
version, you linked Mirror's skills with Gemini CLI's `skills link` command
and merged four Mirror hooks into `~/.gemini/settings.json`. Mirror Mind no longer ships that integration
(retired in v0.35.0; the [release note](releases/v0.35.0.md) has the full
cutoff). Your home, memories, journeys, and logged conversations are
untouched — only the runtime changes. Install Antigravity as above, then
remove what the old wiring left behind, or Gemini CLI keeps running a hook
command that no longer exists:

- in `~/.gemini/settings.json`, delete the four entries named
  `mirror-session-start`, `mirror-log-user`, `mirror-log-assistant`, and
  `mirror-session-end` (under `SessionStart`, `BeforeAgent`, `AfterAgent`,
  and `SessionEnd`);
- in `~/.gemini/skills/`, delete the `mm-*` links the skills link created.

Mirror never wrote those files and does not edit them. If you need Gemini CLI
a while longer, `npm install -g mirror-mind@0.34.0` is the last release that
carries it; the welcome card and `runtime update` will keep offering the
newer version.

### Grok Build

```bash
grok
```

The first thing to try is the mirror itself:

```text
/mm-mirror should I raise my price?
```

Grok may ask to run `mirror mirror load`; approve it. The answer takes a while
on Grok — half a minute, sometimes more — and comes signed by a persona. The
skills carry Pi's names here, `/mm-mirror`, `/mm-build <slug>`, `/mm-journeys`
(Grok adds the plugin's name only when two skills share one). Each turn is
logged as `grok_build`; the conversation closes when you quit, and its memory is
extracted when your next session starts, on any runtime. Mirror's MCP tools are
there too: the model finds them with `search_tool` and calls them through
`use_tool`, as `mirror-mind__list_journeys`.

**What Grok does not do:** nothing is added to the model's context on each turn.
Mirror Mode lasts as long as the skill's own instructions do, and the next
`/mm-mirror` brings it back.

Why: Grok shows a hook's session-start message on screen and discards what a
hook offers per turn. That is why the Operating Instructions arrive through the
rule you linked in step 2 — Grok loads it in every session, in every project,
about 2.2k tokens each — rather than through the plugin's hooks as on Claude
Code and Codex.

### How the mirror reaches each runtime

Every session needs two things from the package: the skills, which the wiring
step above provides, and Mirror's **Operating Instructions** — the four modes,
the persona signature, the Builder boundary — without which a session answers
`/mm-mirror` but does not behave as a mirror. The instructions ship in the
package as `AGENTS.md`, and each runtime receives them its own way: Pi through
the extension, Claude Code and Codex through the plugin's session-start hook
(Codex as a developer message), Antigravity as the plugin's rules, Grok Build as
the rule you linked in step 2. None of this needs a step beyond the wiring above.
Extensions you install later reach each runtime through a plugin of their own; see
[Your extensions reach each runtime](#your-extensions-reach-each-runtime).

What each runtime gives you, as measured:

| Runtime | What you get | Measured on |
|---------|--------------|-------------|
| Pi | the skills from the menu, the Operating Instructions in every session, Mirror Mode when you ask for it (`/mm-mirror`): the model loads Mirror's context itself, your turns and replies remembered | Pi 1.4.0, 2026-10-22 |
| Claude Code | the skills, the Operating Instructions in every session, Mirror's context handed to the model by the plugin when you enter Mirror Mode, your turns and replies remembered, Mirror's tools for the model | Claude Code 2.1.296, 2026-10-13 |
| Codex | the same as Claude Code; a session is remembered once Codex closes it, about 30 minutes after you quit | Codex 0.163.0, 2026-10-17 |
| Antigravity | the skills, the Operating Instructions as the plugin's rules, Mirror's context handed to the model on every turn from the start of a session, your turns and replies remembered, Mirror's tools | agy 1.4.2, 2026-10-18 |
| Grok Build | the skills, the Operating Instructions from the rule you linked, Mirror Mode when you ask for it (`/mm-mirror`): the model loads Mirror's context itself, with no automatic context per turn, your turns and replies remembered, Mirror's tools | Grok Build 1.0.62, 2026-10-18 |

Each runtime was measured on the version named; a newer version has not been
re-measured, and `mirror runtime diagnose` reports wiring that has fallen behind or
broken. The full [parity matrix](product/specs/runtime-interface/index.md#parity-matrix),
with levels, binaries, and the record behind each row, is in the runtime interface
contract.

**If a runtime is launched from your desktop rather than a terminal**, it may not
inherit the `PATH` that holds `node` and `mirror`, and its hooks will skip
logging rather than fail your turn. Each skip writes one line to
`~/.mirror-minds/your-name/hooks.log`, and `mirror runtime diagnose` reports
them by count. Set `MIRROR_NODE=/path/to/node` (Node 24 or later) and, for the
plugin on Claude Code or Codex, `MIRROR_BIN` to the directory holding `mirror-hook`, in
the environment the runtime starts with
([troubleshooting](process/troubleshooting.md)).

---

## 9. Verify

Confirm the onboarding flow worked end to end:

```bash
mirror list personas --verbose
mirror list journeys
mirror detect-persona "I want help writing an article"
mirror detect-persona "help me think through this idea"
mirror detect-persona "debug this Python issue"
mirror inspect persona writer
```

What to check:
- `list personas --verbose` shows 12 seeded personas with routing keywords
- `list journeys` shows `personal-growth`
- `detect-persona` returns sensible matches for natural-language queries
- `inspect persona writer` shows the persona metadata stored in the database

### Success checklist

- `~/.mirror-minds/your-name/identity/` exists with your name substituted in templates
- `mirror seed` completes without errors
- 12 personas appear in `mirror list personas --verbose`
- `personal-growth` appears in `mirror list journeys`
- persona routing responds sensibly to `mirror detect-persona "..."`
- your chosen runtime (Pi, Claude Code, Codex, or Antigravity) answers `/mm-journeys`
  from the installed package, and `mirror runtime status` reports
  `Install: package (mirror-mind@<version>)`

---

## 10. What's Next

> Your first session will use a generic identity — that is expected and
> correct. The mirror sharpens through use.

- **How memories form:** the mirror distills a conversation into memories only
  when it has a **journey set** and runs at least four messages. This is
  deliberate — casual, unscoped chatter stays out of your durable memory, and
  nothing is mined from a conversation you never anchored. If a session felt
  substantive but produced no memories, the usual cause is a missing journey,
  not a bug: anchor the work to a journey (for example, activate Builder Mode
  with `/mm-build <slug>`) and the conversation becomes eligible.
- **Operating modes:** Mirror Mind activates four context-driven modes — Mirror
  (reflection), Builder (construction), Explorer (the uncertain middle before you
  commit), and Soul (inner-life listening). You do not pick them manually; they
  activate from what you ask.
- **Commands:** [REFERENCE.md](../REFERENCE.md) — full command reference with arguments and flags
- **Architecture:** [docs/product/architecture.md](product/architecture.md) — how the system works internally
- **Extensions:** [docs/product/extensions/](product/extensions/index.md) — Mirror Mind can be
  extended with user-specific capabilities

### Your extensions reach each runtime

An extension you install with `mirror extensions install` reaches Pi through your
home's catalog, and Claude Code, Codex, Antigravity, and Grok Build through one plugin
of your own, `mirror-ext-your-name`, which the install regenerates. For each runtime
that has not taken that plugin yet, the install prints the one step that wires it: run
it once. Then the reference extension `review-copy` is `/ext-review-copy` on Pi, Claude
Code, and Grok Build, `$mirror-ext-your-name:ext-review-copy` on Codex, and
`/mirror-ext-your-name:ext-review-copy` on Antigravity. Not listed? Run the step the
install printed; running the install again prints it again. Codex, Antigravity, and
Grok Build keep a copy of the plugin, so after you change an extension, `mirror runtime
diagnose` names the reinstall each still needs. The
[extension docs](product/extensions/index.md#reaching-each-runtime) have the rest.

### Mirror's status line in Claude Code

Pi shows Mirror's status line by itself. Claude Code can show it too, but a plugin
cannot add one, so it is a step you take once, if you want it: add `statusLine` to
`~/.claude/settings.json`, beside what is already there.

```json
{
  "statusLine": {
    "type": "command",
    "command": "mirror welcome --status-line --session-id $CLAUDE_CODE_SESSION_ID"
  }
}
```

Each session then shows its own line, such as
`◇ your-name · Personal Growth on ■ Builder Mode · ✓`: your Mirror home, the journey,
and the session's own mode. The journey shown beside Mirror Mode is the last one any
session chose. Claude Code runs the command when the conversation changes, and each
run starts one `mirror` process: 0.3 to 1.5 seconds on the machine it was measured
on. If you start Claude Code from your desktop rather than a terminal, it may not find
`mirror` or `node`; then begin the command with their full paths, as
`command -v node` and `command -v mirror` print them. Measured on Claude Code 2.1.310,
2026-10-24.

## Upgrading from a clone

Until this release, Mirror Mind ran from a git clone and every skill invoked the
front door by its path inside that clone. The skills now say `mirror`, and
nothing provides that name until you do — once:

Node.js 24 or newer is required, and was not before: check `node --version`.

```bash
cd <your clone>
git pull                 # or: the previous release's runtime update, which completes
npm ci
npm link                 # puts `mirror` and `mirror-hook` on your PATH from this tree
mirror runtime migrate   # applies the pending migration, snapshot first
mirror runtime status
```

`runtime status` should report `Install: clone (<your clone>)` and `Status:
ready`. Your `.env` stays where it is and keeps working: a clone reads its own
`.env` first, then `~/.config/mirror/env`. Your mirror home and database are
untouched; `runtime migrate`, or the first ordinary command that opens the
database, applies any pending migration, backup first (`runtime status` only
reports it).

Three things to know:

- **If you updated with the previous release's `runtime update`**, it completes
  and reports success, and shows this release's summary; it knows nothing of
  the lines above. Run them; from then on `mirror runtime update` is the Node
  one. The old interpreter form of the command now fails with
  `No module named memory.__main__`.
- **`rm -rf src .venv` at the clone root** removes the Python residue: nothing
  tracked lives under `src/` any more, and `uv` can go with it.
- **You can move to the npm package instead** of keeping the clone:
  `npm install -g mirror-mind`, then `mirror init <your-name>` writes your user
  to `~/.config/mirror/env`, where you add the same `OPENROUTER_API_KEY` your
  `.env` holds. Your existing home is found by the same name; nothing is
  copied or re-seeded. Then pick one: a checkout opened in Pi and a personal Pi
  package both provide the extension, and there is no reason to keep both.

---

**See also:** [Briefing](project/briefing.md) · [REFERENCE.md](../REFERENCE.md)
