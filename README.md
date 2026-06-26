# Mirror Mind

![A person reviews a blueprint with one lead contractor while a coordinated specialist team builds different parts of a house behind them, representing Mirror Mind as one unified AI interface with many expert lenses.](docs/assets/mirror-mind-contractor-team-1200px.jpg)

Imagine hiring a contractor to build a house. A good contractor doesn't show up
alone — they bring a team: the architect, the structural engineer, the
electrician, the plumber, the finish carpenter. Each one is exceptional in their
domain. They've worked together before. They hand off cleanly. You talk to one
person; the coordination is their problem, not yours.

Mirror Mind gives you that team for knowledge work. A strategist for business
decisions. An engineer for code. A therapist for the tensions underneath the
surface. A writer for the moments when voice matters. A researcher when you need
to go deep. Each activated by context, each exceptional in their domain, all
speaking with one unified voice — because they're all expressions of the same
intelligence: yours.

The AI tools most people use today are the equivalent of hiring contractors one
at a time, separately, with no shared context. Each one starts cold. They don't
know what the others decided. They don't know your constraints, your past
decisions, your current stage. You are the coordinator — doing the integration
work that should not be yours to do.

Mirror Mind changes this. Your team is briefed on your projects. They know where
you are in each one, what's been decided, what's unresolved. The second session
is faster than the first. The tenth is faster still. They don't start from zero
— because they were there.

---

![Before and after illustration: a person faces an opaque AI mirror that cannot reflect them, then a polished Mirror Mind reflection that carries their identity, memory, projects, and preferences.](docs/assets/mirror-mind-before-after-cartoon-600px.jpg)

But what makes this team exceptional is not just coordination. It's that they
know *you*.

Every time you open a new AI session, you re-explain yourself. You re-establish
your context. You repeat your values, your constraints, your situation — again.
And the AI, no matter how capable, responds as if it's meeting you for the first
time. The advice it gives could fit anyone. It doesn't know that you made that
decision three months ago and why. It doesn't know what you're navigating right
now, what tensions are unresolved, what you committed to last week. It answers in
a vacuum. That's not a team. That's a very smart set of strangers.

Mirror Mind accumulates. Every conversation is analyzed and the signal is
extracted: decisions, insights, commitments, patterns. The intelligence compounds.
Your team doesn't just know your projects — they know your voice, your values,
your recurring tensions, the way you think. The strategist gives you advice
calibrated to your risk profile. The therapist surfaces the tension you circled
around three sessions ago. The engineer remembers why you made the architectural
call that shaped everything downstream.

That's what the mirror is: a conscious, accumulative reflection of your own
intelligence — sharpened by every conversation, carried across time. The
contractor metaphor explains how you interact with it. The mirror explains why
it works.

This is not a chatbot with memory. This is a mirror — and yours.

---

## How It Works

Local-first. SQLite. Four supported runtimes: Pi, Gemini CLI, Codex, Claude
Code. One Python core. Jungian architecture: Self, Ego, Personas, Shadow.
Context-activated modes — Mirror, Builder, Explorer, and Soul — plus an optional
local web console for browsing your identity, journeys, and conversations. The
identity lives in your machine, not a server.

→ Get started in ten minutes: [Getting Started](docs/getting-started.md)  
→ Full command reference: [REFERENCE.md](REFERENCE.md)

---

## Prerequisites

- [uv](https://docs.astral.sh/uv/getting-started/installation/) — package
  manager (handles Python 3.10+)
- [OpenRouter](https://openrouter.ai) account with at least $5 in credits —
  embeddings, memory extraction, and multi-LLM
- An AI runtime subscription:
  [Codex Plus](https://openai.com/codex/) (recommended),
  [Claude Code Pro](https://code.claude.com/docs), or
  [Gemini AI Pro](https://geminicli.com/)
- [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent)
  — recommended harness (multi-model, not locked to one provider)

---

## Documentation

- [Getting Started](docs/getting-started.md) — step-by-step onboarding for new users
- [REFERENCE.md](REFERENCE.md) — command reference and configuration
- [Architecture](docs/product/architecture.md) — system design, layers, and data model
- [Python API](docs/product/api.md) — programmatic interface for developers
- [Project Briefing](docs/project/briefing.md) — foundational architectural decisions
- [Decisions](docs/project/decisions.md) — incremental decision log
- [Roadmap](docs/project/roadmap/index.md) — current and planned capability values
- [Development Guide](docs/process/development-guide.md) — how to work on this codebase

---

## Origins and Credits

Mirror Mind began as [Alisson Vale](https://github.com/alissonvale/)'s original
`mirror-mind` — a Portuguese-language,
Claude Code-only implementation built around his own identity and circumstances.
He created the concept and the Jungian architecture.

[Vinícius Teles](https://github.com/viniciusteles) extended that foundation into
this repository, turning a personal experiment into a reusable framework:

- **English** — full migration from Portuguese across code, CLI, schema, identity, and docs
- **Framework/user separation** — user identity and memory live privately under `~/.mirror/<user>/`, outside the repository
- **Multi-runtime** — from Claude Code only to four runtimes: Pi, Gemini CLI, Codex, and Claude Code
- **Multi-user** — independent mirrors for multiple users on the same machine
- **Multi-session** — concurrent sessions tracked safely in a database-backed session registry
- **Intelligence depth** — hybrid semantic and lexical search, honest reinforcement, two-pass extraction, memory consolidation, and shadow cultivation
- **Extension system** — a stable contract for adding user-specific capabilities outside the core; extensions own their own SQLite tables, CLI subcommands, and Mirror Mode context providers without touching the framework

The move toward Pi as the preferred runtime was inspired by
[Henrique Bastos](https://github.com/henriquebastos) and his early work in
[henriquebastos/mirror-mind](https://github.com/henriquebastos/mirror-mind),
which showed a strong path toward a more model-flexible runtime.

---

## License

MIT
