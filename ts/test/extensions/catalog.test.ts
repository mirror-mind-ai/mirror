// CV22.DS7.TS4 plateau 1 — the extension-catalog reads against Python's answer.
//
// Every case in `extension-catalog.golden.json` was recorded by running the
// real Python CLI in its own subprocess over a disposable copy of the fixture
// home (`ts/parity/generate_extension_catalog_golden.py`). This test replays
// the same argv through the TypeScript composition and compares all three
// faces a shell sees: stdout, stderr, and the exit code.
//
// Nothing here is routed. `routing.ts` still sends these commands to Python;
// plateau 7 wires the front door.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  runExtCommand,
  runExtensionsCommand,
  runInspectCommand,
  runListCommand,
  UnsupportedCatalogCommandError,
} from "#extensions/catalogCommands.ts";

interface GoldenCase {
  label: string;
  argv: string[];
  stdout: string;
  stderr: string;
  exit_code: number;
}

const golden = JSON.parse(
  await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../fixtures/extension-catalog.golden.json", import.meta.url), "utf8"),
  ),
) as { home_token: string; cases: GoldenCase[] };

const FIXTURE_HOME = new URL("../fixtures/extension-catalog/home", import.meta.url).pathname;

/**
 * A disposable COPY, like the generator's: a case that ever learns to write
 * must not edit the committed fixture. (CV22.DS7.US8 plateau 2 created nine
 * files inside a committed fixture exactly this way.)
 */
function withHome<T>(run: (home: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "ext-catalog-"));
  const home = join(root, "vinicius-ts");
  cpSync(FIXTURE_HOME, home, { recursive: true });
  try {
    return run(home);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function invoke(home: string, argv: readonly string[]) {
  const context = { mirrorHome: home };
  const resolved = argv.map((token) => token.replace(golden.home_token, home));
  const [command, ...rest] = resolved;
  // `--mirror-home` is the generator's, already applied through `context`.
  const args = rest.filter(
    (token, index) => token !== "--mirror-home" && rest[index - 1] !== "--mirror-home",
  );
  switch (command) {
    case "extensions":
      return runExtensionsCommand(context, args);
    case "ext":
      return runExtCommand(context, args);
    case "list":
      return runListCommand(context, args);
    case "inspect":
      return runInspectCommand(context, args);
    default:
      throw new Error(`unsupported golden command: ${command}`);
  }
}

test("every recorded catalog read matches Python, bytes and exit code", () => {
  assert.ok(golden.cases.length >= 30, "the corpus covers the family, not a sample");
  withHome((home) => {
    for (const recorded of golden.cases) {
      const actual = invoke(home, recorded.argv);
      const stdout = actual.stdout.split(home).join(golden.home_token);
      const stderr = actual.stderr.split(home).join(golden.home_token);
      assert.equal(stdout, recorded.stdout, recorded.label);
      assert.equal(stderr, recorded.stderr, `${recorded.label} (stderr)`);
      assert.equal(actual.exitCode, recorded.exit_code, `${recorded.label} (exit)`);
    }
  });
});

test("the corpus grades the facts a reading of the code would not give", () => {
  const byLabel = new Map(golden.cases.map((recorded) => [recorded.label, recorded]));
  const at = (label: string): GoldenCase => {
    const recorded = byLabel.get(label);
    assert.ok(recorded, `missing case: ${label}`);
    return recorded;
  };

  // Refusal class: this whole family prints usage to STDOUT and exits 1 --
  // stderr stays empty, unlike the argparse leaves.
  for (const label of [
    "extensions_unknown_subcommand",
    "extensions_install_without_root",
    "list_unknown_target",
    "inspect_bare",
    "inspect_extension_missing",
  ]) {
    assert.equal(at(label).exit_code, 1, label);
    assert.equal(at(label).stderr, "", label);
    assert.notEqual(at(label).stdout, "", label);
  }

  // An invalid extension exits 1 from the shared prelude, BEFORE `sync` can
  // report its own missing option.
  assert.equal(at("extensions_sync_without_runtime").exit_code, 1);
  assert.match(at("extensions_sync_without_runtime").stdout, /=== INVALID EXTENSIONS ===/);
  assert.doesNotMatch(at("extensions_sync_without_runtime").stdout, /sync requires/);

  // Same bytes, different exit code.
  assert.equal(at("ext_bare_help").stdout, at("ext_help_flag").stdout);
  assert.equal(at("ext_bare_help").exit_code, 1);
  assert.equal(at("ext_help_flag").exit_code, 0);

  // A missing or corrupt runtime catalog is an EMPTY catalog at exit 0.
  for (const label of ["inspect_runtime_catalog_missing", "inspect_runtime_catalog_corrupt"]) {
    assert.equal(at(label).exit_code, 0, label);
    assert.match(at(label).stdout, /extensions:\n {2}\(none\)/, label);
  }

  // Discovery skips a non-directory and a directory with no manifest silently,
  // and reports only a present-but-invalid manifest.
  const list = at("extensions_list").stdout;
  assert.doesNotMatch(list, /README|not-an-extension/);
  assert.match(list, /ext-broken: missing required field 'summary'/);
});

test("a write verb that passes its refusals fails loudly instead of printing nothing", () => {
  withHome((home) => {
    const context = { mirrorHome: home };
    assert.throws(
      () => runExtensionsCommand(context, ["install", "ext-alpha", "--extensions-root", home]),
      UnsupportedCatalogCommandError,
    );
    assert.throws(
      () => runExtCommand(context, ["ext-beta", "echo"]),
      UnsupportedCatalogCommandError,
    );
  });
});
