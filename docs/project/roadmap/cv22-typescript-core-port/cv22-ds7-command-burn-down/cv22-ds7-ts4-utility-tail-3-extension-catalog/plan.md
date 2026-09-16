# Plan — CV22.DS7.TS4

## Objective

Port the extension catalog and the last deterministic Python branches to
TypeScript — `extensions` and `ext`, the US1-deferred `list extensions|all` and
`inspect extension|runtime-catalog|llm-calls|embedding-provenance` branches,
`identity edit`, and the two ES-001 metadata-lifecycle write faces — so that
after this story the burn-down's "Unported — deterministic" table holds nothing
TS-owned. The one non-mechanical item, `ext <id> <extension-subcommand>`, is a
Navigator decision (D1) taken here, not a silent port.

## Terrain (facts read from code, not from the index)

The index describes this story from the ledger. The code says:

- **`extensions`** (`cli/extensions.py`, 938 lines) is a hand-rolled parser,
  not argparse: seven subcommands — `list` (also the bare default),
  `validate`, `sync --runtime R --target-root P`, `install <id>
  --extensions-root P [--runtime R]`, `uninstall <id> [--runtime R]`,
  `expose-claude --target-root P`, `clean-claude --target-root P` — plus
  `--mirror-home`. Every usage refusal prints a `Usage: python -m memory
  extensions …` line to **stdout** and exits **1**. `install` copies a source
  tree into `<home>/extensions/<id>`, syncs skill directories into the runtime
  skill roots, and writes the runtime catalog; `uninstall` removes both trees,
  prunes the catalog, and **deletes `_ext_bindings` rows** — a database write
  hiding in a filesystem command; `expose-claude`/`clean-claude` write a
  project's `.claude/skills` and an overlay catalog.
- **`ext`** (`cli/ext.py`, 425 lines): `ext list`; `ext <id>` (lists the
  extension's registered subcommands — which requires **loading the Python
  extension module** to read `api.cli_registry`); `ext <id> bind|unbind
  <capability> (--persona|--journey|--global)`, `bindings`, `migrate`; and
  `ext <id> <subcommand> [args]`, forwarded verbatim to the handler the
  extension registered with `api.register_cli`. Bare `ext` prints help and
  exits 1; `ext <id> <verb> --help` describes and never executes (a fix this
  code carries; the port must not lose it). All seven installed extensions on
  the validated home register CLI handlers — 64 invocations of `python -m
  memory ext …` live in their generated skills.
- **`list extensions|all`** and **`inspect extension|runtime-catalog`** read
  manifests and catalogs from the filesystem through the same discovery
  `extensions list` uses; `list all` composes the already-ported persona and
  journey listings with the extension one.
- **`inspect llm-calls`** (argparse: `--conversation --session --role --since
  --limit --summary`) and **`inspect embedding-provenance`** are read-only
  ledger queries with their own formatting (`_fmt_summary_cost`, week
  buckets).
- **`identity edit <layer> <key>`** writes the current content to a temp
  file, runs `$EDITOR`/`$VISUAL`/`nano` on it, reads it back, saves through
  the identity write path; empty content is refused without saving.
- **`conversations --metadata-lifecycle-apply <id> [--title --summary --tag…]`**
  runs `apply_metadata_lifecycle`: ~80 lines deciding, field by field, from the
  dry-run report TS already ports, what may be written (`preserve`,
  `refine_candidate`, `create`, `repair`, `defer`-after-summary) and what is
  skipped and why. **`--metadata-lifecycle-demo`** builds an in-memory service,
  runs three applies, and prints a JSON report — pure, no home needed.
