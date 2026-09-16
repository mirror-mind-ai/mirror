[< Story](index.md)

# Test Guide — CV22.DS7.TS4

## Automated Validation

- **Goldens** generated from Python before the TypeScript exists, scenarios
  taken from the existing tests (`test_extensions.py`, `test_inspect.py`,
  `test_inspect_llm_calls.py`, `test_inspect_embedding_provenance.py`,
  `test_migrations.py`, `test_cli_dispatch.py`, `test_identity_cmd.py`,
  `test_conversations.py`, `test_conversation_metadata_lifecycle.py`), driven
  through the public CLI in a subprocess, under the determinism gate on 3.10
  and 3.12, offline: catalog reads over a fixture extensions root; ledger reads
  over the demo database; the `ext` dispatcher's refusals and help; the
  migration runner's statement splitting and checksums; `identity edit` with a
  scripted `$EDITOR`; every `apply_metadata_lifecycle` branch and the `demo`
  report.
- **Write probes** on the demo copy in CI: `ext_bindings`, `ext_migrations`,
  `extension_install` (a file-tree probe in the `builder_artifacts` shape),
  `metadata_lifecycle_apply`.
- **Catalog smoke**, both engines, disposable home and disposable target root:
  install `ext-hello` → `ext ext-hello` → bind → bindings → `ext ext-hello
  <sub>` → unbind → migrate → uninstall; trees and rows diffed after every
  step; a second fixture with a declared `commands[].runtime` exercises the
  contract path.
- **Redaction:** extension argv sentinels (an account id, a campaign name, a
  folder path) and an extension `.env` value never reach `front-door.log`.
- **Revert drills** for `MIRROR_TS_EXTENSIONS=0`, `MIRROR_TS_IDENTITY_EDIT=0`,
  `MIRROR_TS_CONVERSATIONS_LIFECYCLE=0`.
- Oracle registration of the nine Python modules named in the Plan; skill
  parity checker with `identity edit` and the lifecycle write faces removed
  from its Python allowlist at the flip.

## E2E Decision

**Required.** `ext <id> <subcommand>` is decided by code Mirror does not own;
only a real installed extension on the real home proves the bridge.

## Navigator Validation

In order, on the real home:

| Step | Command(s) | Expected observation | Pass | Fail |
|---|---|---|---|---|
| 1 | `extensions list`, `ext list`, `list all`, `inspect extension google-ads`, `inspect runtime-catalog pi`, `inspect llm-calls --summary`, `inspect embedding-provenance` — both engines, diffed | Byte-identical stdout, stderr, exit code | identical | any byte |
| 2 | `ext <id>` for every installed extension, both engines | Identical subcommand listings; nothing executed | identical | any difference, or a handler that ran |
| 3 | One read-only extension subcommand through the compat host (`ext session-export folder`) | Identical output and exit code; `ext ts leaf=session-export` in the log, no argument text | as described | any difference, argument text in the log |
| 4 | Catalog lifecycle on a disposable home and target root with `ext-hello`: install → bind → bindings → migrate → unbind → uninstall, both engines | Trees and rows diff-clean at every step | diff-clean | any tree or row difference |
| 5 | `identity edit <layer> <key>` with the Navigator's `EDITOR`, on a copy then the real home | Edited content saved; an unchanged buffer saves nothing; empty content refused | as described | content lost, or a save on no change |
| 6 | `conversations --metadata-lifecycle-demo` both engines; `--metadata-lifecycle-apply` on a copy for a locked-title, a refine-candidate, and a deferred-tags conversation | Identical JSON reports | identical | any difference |
| 7 | Revert: one leaf per family under its `=0` variable | Identical output, Python in the log | identical | any difference |

Providing this route is not acceptance. Validation passes only when the
Navigator has run steps 1–7 and accepted them explicitly.

## Validation Evidence

Pending implementation and validation.
