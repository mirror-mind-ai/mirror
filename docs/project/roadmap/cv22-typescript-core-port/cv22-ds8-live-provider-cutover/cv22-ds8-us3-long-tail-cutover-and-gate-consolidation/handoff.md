[< Story](index.md)

# Handoff — CV22.DS8.US3

**Closed 2026-09-12.** Eight of the ten leaves this story owned answer from
TypeScript against a live provider on an unconfigured install. Two do not, by
an explicit split recorded mid-story.

---

## What is now true

Nine provider-backed leaves are live in production, each with one variable that
reverts it: `memories --search` (US1), the five close-tail subcommands (US2),
and US3's eight — `consult credits|ask`, `mirror load --query`, `journal`,
`week plan`, `descriptor generate`, `soul harvest save`, `consolidate apply`.

`MIRROR_TS_EXTERNAL_ROUTES` is retired. It was DS5's safety catch while replay
was the production route for these leaves; after the cutover replay is a test
transport, so the gate only added a second thing to set. A leftover value is
inert, proven at `=1`, `=0`, and unset across ten leaves.

Every flipped leaf writes the `llm_calls` rows Python writes, priced. Thirteen
rows on the real home during validation; **zero unpriced, zero body bytes**.

## What remains intentionally undone

**`consolidate scan` and `shadow scan` are not live.** TypeScript never ported
`CONSOLIDATION_PROMPT` or `SHADOW_SCAN_PROMPT` — `propose.ts` sends a fenced
Markdown dump of the memories, 121 and 209 bytes against Python's 2,247 and
1,598, with no task statement, no untrusted-input guard, and no JSON output
contract. Under replay the provider answers by role and never reads the prompt,
which is why it survived to DS8 undetected.

Everything else those leaves need is already here: the transport spec, the
provider factory, ledger rows, the outcome seam, and the
`MIRROR_TS_CULTIVATION` revert. **Only the route flip waits**, and `routing.ts`
refuses it by name — `live blocked by DS8.TS2` — so the dependency cannot be
forgotten. Deleting one `liveBlockedBy` line is the whole flip.

Also open, out of scope by decision: CR074, CR076, CR057, and CR078 (captured
during this story's validation).

## What the next plateau is

**CV22.DS8.TS2** — port the two cultivation prompt templates, thread `userName`
and `identityContext` from the route, pin the assembled bytes against the
oracle the way `reception` is pinned here, and have the prompt engineer read
the ported text as text before it reaches a live model. Then flip group C and
empty the burn-down ledger's replay-gated table.

Two things are already waiting for it:

- `ts/parity/live_long_tail_smoke.ts consolidate-scan` and `shadow-scan` read
  the ROUTE before spending. Today they print `SKIPPED` with the route's reason
  and make no call; they start working the day the block is removed, with no
  edit to the script.
- The smoke's `consolidate-scan` verdict already requires at least one
  `answered` outcome, so a run that proposes nothing cannot pass.

## Which evidence supports it

[Validation](validation.md) — eight live probes on a database copy
($0.000686 total), four real-home writes, the revert matrix, and key hygiene.
Two repeatable checks became tools: `ts/parity/route_matrix.ts` (install state
plus every routing contract, exits non-zero on a break) and
`ts/parity/key_hygiene.ts`.

Hermetic: 2006 tests, typecheck and lint clean.

## What a reader should be careful about

**The runtime reads the working tree.** `.pi/extensions/mirror-logger.ts`
invokes `ts/src/frontDoor/cli.ts` relative to the repository root with
`--env-file-if-exists=.env`, so a routing change is live for the running Pi
session the moment it lands — there is no separate deploy step to stage behind.
This story's plan assumed otherwise; the correction is recorded in the
validation evidence. To hold a flip back while validating, put the revert
variables in `.env` (gitignored, read per invocation, no relaunch needed).

**Node's `--env-file` fills only UNSET variables.** `env -u VAR` therefore
re-reads a holdback from the file rather than lifting it; set `VAR=1` instead,
which routes live because only an exact `"0"` reverts.

**Two cosmetic inconsistencies, recorded and not fixed:** `soul harvest save`
reverts with `soul TS route disabled by MIRROR_TS_SOUL=0` where its siblings
say `<VAR>=0 revert to Python`, and the live smoke rounds sub-microcent totals
to `$0.000000`. Both are safe to sweep in whatever next touches those files.
