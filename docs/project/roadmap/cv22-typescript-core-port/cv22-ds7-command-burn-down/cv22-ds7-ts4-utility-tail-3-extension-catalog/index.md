[< Parent](../index.md)

# CV22.DS7.TS4 — Ops/utility tail 3: extension catalog

**Status:** ✅ Done — flipped 2026-09-16 after Navigator validation on the real home (read diff, the dispatch through the compat host with a leaf-only log line, and `identity edit` through the Navigator's own editor), accepted the same day. All 17 leaves answer from TypeScript by default: `extensions` ×7, `ext` ×5 including the dynamic `<id> <subcommand>`, `list extensions|all`, `inspect extension|runtime-catalog|llm-calls|embedding-provenance`, `identity edit`, and the two ES-001 write faces. Three independent reverts (`MIRROR_TS_EXTENSIONS=0`, `MIRROR_TS_IDENTITY_EDIT=0`, `MIRROR_TS_CONVERSATIONS_LIFECYCLE=0`). Debt deferred with a revisit trigger; evidence in [validation.md](validation.md) and [test-guide.md](test-guide.md); history in [handoff.md](handoff.md)
**Type:** Technical Story

---

## Outcome

Every deterministic Python command branch still listed as TS-owned in the
[burn-down ledger](../burn-down-ledger.md#remainder) answers from TypeScript:
`extensions` (7 leaves), `ext` (7, including `ext <id> <extension-subcommand>`),
`list extensions|all`, `inspect extension|runtime-catalog|llm-calls|embedding-provenance`,
`identity edit`, and the two ES-001 metadata-lifecycle write faces. After this
story the "Unported — deterministic" table holds only DS10's retirements.

## Story Statement

In order to reach zero deterministic Python commands before DS9 and DS10,
As the single owner of the CV22 migration,
I want the extension catalog, the ledger introspection reads, the editor seam,
and the metadata-lifecycle writes ported and flipped with per-family reverts,
So that Python retirement is gated only by DS10's own scope.

## The decision this story carries

`ext <id> <extension-subcommand>` dispatches into a handler the extension
registered in Python (`api.register_cli`); all seven installed extensions on
the validated home have them. The [Plan](plan.md#decisions-taken-at-plan-time)
chose TS2's shape — a TS dispatcher, a declared `mirror-cli-v1` manifest contract
executed directly when declared, and a `cli` mode of the existing temporary
compat host for everything else, under DS10's existing deletion gate.
Decided by the Navigator at Plan approval on 2026-09-16 and recorded in
[Decisions](../../../../decisions.md#extension-commands-reach-typescript-through-a-declared-contract-with-one-temporary-python-host).

## Acceptance Behavior

```text
Given a home with installed extensions, bindings, and a populated ledger
When every leaf in the inventory runs on both engines
Then reads agree byte for byte, writes agree on files and rows,
  ext <id> <subcommand> reaches the handler with argv intact and its exit code,
  and --help on any ext verb executes nothing
And each family's revert variable sends it back to Python with identical output
And front-door.log carries leaf names only, never an extension argument
```

## Scope

- Catalog reads, ledger reads, bindings and the migration runner's write
  half, catalog writes, the dispatch, `identity edit`, the ES-001 write
  faces, and the front door with three gates — see the Plan's Scope A–H.

## Out Of Scope

- Extension platform redesign, rewriting installed extensions, changing usage
  strings or surfaces, dropping extension tables on uninstall, DS10's
  `runtime`/`migrate-legacy`/`journey-projection`, and a post-retirement
  entry point for extension-authored skills (a DS10 plan input).

## Validation

- Goldens under the determinism gate, four write probes, a both-engine
  catalog smoke, redaction with extension argv sentinels, and a seven-step
  Navigator route on the real home — see the [Test Guide](test-guide.md).

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Review](review.md)
- [Coherence](coherence.md)
- [Done](done.md)
- [Handoff](handoff.md)
