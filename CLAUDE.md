# Mirror Mind — Session Context

@AGENTS.md

---

## Project Context — Mirror Mind Codebase

Applies to Builder Mode sessions on this repository.

Mirror Mind is a local-first memory and identity framework for agentic AI
runtimes. One TypeScript core (`ts/`, run directly by Node.js 24+), multiple
runtime harnesses (Pi, Gemini CLI, Codex, Claude Code), SQLite database, Jungian
identity architecture.

**Live state (version and roadmap status) is not duplicated here** — it
drifts. Read it from the source of truth:

- Version: `package.json` (repository root)
- CV/Epic/Story status: [docs/project/roadmap/index.md](docs/project/roadmap/index.md)

Builder Mode load also injects the live, database-backed journey status at
session start.

**Key references:**
- Architecture: [docs/product/architecture.md](docs/product/architecture.md)
- Development guide: [docs/process/development-guide.md](docs/process/development-guide.md)
- Engineering principles: [docs/process/engineering-principles.md](docs/process/engineering-principles.md)
- Roadmap: [docs/project/roadmap/index.md](docs/project/roadmap/index.md)
- Decisions: [docs/project/decisions.md](docs/project/decisions.md)

**Developer conventions:**
- Run tests and checks from `ts/` with npm: `npm test`, `npm run typecheck`,
  `npm run lint`. CI runs more than these; the full pre-push set is in the
  development guide
- TDD for behavior changes
- CI must be green before a story is marked done
- After every push, verify GitHub Actions with `gh`

For Portuguese-era legacy migration: see `REFERENCE.md#legacy-migration-workflow`.
