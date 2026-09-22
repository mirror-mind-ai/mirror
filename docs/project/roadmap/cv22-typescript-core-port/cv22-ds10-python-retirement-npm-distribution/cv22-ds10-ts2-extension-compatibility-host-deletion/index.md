[< Parent](../index.md)

# CV22.DS10.TS2 — Extension compatibility-host deletion

**Status:** ✅ **Done — 2026-09-21.** The Navigator chose **option 3** (migrate what is
in daily use, retire the rest): google-workspace, session-export, and persona-export
migrated; google-ads and meta-ads retired under the cutoff. See [plan.md](plan.md) for
the approved plan, its panel review, and the two corpus dispositions
**Type:** Technical Story
**Depends on:** CV22.DS7.TS2 (the `mirror-context-v1` protocol and the host itself);
CV22.DS7.TS4 (the host's `cli` mode, Navigator decision D1, 2026-09-16)

---

## Outcome

The Mirror core stops owning a Python bridge for extensions. `memory.extensions.compat_host`
and every TypeScript launcher branch that invokes it are deleted; capabilities without a
declared runtime fail explicitly and fail-soft rather than silently losing context; the
migration cutoff is documented; and a repository check proves every retained extension
context provider and command enters through a declared language-neutral runtime.

This gate does not require extension authors to use JavaScript. Extensions may own any
executable runtime — **including Python**. What ends is the *core* owning Python as their
permanent compatibility layer.

## The Decision This Story Was Waiting On (answered 2026-09-21: option 3)

TS1 and US1 deleted subsystems with no consumers. **This one has seven**, and they are
the Navigator's daily tooling. Inventory taken 2026-09-21 against
`~/.mirror-minds/vinicius-ts/extensions/`:

| Extension | Context providers | CLI subcommands | Declares a runtime? |
|---|---|---|---|
| google-ads | 1 (`campaign_status`) | 4 | **no** |
| meta-ads | 1 (`campaign_status`) | 4 | **no** |
| google-workspace | — | 3 | **no** |
| persona-export | — | 2 | **no** |
| session-export | — | 2 | **no** |
| plan-and-review | — | — | n/a |
| video-explainer | — | — | n/a |

**Seventeen capabilities, zero declarations.** Every one reaches the compat host today.
Deleting the host without migration means each refuses until its extension declares a
runtime.

Three ways to cut it:

1. **Delete now; unmigrated capabilities fail explicitly.** Exactly what this gate's items
   3 and 4 describe — a documented cutoff plus fail-explicit, fail-soft behavior. Smallest
   story, stays inside this repository, unblocks TS5 immediately. Cost: the Ads, Workspace,
   export, and review commands refuse until migrated, on the Navigator's own schedule.
2. **Migrate first, then delete.** Nothing breaks, but TS2 grows a prerequisite in seven
   source trees outside this repository and DS10 stalls behind work elsewhere.
3. **Migrate what is in daily use, retire the rest with the cutoff.** Needs the Navigator
   to say which are which.

The Driver's recommendation at Pull was **1**: the core's job is to stop owning the bridge,
and a capability that refuses with a message naming the fix is honest, where a core
carrying a Python host indefinitely is the thing DS10 exists to end. It is recorded as a
recommendation, not a decision — option 1 breaks working tools the day it lands, which is
the Navigator's call to make.

**The Navigator chose option 3 on 2026-09-21.** Migrated: google-workspace (5 subcommands),
session-export (2), persona-export (2). Retired under the cutoff: google-ads (1 provider +
4 subcommands), meta-ads (1 provider + 4 subcommands), which stay installed and refuse.

Two facts found while executing it, neither visible at Pull:

- **The inventory undercounted google-workspace.** It registered **five** subcommands and
  documented three; `docs` and `sheets` existed only in `register(api)`. That drift was
  invisible while the listing came from the live registry, and post-migration the manifest
  is the only source — both commands would have disappeared. Added with their summaries.
- **All five capability-bearing extensions import the Mirror core at runtime**, so TS5's
  deletion of `src/memory/` would have broken them regardless of this story. The migration
  was never avoidable; option 2 would only have moved who paid and when.

## The Migration Path, For Whichever Option Wins

Documented in `docs/product/extensions/template/skill.yaml.template` and implemented in
`ts/src/extensions/dispatch.ts` and `contextRuntime.ts`:

```yaml
mirror_context_providers:
  - id: campaign_status
    provider_runtime:
      protocol: mirror-context-v1
      command: [node, context-provider.mjs]     # or [python, provider.py]

cli:
  subcommands:
    - name: campaigns
      runtime:
        protocol: mirror-cli-v1
        command: [node, commands/campaigns.mjs]  # or any executable runtime
```

Two properties that matter for planning:

- **Migration is per capability, not per extension.** The fallback to the host is
  per-subcommand and per-provider, so an extension can move one command at a time.
- **The command must resolve inside the installed extension root**
  (`commandStaysInside`), the same rule `provider_runtime.command` already follows. A
  manifest that reaches outside its own directory is not a contract.

## What This Story Owns Beyond The Host

Assigned here by other stories, and easy to lose if the Plan only looks at the gate:

- **D-018** — `memory.extensions.api.VERSION` still reads `1.1` after CV22.DS10.TS1
  removed `api.journey_projections`. The constant advertises a capability that does not
  exist. TS2 owns the Extension API's version authority, so TS2 decides whether the
  removal warrants `1.2`, `2.0`, or a statement that the capability never reached a user.
- **The Python-bodied test fixtures.** DS10's Zero Python gate assigns `ts/test/fixtures/**`
  (~10 `.py` files backing the catalog and dispatch tests) to this story: rewritten as Node
  scripts so CI needs no interpreter. The tests still prove "any executable runtime" — just
  not with Python.
- **The extension API reference's version note**, which currently says the number is
  deliberately not bumped and names TS2 as the authority.

## Gate Items (from the [DS10 package](../index.md#extension-compatibility-host-deletion-gate))

1. delete the compatibility host and every TS launcher branch that invokes it;
2. prove the packaged artifact contains no core-owned Python extension-provider bridge;
3. document the final migration cutoff for capabilities without a declared runtime;
4. make unmigrated providers fail explicitly and fail-soft rather than silently losing
   context;
5. run a repository/package check proving every retained extension context provider and
   every retained extension COMMAND enters through a declared language-neutral command.

Item 5 has a natural home: `scripts/check_retired_surfaces.py` gains a `compat-host` row,
the way US1's `web-console` row was added.

## Where To Resume

Nothing — the story is done. What it left for later:

- **[CR092](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr092-the-shim-template-resolves-python3-from-ambient-path.md)**
  — the shim template resolves `python3` from ambient `PATH`, correct for the Navigator's
  own tooling and undecided for a third party. Owner: **US3** (npm distribution), where a
  third-party audience first exists.
- **The validator fork — resolved at Debt Review (2026-09-21, Navigator: pay now).**
  The manifest validator requires `entrypoint.module` to resolve to a `.py` file, so the
  six inert bodies in `ext-catalog-writes` and `extension-catalog` cannot become Node
  while their bytes are graded by Python-recorded goldens: converting them would make the
  Python oracle call the fixture invalid, so the golden could not be regenerated. The
  fixture and its oracle die together. Reassigned to **TS5** — the same disposition this
  roadmap already gives `ts/parity/` — and the Zero Python gate row now says so. The
  gate's real requirement, *CI needs no interpreter*, is enforced mechanically by the
  `Extension suites need no interpreter` CI step (shadows `python`/`python3`/`uv` with
  stubs that exit 66; 41 pass, 3 shim tests correctly skip).
- **Rollback — evidenced at Debt Review (2026-09-21, Navigator: pay now).** Test-guide
  route 7 was executed against a worktree at `8bc3a31a~1`, the last commit with the host
  present: the migrated extensions answered identically there, so they are
  forward-compatible and reverting the core alone is safe. The contrast also held — on
  that core the unmigrated `google-ads` still spawned the Python host, where the current
  core refuses without a process.

Two lessons from TS1 and US1 that apply here: **the authored gate names one layer and the
inventory finds more** (both stories), and **the parity harness, the determinism gate, and
the smokes belong to no suite** — the pre-push set is the workflow's own list (57
generators, 17 write-parity probes, 3 smokes, both suites, four checks).
