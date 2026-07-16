[< Parent](../index.md)

# CV22.DS5.US4 — Front-Door External-API Routing And Dogfood

**Status:** ✅ Done
**Type:** User Story

---

## User Story

As a Pi/Mirror user,
I want validated external-API command families to route through the TS front door,
So that daily dogfooding exercises the port without exposing unported or unsafe paths.

## Outcome

The TS front door selectively routes the DS5-validated external API surfaces under explicit replay-safe gates while preserving Python fallback for every unported, unsafe, or configuration-missing path.

## Scope

- Route `memories --search <query>` through TS only when external routing is explicitly enabled and a replay embedding fixture is configured.
- Route `consult credits` through TS only when external routing is explicitly enabled and a replay credits fixture is configured.
- Route `consult <family> [tier] <question>` through TS only when external routing is explicitly enabled and replay LLM plus credits fixtures are configured.
- Preserve Python fallback for extraction lifecycle commands, unknown commands, missing replay/live config, missing DB/bootstrap behavior, and schema-drift cases.
- Keep front-door logs metadata-only: command, route, exit code, and safe detail category only.
- Dogfood with replay fixtures and copy/demo DBs so CI does not require live provider credentials, network, or real API calls.

## Out Of Scope

- Live OpenRouter transport cutover.
- Routing conversation extraction lifecycle front-door commands.
- Removing Python fallback.
- DS6 MCP/npm convergence.

## Validation

- TypeScript typecheck, lint, full test suite, focused front-door/consult/search/provider tests, and whitespace checks.
- Replay/copy-safe dogfood of the routed surfaces.
- Secret/prompt/context grep inspection to ensure no real credentials, private prompts, provider payloads, or production DB artifacts are committed.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