- **TS already has** the manifest loader and the `mirror-context-v1` context
  runtime with its temporary Python compat host (TS2), the **read half** of the
  migration runner with the checksum contract (TS3, placed "where TS4 extends
  it"), and `dryRunMetadataLifecycle` (US10/US11).

**Leaf inventory (23):** `extensions` ×7; `ext` ×7 (`list`, `<id>` help,
`bind`, `unbind`, `bindings`, `migrate`, `<id> <subcommand>`); `list` ×2;
`inspect` ×4; `identity edit` ×1; `conversations` faces ×2.

## Decisions Taken At Plan Time

**D1 — `ext <id> <subcommand>` and `ext <id>` (recommendation; Navigator
decides).** Three options were weighed:

- *(a) Route them to Python by name until DS10.* Rejected: DS10 deletes
  Python, and every installed extension has CLI handlers — this would leave 64
  skill invocations with no engine on retirement day.
- *(b) A TypeScript extension-command contract only.* Manifests declare
  `commands[].runtime.command` (a no-shell argv, like TS2's
  `providerRuntime`), TS execs it with `MIRROR_HOME`, the database path, the
  extension root, and the table prefix in the environment. Correct end state,
  but it strands the seven installed Python extensions until each is rewritten
  — work this story does not own.
- *(c) TS2's shape, both halves:* TS owns the dispatcher (argument
  splitting, `--help` never executing, the built-in verbs, id validation,
  exit codes); a declared `commands[].runtime.command` is executed directly;
  an extension with no declaration falls to a **second mode of the existing
  compat host** (`memory.extensions.compat_host`, gaining a `cli` request:
  `{protocol: "mirror-cli-v1", extension_id, subcommand, argv, database_path,
  mirror_home, extension_root}`) that loads the extension, runs the handler
  with stdout/stderr **inherited** (handlers print freely), and returns its
  exit code; the same host answers `ext <id>` with the registry listing.
  One Python bridge, one deletion gate — DS10's existing one, extended in the
  same commit to name the `cli` mode.

**Recommended: (c).** It is the only option under which 2026-09-17 looks like
2026-09-16 for the Navigator, and it gives extensions a migration target that
DS10's gate can check. The contract half is small (a manifest field, one
branch in the dispatcher, a fixture extension exercising it); the compat half
is the shape TS2 already proved.

**D2 — gates.** One new revert for the catalog family, `MIRROR_TS_EXTENSIONS=0`,
covering `extensions`, `ext`, `list extensions|all`, and `inspect
extension|runtime-catalog` — they share discovery and a half-flipped catalog
would report two truths. `inspect llm-calls|embedding-provenance` join their
ungated read siblings. `identity edit` gets `MIRROR_TS_IDENTITY_EDIT=0` (an
editor seam deserves its own revert). The two ES-001 write faces join the
existing `MIRROR_TS_CONVERSATIONS_LIFECYCLE` gate their read faces use.

**D3 — refusal classes, as US8 pinned them.** The hand-rolled `extensions` and
`ext` usage texts are **product strings** printed to stdout at exit 1 — byte
parity obligations, `python -m memory` literals included (changing them is a
product change, and DS10's). The argparse leaves (`inspect llm-calls`,
`inspect embedding-provenance`, `identity edit`, `conversations`) keep the
recorded class: same inputs, exit 2, a one-line TS message.

**D4 — `uninstall` retention.** Python deletes bindings but leaves the
extension's tables and `_ext_migrations` rows in place. Parity-bound; dropping
tables is a product decision recorded for DS10, not taken here.

## Scope

**A. Catalog reads.** Discovery (`discover_extensions` with its error list and
ordering), runtime filtering, `print_extension_list`, catalog loading, and the
renderers behind `extensions list|validate`, `ext list`, `list extensions|all`,
`inspect extension|runtime-catalog`. Golden generated from Python over a
fixture extensions root that stages valid, invalid, runtime-filtered, and
legacy-skill-dir cases from `test_extensions.py` (34 tests) and
`test_inspect.py` (11).

**B. Ledger reads.** `inspect llm-calls` rows and `--summary` (week bucketing,
cost formatting, `--since` parsing) and `inspect embedding-provenance`, from
`test_inspect_llm_calls.py` and `test_inspect_embedding_provenance.py`; golden
over the demo database.

**C. Bindings and migrations.** `ext <id> bind|unbind|bindings|migrate`: the
`_ext_bindings` insert-or-ignore / delete with Python's `isoformat()` timestamp
bytes, and the **write half** of the migration runner — `run_migrations`,
`_split_statements`, `_extract_table_targets`, `_validate_prefix` — extending
`migrations.ts` where TS3 left the seam, with `test_migrations.py` (19) as the
corpus. A real-DB-copy write probe grades `_ext_bindings` and
`_ext_migrations` rows.

**D. Catalog writes.** `extensions sync|install|uninstall|expose-claude|clean-claude`:
tree copy with `_should_copy_source_tree`, skill-directory sync including the
legacy-name pruning rule, catalog JSON bytes, overlay catalog, and
`uninstall`'s binding deletion. Graded like `builder_artifacts`: file trees
compared byte for byte in disposable homes and target roots.

