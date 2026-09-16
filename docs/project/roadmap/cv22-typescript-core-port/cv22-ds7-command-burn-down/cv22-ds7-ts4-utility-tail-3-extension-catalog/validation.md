[< Story](index.md)

# Validation — CV22.DS7.TS4

## Status

**Passed. Navigator accepted 2026-09-16**, and plateau 8 flipped the three gates
on that acceptance.

## Automated Checks

- TS suite 2,254 pass / 0 fail; `tsc --noEmit` clean; Biome clean except the
  pre-existing `routing.ts` warning.
- Python: extension and CLI suites green; `ruff check` / `ruff format --check`
  clean on `src/` and `tests/`.
- Goldens regenerate as a no-op and are verified identical under BOTH CI
  interpreters (3.10 and 3.12): `ext-dispatch`, `ext-catalog-writes`,
  `lifecycle-write`, `identity-edit`, `extension-catalog`, `ledger-inspect`,
  `ext-bindings`.
- Write probes on a copy of a real database: `ext_bindings` and
  `extension_install`, both `match: true`.
- Both-engine smoke in CI (`ts/parity/extension_catalog_smoke.ts`): install →
  `ext <id>` → bind → bindings → dispatch → unbind → migrate → inspect →
  `list all` → uninstall, streams, exit codes, and file trees compared at every
  step, with account-id, campaign-name, and folder-path sentinels proving the
  front-door log carries none of them.
- Oracle-drift tripwire clean, now covering `cli/ext.py`, `cli/inspect.py`,
  `cli/identity_cmd.py`, and `extensions/compat_host.py`.

Checks status: **passed**

## The route check on a copy of the real home

`node --no-warnings ts/parity/ts4_home_copy_route.ts` copies the Navigator's own
home — read-only at the source, database renamed to a `_test` name so no command
can resolve a production `memory.db` — and runs both engines over it. Result on
2026-09-16: **every step equal**.

