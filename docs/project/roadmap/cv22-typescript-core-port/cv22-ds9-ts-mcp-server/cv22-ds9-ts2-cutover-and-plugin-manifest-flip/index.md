[< Parent](../index.md)

# CV22.DS9.TS2 — Cutover and plugin manifest flip

**Status:** 🟡 Planned — Plan drafted and panel-reviewed 2026-09-18, pending Navigator approval and **D1**
**Type:** Technical Story
**Depends on:** CV22.DS9.US1 (protocol, `serve.ts`, threat model); CV22.DS9.US2 (the seven
tools, D12's read-only open, `mcp_two_engine_diff.sh`, `mcp_real_copy_probe.sh`); CV21.E2
(the plugin manifest and its generator, `src/memory/plugins/claude.py`)

---

## Outcome

The plugin manifest launches the TypeScript MCP server through a launcher the user can
revert with `MIRROR_TS_MCP=0` — from the environment or from `.env` — without editing an
installed plugin. Before the flip, the server opens its database the way Python does:
migrate-on-open, and one `llm_calls` row per agent-initiated search, written through a
connection that can run nothing but that insert while the tools keep a driver-level
read-only handle. TS1's wallet guard is unblocked because the spend it counts now exists.

## Story Statement

As the owner of a mirror that an MCP client can query,
I want the manifest's server to be the TypeScript one, revertible the way every other
ported family is, and accountable for what it spends,
so that DS10 can delete `src/memory/mcp/` without a runtime integration silently
depending on it, and TS1 can guard a ledger that is actually written.

## Acceptance Behavior

```text
Given the plugin manifest as CV21 generates it and a database copy
When  an MCP client spawns the manifest's command from any cwd
Then  the TypeScript server answers, initialize reports the pyproject version,
      and every response on the recorded transcript is byte-identical to the
      Python baseline (within US2 D10's score tolerance)
And   with MIRROR_TS_MCP=0 — in the environment or in .env — the same command
      answers from the Python server
And   a query search through TS writes exactly one llm_calls row and no other
      row, while the tools' handle still cannot write at all
And   a pending TS-authored migration is applied at launch, once, with a
      backup, and a current database launches with empty stderr
And   src/memory/mcp/, the oracle baseline, and every sibling story are untouched
```

## Scope

- `ts/src/db/database.ts` — a seam open that returns a handle able to prepare only
  `INSERT INTO llm_calls`; the DS4 gate's non-applicability to it written down.
- `ts/src/search/memorySearch.ts` — `recordEmbeddingLedger` widened to accept a sink.
- `ts/src/mcp/main.ts` — migrate-on-open, read-only tools handle, lazy ledger sink,
  `pyproject.toml` version fallback.
- `plugins/mirror-mind/mcp/launch.sh` — the D5 bridge as a bash `exec` launcher.
- `src/memory/plugins/claude.py` — `build_manifest()` points at the launcher; manifest
  regenerated; drift guard updated.
- `scripts/mcp_two_engine_diff.sh`, `scripts/mcp_real_copy_probe.sh` — a `--launcher`
  mode; the probe adds the single-ledger-row assertion.
- Docs: `configuration.md` gate row and prerequisites, `decisions.md`, CV21.E2 inbound
  note, US1 threat-model amendment.

## Out Of Scope

- Argument validation, caps, wallet guard, refusal wording (TS1).
- Any change to `src/memory/mcp/` or the Python open; any oracle re-baseline.
- Plugin structure, versioning, propagation to other runtimes (CV21); the installed-
  `memory` contract, which this story observes as unmet and records as CV21 debt.
- npm entry point, `package.json` versioning, deletion of the Python server (DS10).

## Validation

Four steps, in [plan.md](plan.md) and [test-guide.md](test-guide.md): the two-engine diff
through the launcher on both branches; the real-copy probe through the launcher with the
one-ledger-row assertion; the launcher from a non-repo cwd with process-level proof of the
engine; one Claude session plus one control session. E2E is required — the session is it.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