**E. The dispatch (D1).** The `ext` dispatcher in TS, the `commands[].runtime`
manifest field, the compat host's `cli` mode, `ext <id>` help through it,
`--help` on built-in verbs never executing, and a fixture extension of each
kind (declared command; legacy `register_cli`). The DS10 gate text extended.

**F. `identity edit`.** `spawnSync($EDITOR)` with a 0600 temp file, the
empty-content refusal, and the save through the ported identity write.

**G. ES-001 write faces.** `applyMetadataLifecycle` over the existing
`dryRunMetadataLifecycle`, every decision branch from
`test_conversation_metadata_lifecycle.py` and `test_conversations.py`, the
`demo` report byte-identical, and a write probe on a real-DB copy.

**H. Front door.** Routes with the D2 gates, the two-level allowlist for `ext`
(built-in verbs by name; `<id> <subcommand>` as the dynamic leaf), refusals
through the process boundary, redaction (extension argv carries account and
campaign identifiers), `build`-style `leaf=` logging, oracle registration for
`cli/ext.py`, `cli/extensions.py`, `cli/inspect.py`, `cli/identity_cmd.py`,
`extensions/api.py`, `extensions/loader.py`, `extensions/migrations.py`,
`extensions/compat_host.py`, `services/conversation.py`; `identity edit` and
the lifecycle write faces leave the skill parity checker's allowlist in the
flip commit.

## Non-Goals

- No extension platform redesign, no change to `api.register_cli`, no
  rewrite of the seven installed extensions or their generated skills.
- No change to the hand-rolled usage strings or to any surface text.
- No `runtime update|pull|stable|backup|release-doctor|release-promote`,
  `migrate-legacy`, or `journey-projection` — DS10's.
- No dropping of extension tables on `uninstall` (D4).
- No `python -m memory ext` replacement entry point for extension-authored
  skills after retirement — a **DS10 plan input** recorded here: 64
  invocations on the validated home reach Python directly, and DS10's Skill
  Invocation Gate covers repository skills only.

## Acceptance Behavior

```text
Given a home with installed extensions, bindings, and a populated ledger
When every leaf in the inventory runs on both engines
Then stdout, stderr, and exit code agree byte for byte on the reads,
  the written files and rows agree on the writes,
  ext <id> <subcommand> reaches the extension's handler with argv intact
  and its exit code preserved, and ext <id> --help executes nothing
And MIRROR_TS_EXTENSIONS=0, MIRROR_TS_IDENTITY_EDIT=0, and
  MIRROR_TS_CONVERSATIONS_LIFECYCLE=0 each send their family back to Python
  with identical output
And front-door.log carries leaf names only — never an extension argument
```

## Validation Route

Automated: the goldens under the determinism gate (3.10 and 3.12, offline);
the write probes (`ext_bindings`, `ext_migrations`, `extension_install` as a
file-tree probe, `metadata_lifecycle_apply`) on the demo copy in CI; a
both-engine catalog smoke (install → `ext <id>` → bind → bindings → `ext <id>
<sub>` → unbind → migrate → uninstall) in disposable homes and target roots;
the redaction test with extension argv sentinels; oracle registration.

Navigator route (real home, in this order):

1. **Read-only, both engines, byte-diffed:** `extensions list`, `ext list`,
   `list all`, `inspect extension google-ads`, `inspect runtime-catalog pi`,
   `inspect llm-calls --summary`, `inspect embedding-provenance`. Expected:
   identical.
2. **`ext <id>` help on the real home** for every installed extension, both
   engines. Expected: identical listings, nothing executed.
