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
| [Gemini AI Pro](https://geminicli.com/) | Gemini CLI | ❌ | Only if already subscribed |

**If you don't have any of these yet, start with Codex Plus.** It fully unlocks
Pi (the preferred harness) at no extra cost beyond the subscription. Claude Code
Pro technically allows Pi but charges Anthropic API rates when used through Pi.
Gemini AI Pro only unlocks the Gemini CLI harness.

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
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)

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
Gemini CLI and Codex. `mirror init` printed these for the runtimes it found,
with `<pkg>` already filled in; `<pkg>` is `$(npm root -g)/mirror-mind`.

| Runtime | Step |
|---|---|
| **Pi** | `pi install "<pkg>"` — Pi loads the package in place, so `npm install -g` upgrades it too |
| **Claude Code** | `ln -s "<pkg>/plugins/mirror-mind" ~/.claude/skills/mirror-mind` — the plugin loads every session: its skills, its hooks, and the MCP server |
| **Gemini CLI** | 1. `gemini skills link --consent "<pkg>/.pi/skills"` 2. merge the four hooks `init` printed into `~/.gemini/settings.json` |
| **Codex** | 1. `ln -s "<pkg>/.pi/skills" ~/.codex/skills/mirror-mind` 2. link or append `<pkg>/AGENTS.md` to `~/.codex/AGENTS.md`, then start Codex through `<pkg>/scripts/codex-mirror.sh` |

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

If you are already inside a runtime: `/mm-seed` in Pi and Gemini CLI,
`$mm-seed` in Codex, `/mirror-mind:mm:seed` in Claude Code.

---

## 8. Start Your First Session

Open your runtime **in any directory** — there is no project to be inside of.

### Pi (preferred)

```bash
pi
```

Then use mirror commands:

```text
/mm-mirror
/mm-journeys
/mm-journey <slug>
/mm-build <slug>
/mm-consult ...
```

Pi is the preferred harness because it makes Mirror Mind effectively multi-model.

### Gemini CLI

```bash
gemini
```

The skills you linked are discovered automatically. Mirror Mode context is
injected per turn by the hooks you registered — no explicit invocation needed.
Use the same `/mm-*` commands as Pi.

### Codex

```bash
"$(npm root -g)/mirror-mind/scripts/codex-mirror.sh"
```

The wrapper script handles session start, JSONL backfill, and session end. Use
`$mm-*` syntax:

```text
$mm-mirror
$mm-build <slug>
$mm-consult ...
```

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

### How the mirror reaches each runtime

Every session needs two things from the package: the skills, which the wiring
step above provides, and Mirror's **Operating Instructions** — the four modes,
the persona signature, the Builder boundary — without which a session answers
`/mm-mirror` but does not behave as a mirror. The instructions ship in the
package as `AGENTS.md`, and each runtime receives them its own way: Pi through
the extension, Claude Code and Gemini CLI through their session-start hook,
Codex through `~/.codex/AGENTS.md`. None of this needs a step beyond the
wiring above.

**If a runtime is launched from your desktop rather than a terminal**, it may not
inherit the `PATH` that holds `node` and `mirror`, and its hooks will skip
logging rather than fail your turn. Each skip writes one line to
`~/.mirror-minds/your-name/hooks.log`, and `mirror runtime diagnose` reports
them by count. Set `MIRROR_NODE=/path/to/node` (Node 24 or later) and, for the
Claude Code plugin, `MIRROR_BIN` to the directory holding `mirror-hook`, in
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
- your chosen runtime (Pi, Gemini CLI, Codex, or Claude Code) answers `/mm-journeys`
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

## Upgrading from a clone

Until this release, Mirror Mind ran from a git clone and every skill invoked the
front door by its path inside that clone. The skills now say `mirror`, and
nothing provides that name until you do — once:

```bash
cd <your clone>
git pull            # or: mirror runtime update, from the next time on
npm ci
npm link            # puts `mirror` and `mirror-hook` on your PATH from this tree
mirror runtime status
```

`runtime status` should report `Install: clone (<your clone>)`. Your `.env`
stays where it is and keeps working: a clone reads its own `.env` first, then
`~/.config/mirror/env`. Your mirror home and database are untouched; the first
command to open the database applies any pending migration, backup first.

Two things to know:

- **If you updated with the previous release's `runtime update`**, its
  post-update check fails: it runs the Python engine, and the tree it just
  fast-forwarded to has none. The update itself completed. Run the lines above;
  from then on `mirror runtime update` is the Node one.
- **You can move to the npm package instead** of keeping the clone:
  `npm install -g mirror-mind`, then `mirror init <your-name>` writes your user
  to `~/.config/mirror/env`, where you add the same `OPENROUTER_API_KEY` your
  `.env` holds. Your existing home is found by the same name; nothing is
  copied or re-seeded. Then pick one: a checkout opened in Pi and a personal Pi
  package both provide the extension, and there is no reason to keep both.

---

**See also:** [Briefing](project/briefing.md) · [REFERENCE.md](../REFERENCE.md)
