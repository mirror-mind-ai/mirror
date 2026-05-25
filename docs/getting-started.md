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

### uv

```bash
# macOS and Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Windows: [https://docs.astral.sh/uv/getting-started/installation/](https://docs.astral.sh/uv/getting-started/installation/)

Python 3.10+ is handled by uv automatically — no separate Python install needed.

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
git clone https://github.com/viniciusteles/mirror.git
cd mirror
uv sync
```

`uv sync` creates a `.venv`, installs the exact dependency versions from
`uv.lock`, and installs the `memory` package in editable mode.

---

## 3. Configure

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```
MIRROR_USER=your-name              # resolves to ~/.mirror-minds/<user>
OPENROUTER_API_KEY=sk-or-...       # embeddings, memory extraction, /mm-consult
```

One of `MIRROR_USER` or `MIRROR_HOME` must be set. For the full variable
reference, see `.env.example.advanced` or the [Configuration section of
REFERENCE.md](../REFERENCE.md#configuration).

---

## 4. Initialize

```bash
uv run python -m memory init your-name
```

This copies the identity templates into `~/.mirror-minds/your-name/identity/` and
substitutes your name into the template files automatically. No manual editing
required — the templates ship with real, opinionated content that works from
session one.

Your identity starts generic and sharpens through use. When something feels off,
refine it at your own pace:

```bash
uv run python -m memory identity edit user identity
```

---

## 5. What Ships in Your Identity

The templates are editorial products, not fill-in forms. After `memory init`,
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

## 6. Seed

```bash
uv run python -m memory seed
```

This loads the identity YAML files from your user home into the database. The
mirror reads from the database at runtime; the YAMLs are the seed source.

If you are already inside a runtime:
- Pi: `/mm-seed`
- Gemini CLI: `/mm-seed`
- Codex: `$mm-seed`
- Claude Code: `/mm:seed`

---

## 7. Start Your First Session

### Pi (preferred)

Open Pi in this project directory:

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

Skills are discovered automatically from `.agents/skills/`. Mirror Mode context
is injected per-turn via the `BeforeAgent` hook — no explicit invocation needed.
Use the same `/mm-*` commands as Pi.

### Codex

```bash
./scripts/codex-mirror.sh
```

The wrapper script handles session start, JSONL backfill, and session end.
Skills are discovered from `.agents/skills/`. Use `$mm-*` syntax:

```text
$mm-mirror
$mm-build <slug>
$mm-consult ...
```

### Claude Code

```bash
claude
```

Use `/mm:` prefix:

```text
/mm:mirror
/mm:journeys
/mm:journey <slug>
```

Claude Code is fully supported but is now the secondary runtime rather than the primary one.

---

## 8. Verify

Confirm the onboarding flow worked end to end:

```bash
uv run python -m memory list personas --verbose
uv run python -m memory list journeys
uv run python -m memory detect-persona "I want help writing an article"
uv run python -m memory detect-persona "help me think through this idea"
uv run python -m memory detect-persona "debug this Python issue"
uv run python -m memory inspect persona writer
```

What to check:
- `list personas --verbose` shows 12 seeded personas with routing keywords
- `list journeys` shows `personal-growth`
- `detect-persona` returns sensible matches for natural-language queries
- `inspect persona writer` shows the persona metadata stored in the database

### Success checklist

- `~/.mirror-minds/your-name/identity/` exists with your name substituted in templates
- `uv run python -m memory seed` completes without errors
- 12 personas appear in `uv run python -m memory list personas --verbose`
- `personal-growth` appears in `uv run python -m memory list journeys`
- persona routing responds sensibly to `uv run python -m memory detect-persona "..."`
- your chosen runtime (Pi, Gemini CLI, Codex, or Claude Code) can use the seeded database

---

## 9. What's Next

> Your first session will use a generic identity — that is expected and
> correct. The mirror sharpens through use.

- **Commands:** [REFERENCE.md](../REFERENCE.md) — full command reference with arguments and flags
- **Architecture:** [docs/product/architecture.md](product/architecture.md) — how the system works internally
- **Extensions:** [docs/product/extensions/](product/extensions/index.md) — Mirror Mind can be
  extended with user-specific capabilities

---

**See also:** [Briefing](project/briefing.md) · [REFERENCE.md](../REFERENCE.md)