3. **One real extension subcommand** through the compat host on the real
   home, read-only by the extension's own contract (`ext session-export
   folder` or `ext persona-export` listing). Expected: identical output and
   exit code; `ext ts leaf=<id>` in the log, no argument text.
4. **The catalog lifecycle on a disposable home and target root** with the
   `ext-hello` fixture: install → bind → bindings → migrate → unbind →
   uninstall, both engines, trees and rows diffed. Expected: diff-clean.
5. **`identity edit`** with `EDITOR` set to an editor of the Navigator's
   choice, on a copy first, then the real home. Expected: the edited content
   saved; an unchanged buffer saves nothing.
6. **`conversations --metadata-lifecycle-demo`** both engines, and
   `--metadata-lifecycle-apply` on a copy of the real database for a
   conversation in each decision state. Expected: identical JSON.
7. **Revert:** each of the three variables on one leaf of its family.
   Expected: identical output, Python in the log.

E2E decision: **required** — `ext <id> <subcommand>` is the only leaf in DS7
whose behavior is decided by code Mirror does not own, and only a real
installed extension proves the bridge.

## Implementation Contract

Plateaus, one commit each, resumable, nothing routed until H and the gates
defaulting off until the flip:

1. **Catalog reads** (A) — golden, renderers, discovery; measure the exit
   codes and usage bytes on the real CLI before writing a line.
2. **Ledger reads** (B).
3. **Bindings and migrations** (C) — `migrations.ts` write half; probes.
4. **Catalog writes** (D) — the file-tree probe.
5. **The dispatch** (E) — D1 as decided; compat host `cli` mode; fixtures of
   both kinds; DS10 gate text.
6. **`identity edit`** (F) and **ES-001 write faces** (G).
7. **Front door, gates off** (H) — lazy import not required (no core-sized
   tree), allowlist, redaction, oracle registration, CI entries.
8. **Flip** — gates on, skill allowlist entries removed, ledger per-leaf
   table and checklist, after Navigator steps 1–4 and 7.

Rules: `uv run` for Python; goldens generated from Python before the TS
exists, scenarios taken from the existing tests, driven through the public
CLI in a subprocess; no `git add .`; story-scoped commits with English
messages explaining why; the persona panel at Plan (done) and at handoff.

## Stop Conditions

- `scope_change_detected` — any request to change a usage string, a surface,
  the manifest schema beyond `commands[].runtime`, or `uninstall` retention.
- `plan_rule_conflict` — a Python behavior the corpus cannot reproduce
  without a live external service (an extension handler that calls one is
  Navigator-run, never CI).
- `failing_required_check_without_clear_fix`.
- `navigator_decision_needed` — D1 above; and any extension on the validated
  home whose handler cannot run under the compat host.

## Persona Review (plan stage)

Run 2026-09-16 on this draft, five lenses (no model-in-the-loop behavior;
`inspect llm-calls` reads the ledger). Four dissented; each changed the plan
above before it was presented.

- **engineer** — one Python bridge, not two: the `cli` mode must be a second
  request kind of TS2's `compat_host`, under TS2's deletion gate, or DS10
  inherits two hosts to delete. `list all` composes the ported persona and
  journey renderers rather than re-implementing them. `ext <id>` needs the
  host too, so the `ext` family cannot flip leaf by leaf ahead of plateau 5 —
  the two-level allowlist refuses `<id>` and `<id> <sub>` by name until then.
- **quality-assurance** — the hand-rolled parsers exit 1 with usage on
  STDOUT; measure every refusal on the real CLI at plateau 1 and pin the
  class, as US8 did. `--metadata-lifecycle-demo` is the only pure golden;
  real `apply` needs a copy holding a manually locked title, a refine
  candidate, and a deferred-tags conversation, or the branches are theory.
  The install smoke must use a disposable home AND a disposable target root —
  never the developer's `.pi`.
- **database-architect** — `_split_statements` is the risk: a semicolon
  inside a string literal or a trigger body splits differently and the two
  cores apply different DDL to the same file. Port it from the tests, mutate
  it, and grade `_ext_migrations` bytes (checksum, applied_at format).
  `uninstall` deleting bindings but not tables is a retention decision the
  plan must name (D4), not inherit silently.
- **security-engineer** — `install <id>` must validate the id against the
  manifest id regex and resolve inside `--extensions-root`; the compat host
  takes argv verbatim with no shell; extension argv (account ids, campaign
  names, folder paths) and extension `.env` values must never reach
  `front-door.log` or an error message — a sentinel test on the `ext` route,
  as US8's `load` case; `identity edit`'s temp file is 0600 and removed on
  every path.
- **devops-engineer** — no dissent on the plan; one input recorded for DS10:
  the 64 extension-authored `python -m memory ext` invocations have no engine
  after retirement, and that is a DS10 design item, not a TS4 silent fix.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval` — including D1
- implementation remains blocked until Navigator approval.