| Test Guide step | Covered here | Evidence |
|---|---|---|
| 1 — read-only diff, both engines | yes | `extensions list`, `extensions validate`, `ext list`, `list all`, `inspect runtime-catalog pi/claude`, `inspect llm-calls --summary`, `inspect llm-calls --limit 5`, `inspect embedding-provenance`, and `inspect extension <id>` for all seven installed extensions — identical stdout and exit code |
| 2 — `ext <id>` for every installed extension | yes | all seven listed identically through the compat host: `google-ads`, `google-workspace`, `meta-ads`, `persona-export`, `plan-and-review`, `session-export`, `video-explainer`. Each one LOADS the extension and runs its `register(api)`, which is the bridge this story added |
| 3 — one real extension subcommand | partly | `ext session-export folder` (the handler's own usage, exit **64** — preserved identically by both engines, and a code neither core would invent), `folder list` (the real read-only run), and `ext session-export` (the listing). The real-home run stays the Navigator's |
| 4 — catalog lifecycle on a disposable home and target root | yes | the CI smoke, both engines, twelve steps, trees diffed |
| 5 — `identity edit` | partly | `ego/behavior` edited on each engine's own copy with a scripted editor: same output, same exit code, same stored content. The Navigator's own `$EDITOR` on the real home stays theirs |
| 6 — lifecycle demo and apply | mostly | the demo document is identical between engines; `--metadata-lifecycle-apply` on REAL conversations, one per available decision state, with the report AND the resulting row equal |
| 7 — revert per family | yes | `MIRROR_TS_EXTENSIONS=0` on two leaves and `MIRROR_TS_CONVERSATIONS_LIFECYCLE=0` on the demo, each falling back to Python with identical output |

Three findings from the real home, all recorded rather than worked around:

- **The TS front door needs `--env-file=.env`; `python -m memory` does not.**
  Python loads the repository `.env` itself, so `MIRROR_USER` reaches it for
  free; node does not, and the front door answers "Mirror home is not
  configured". This is not new and not TS4's — `journeys`, flipped months ago,
  behaves identically, and every documented invocation in `AGENTS.md` carries
  the flag — but the first version of the command sheet above omitted it and was
  therefore unusable. A sheet that cannot be pasted is a defect in the sheet.

- **Five of the seven installed extensions are SYMLINKS** into source repos, so a
  `Dirent.isDirectory()` filter found one of seven. The route check now follows
  the links (and dereferences them into the copy, so no command can write back
  into a real source repo). This is the same layout `_should_copy_source_tree`
  refuses to install through.
- **The real home holds zero manually locked titles** (342 provisional, 557
  generated, 0 manual), so step 6's `manual_lock_preserved` branch cannot be
  exercised on real data at all. It is graded by the corpus and by the demo, and
  the absence is stated here rather than quietly skipped.

## E2E

Decision: **required** — `ext <id> <subcommand>` is decided by code Mirror does
not own.

Evidence: all seven installed extensions load and list through the TS dispatcher
and the compat host with byte-identical output, and one real read-only
subcommand (`ext session-export folder`) round-trips identically. Remaining: the
same on the untouched home, which is the Navigator's step 3.

## What is left for the Navigator

Three steps, all on the REAL home. Every one is read-only or reversible, and
none requires the gates to be flipped — each command opts in for that single
invocation.

```bash
# Run from the repository root. `--env-file=.env` is REQUIRED: `python -m memory`
# loads `.env` itself, node does not, so without it the front door answers
# "Mirror home is not configured" — for every TS command, not just these.
# Keep each command on ONE line.

# Step 3 — one real extension subcommand through the compat host.
#   `folder` alone prints the extension's own usage and exits 64; `folder list`
#   runs the handler. Both are worth diffing: the exit code is the extension's,
#   and 64 is not a code either core would invent.
uv run python -m memory ext session-export folder list
MIRROR_TS_EXTENSIONS=1 node --env-file=.env --no-warnings ts/src/frontDoor/cli.ts ext session-export folder list
tail -3 ~/.mirror-minds/vinicius-ts/front-door.log   # expect: ext ts exit=0 leaf=session-export, and NO "folder"/"list"

# Step 5 — `identity edit` with YOUR editor. The copy first, then the real home.
#   Three branches to observe: save an edit -> "✓ ego/behavior updated";
#   quit without changing -> "No changes detected." (nothing written);
#   empty the buffer -> "Content is empty after editing. No changes saved." (exit 1).
cp -R ~/.mirror-minds/vinicius-ts /tmp/mirror-home-check
MIRROR_TS_IDENTITY_EDIT=1 node --env-file=.env --no-warnings ts/src/frontDoor/cli.ts identity edit ego behavior --mirror-home /tmp/mirror-home-check
MIRROR_TS_IDENTITY_EDIT=1 node --env-file=.env --no-warnings ts/src/frontDoor/cli.ts identity edit ego behavior

# Step 1 (acceptance pass) — the read diff on the untouched home.
for c in "extensions list" "ext list" "list all" "inspect llm-calls --summary"; do uv run python -m memory $c > /tmp/py.txt; MIRROR_TS_EXTENSIONS=1 node --env-file=.env --no-warnings ts/src/frontDoor/cli.ts $c > /tmp/ts.txt; diff /tmp/py.txt /tmp/ts.txt && echo "same: $c"; done
```

Navigator accepted: **yes — 2026-09-16**

Observed on the real home: step 1, the four read commands byte-identical on both
engines; step 3, `ext session-export folder list` identical with
`ext ts exit=0 leaf=session-export` in the log and no argument text; step 5,
`identity edit ego behavior` through the Navigator's own editor — the save
landed (`✓ ego/behavior updated`, confirmed at the row: +2 characters,
`updated_at` moved), an unchanged buffer wrote nothing three times running, and
empty content was refused with the content intact.

One correction paid for on the way: the first command sheet omitted
`--env-file=.env`, without which the TS front door cannot resolve a home that
Python resolves from the same `.env`. Not a TS4 defect — `journeys`, flipped
months ago, behaves identically — and now captured as
[CR085](../../../../refinement/rs009-cv22-front-door-routing-correctness/cr085-the-ts-front-door-does-not-read-the-env-python-reads.md).

Pass condition: identical bytes and exit codes on steps 1 and 3; the log line
carries `leaf=session-export` and no argument; `identity edit` saves an edit,
refuses empty content, and writes nothing when the buffer is unchanged.

Fail condition: any byte difference, any argument text in `front-door.log`, or
content lost by the editor seam.

## Missing Evidence

- none.
- `manual_lock_preserved` on real data — impossible on this home (no manually
  locked titles exist); covered by the corpus and the demo instead.
