// CR145 — `<mirror-home>/extensions/<id>.env`, the extension's settings file.
//
// Every case here is one the review named before a line was written: the
// four states of the listing line, the dotenv edges `parseEnv` has (a BOM it
// keeps, CRLF it accepts, a duplicate it resolves last-wins, `KEY=` it reads
// as the empty string), the merge-under rule with its reserved names, an id
// that must never become a path, and the exposure note.

import assert from "node:assert/strict";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { pythonUtcIsoformat } from "#extensions/bindings.ts";
import {
  installExtension,
  renderUninstallReport,
  uninstallExtension,
} from "#extensions/catalogWrites.ts";
import {
  describeExtensionSettings,
  extensionSettingsPath,
  RESERVED_SETTINGS_NAMES,
  readExtensionSettings,
  settingsUnderEnvironment,
} from "#extensions/settings.ts";

function home(): { root: string; home: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "ext-settings-"));
  const mirrorHome = join(root, "mirror");
  mkdirSync(join(mirrorHome, "extensions", "tools"), { recursive: true });
  return { root, home: mirrorHome, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const FIXTURE_NOTES = new URL("../fixtures/ext-catalog-writes/notes", import.meta.url).pathname;

const RUNNING_AS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;

test("the file lives beside the installed directory, never inside it", () => {
  assert.equal(extensionSettingsPath("/home/m", "tools"), "/home/m/extensions/tools.env");
});

test("absent, read, and empty are three different answers", () => {
  const ws = home();
  try {
    const path = extensionSettingsPath(ws.home, "tools");
    assert.deepEqual(readExtensionSettings(ws.home, "tools"), { kind: "absent", path });

    writeFileSync(path, "PGHOST=db.internal\nPGSSLMODE=verify-full\n", { mode: 0o600 });
    const read = readExtensionSettings(ws.home, "tools");
    assert.equal(read.kind, "read");
    if (read.kind !== "read") return;
    assert.deepEqual(read.variables, { PGHOST: "db.internal", PGSSLMODE: "verify-full" });
    assert.equal(read.exposedMode, null);

    writeFileSync(path, "# only a comment\n\n", { mode: 0o600 });
    const empty = readExtensionSettings(ws.home, "tools");
    assert.equal(empty.kind, "read");
    if (empty.kind !== "read") return;
    assert.deepEqual(empty.variables, {});
  } finally {
    ws.cleanup();
  }
});

test("the dotenv edges parseEnv has are decided, not inherited", () => {
  const ws = home();
  try {
    const path = extensionSettingsPath(ws.home, "tools");
    writeFileSync(path, '\uFEFFFIRST=1\r\nDUP=a\r\nDUP=b\r\nEMPTY=\r\nQUOTED="two words"\r\n', {
      mode: 0o600,
    });
    const read = readExtensionSettings(ws.home, "tools");
    assert.equal(read.kind, "read");
    if (read.kind !== "read") return;
    assert.deepEqual(read.variables, {
      FIRST: "1", // the BOM is stripped: the editor that wrote it never showed it
      DUP: "b", // last duplicate wins
      EMPTY: "", // `KEY=` is the empty string, which is a value
      QUOTED: "two words",
    });
  } finally {
    ws.cleanup();
  }
});

test("a file that exists but cannot be read is `unreadable`, with the reason", () => {
  const ws = home();
  try {
    const path = extensionSettingsPath(ws.home, "tools");
    // A directory in the file's place is EISDIR, whoever is running.
    mkdirSync(path);
    const directory = readExtensionSettings(ws.home, "tools");
    assert.equal(directory.kind, "unreadable");
    if (directory.kind === "unreadable") assert.equal(directory.reason, "EISDIR");
    rmSync(path, { recursive: true });

    if (RUNNING_AS_ROOT) return; // root reads a 000 file; the case cannot be made
    writeFileSync(path, "PGHOST=x\n");
    chmodSync(path, 0o000);
    try {
      const denied = readExtensionSettings(ws.home, "tools");
      assert.equal(denied.kind, "unreadable");
      if (denied.kind === "unreadable") assert.equal(denied.reason, "EACCES");
    } finally {
      chmodSync(path, 0o600);
    }
  } finally {
    ws.cleanup();
  }
});

test("an id outside the manifest's grammar never becomes a path", () => {
  const ws = home();
  try {
    // The context runtime takes ids from `_ext_bindings` rows. A row must not
    // be able to point the reader at `<home>/x.env` or anywhere else.
    writeFileSync(join(ws.home, "x.env"), "STEERED=1\n");
    for (const id of ["../x", "/etc/passwd", "Tools", "a--b", "a-", "", "tools.env"]) {
      const answer = readExtensionSettings(ws.home, id);
      assert.equal(answer.kind, "unreadable", `'${id}' must fail closed`);
      if (answer.kind === "unreadable") assert.match(answer.reason, /not a valid extension id/);
    }
  } finally {
    ws.cleanup();
  }
});

test("the file goes under the environment, and the reserved names never come from it", () => {
  const ws = home();
  try {
    const path = extensionSettingsPath(ws.home, "tools");
    writeFileSync(
      path,
      [
        "PGSSLMODE=verify-full",
        "PGHOST=db.internal",
        "ALREADY_EMPTY=from-file",
        ...RESERVED_SETTINGS_NAMES.map((name) => `${name}=/elsewhere`),
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    const settings = readExtensionSettings(ws.home, "tools");
    const environment: NodeJS.ProcessEnv = {
      PGSSLMODE: "disable",
      ALREADY_EMPTY: "",
      PATH: "/bin",
    };
    const merged = settingsUnderEnvironment(environment, settings);

    assert.equal(merged.PGSSLMODE, "disable", "the environment wins");
    assert.equal(merged.PGHOST, "db.internal", "the file fills a gap");
    assert.equal(merged.ALREADY_EMPTY, "", "set to empty is still set");
    assert.equal(merged.PATH, "/bin");
    for (const name of RESERVED_SETTINGS_NAMES) {
      assert.equal(name in merged, false, `${name} must not come from the file`);
    }
    // The input was not touched, and neither was the process.
    assert.deepEqual(environment, { PGSSLMODE: "disable", ALREADY_EMPTY: "", PATH: "/bin" });
    assert.equal("PGHOST" in process.env, false);

    // Absent or unreadable: the environment, as it was.
    assert.deepEqual(settingsUnderEnvironment(environment, { kind: "absent", path }), environment);
    assert.deepEqual(
      settingsUnderEnvironment(environment, { kind: "unreadable", path, reason: "EACCES" }),
      environment,
    );
  } finally {
    ws.cleanup();
  }
});

test("the listing line has four states, names keys, and never a value", () => {
  const path = "/home/m/extensions/tools.env";
  assert.equal(
    describeExtensionSettings({ kind: "absent", path }),
    `settings: ${path} (not present — create it to pass settings to this extension)`,
  );
  assert.equal(
    describeExtensionSettings({ kind: "unreadable", path, reason: "EACCES" }),
    `settings: ${path} (unreadable: EACCES)`,
  );
  assert.equal(
    describeExtensionSettings({ kind: "read", path, variables: {}, exposedMode: null }),
    `settings: ${path} (no variables)`,
  );
  const line = describeExtensionSettings({
    kind: "read",
    path,
    variables: { PGHOST: "db.internal", PGPASSWORD: "hunter2" },
    exposedMode: null,
  });
  assert.equal(line, `settings: ${path} (PGHOST, PGPASSWORD)`);
  assert.equal(line.includes("hunter2"), false);
  assert.equal(line.includes("db.internal"), false);
});

test("a file other users can read says so on the listing line", { skip: RUNNING_AS_ROOT }, () => {
  const ws = home();
  try {
    const path = extensionSettingsPath(ws.home, "tools");
    writeFileSync(path, "PGHOST=x\n");
    chmodSync(path, 0o644);
    const exposed = readExtensionSettings(ws.home, "tools");
    assert.equal(exposed.kind, "read");
    if (exposed.kind !== "read") return;
    assert.equal(exposed.exposedMode, "0644");
    assert.equal(
      describeExtensionSettings(exposed),
      `settings: ${path} (PGHOST; mode 0644, readable by other users)`,
    );

    chmodSync(path, 0o600);
    const owned = readExtensionSettings(ws.home, "tools");
    assert.equal(owned.kind === "read" && owned.exposedMode, null);
  } finally {
    ws.cleanup();
  }
});

test("install leaves the file alone, and a full uninstall keeps it and says so", () => {
  const root = mkdtempSync(join(tmpdir(), "ext-settings-uninstall-"));
  const mirrorHome = join(root, "mirror");
  const sourceRoot = join(root, "source");
  mkdirSync(join(mirrorHome, "extensions"), { recursive: true });
  cpSync(FIXTURE_NOTES, join(sourceRoot, "notes"), { recursive: true });
  const db = bootstrapDatabase(join(mirrorHome, "memory_test.db"));
  try {
    const deps = { nowIso: () => pythonUtcIsoformat() };
    const path = extensionSettingsPath(mirrorHome, "notes");
    writeFileSync(path, "PGHOST=db.internal\n", { mode: 0o600 });

    installExtension({ extensionId: "notes", sourceRoot, mirrorHome, runtime: null, db, deps });
    assert.equal(
      readFileSync(path, "utf8"),
      "PGHOST=db.internal\n",
      "install rewrote the directory, not the file",
    );

    // One runtime removed: the source stays, and so does the file, unmentioned.
    const partial = uninstallExtension({
      extensionId: "notes",
      mirrorHome,
      runtime: "pi",
      db,
      deps,
    });
    assert.equal(partial.settingsKept, null);
    assert.equal(renderUninstallReport(partial).stdout.includes("settings left in place"), false);

    // A full uninstall: the directory goes, the file stays, and the report names it.
    const full = uninstallExtension({ extensionId: "notes", mirrorHome, runtime: null, db, deps });
    assert.equal(full.settingsKept, path);
    assert.equal(existsSync(join(mirrorHome, "extensions", "notes")), false);
    assert.equal(existsSync(path), true);
    assert.match(
      renderUninstallReport(full).stdout,
      new RegExp(`\n  settings left in place: ${path}\n`),
    );

    // Without a file, the report is what it was before CR145: the golden's bytes.
    rmSync(path);
    installExtension({ extensionId: "notes", sourceRoot, mirrorHome, runtime: null, db, deps });
    const quiet = uninstallExtension({ extensionId: "notes", mirrorHome, runtime: null, db, deps });
    assert.equal(quiet.settingsKept, null);
    assert.equal(renderUninstallReport(quiet).stdout.includes("settings left in place"), false);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
