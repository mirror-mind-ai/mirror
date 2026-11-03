import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";

function fakeHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "mirror-core-initcli-"));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

// The shell sets neither MIRROR_USER nor MIRROR_HOME, and the empty strings
// shadow the checkout's own `.env` (the front door reads it from its entry
// path since CV22.DS10.US3 D3, so an unset variable would be filled from it).
// XDG_CONFIG_HOME too: GitHub's runners set it, and the config file would land
// there instead of under the fake HOME.
const NO_USER = { MIRROR_USER: "", MIRROR_HOME: "", XDG_CONFIG_HOME: "" };

test("front door `init <user>` bootstraps a real user home end to end (no DB involved)", () => {
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
    assert.equal(result.status, 0);
    // The modern home, the one MIRROR_USER resolves to without a legacy
    // warning (US3 D14). Python's init wrote `~/.mirror/<user>` and told the
    // person to set MIRROR_HOME by hand.
    const identityRoot = join(home, ".mirror-minds", "probeuser", "identity");
    assert.match(result.stdout, /Created user home:/);
    assert.match(result.stdout, /Identity ready at:/);
    assert.match(result.stdout, /Run: mirror seed\n/);
    assert.match(result.stdout, / {2}mirror identity edit user identity\n/);
    assert.ok(existsSync(join(identityRoot, "self", "soul.yaml")));
    const soul = readFileSync(join(identityRoot, "self", "soul.yaml"), "utf8");
    assert.ok(soul.includes("probeuser"), "expected {{user_name}} substituted with probeuser");
  } finally {
    cleanup();
  }
});

test("`init` on a machine with no user configured writes MIRROR_USER into the config file (D3)", () => {
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
    assert.equal(result.status, 0, result.stderr);
    const config = join(home, ".config", "mirror", "env");
    assert.equal(readFileSync(config, "utf8"), "MIRROR_USER=probeuser\n");
    assert.equal(statSync(config).mode & 0o777, 0o600);
    assert.equal(statSync(join(home, ".config", "mirror")).mode & 0o777, 0o700);
    // The person is told where the file is and that the key goes there by
    // hand; the command never takes a key from argv.
    assert.match(
      result.stdout,
      new RegExp(`Configuration: ${config.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    assert.match(result.stdout, /OPENROUTER_API_KEY/);
    assert.doesNotMatch(result.stdout, /Add to your \.env/);
    // That the next command reads the file is config.test.ts's claim; through
    // this checkout's entry the tree's own `.env` would be read first.
  } finally {
    cleanup();
  }
});

test("`init` with a user already configured leaves the config file alone", () => {
  // A second mirror on the same machine: the person runs it with MIRROR_USER
  // in the shell, as before. init must not silently switch the default.
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "second"], {
      HOME: home,
      MIRROR_USER: "first",
      MIRROR_HOME: "",
      XDG_CONFIG_HOME: "",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(home, ".config", "mirror", "env")));
    assert.match(result.stdout, /MIRROR_USER=second/);
  } finally {
    cleanup();
  }
});

// --- CR185: `init <name>` uses a home that already exists, and changes nothing in it ---
//
// Leandro moved from a clone to the package (PR #42): his home was on disk, his
// configuration in the clone's `.env`, which a package does not read. Getting
// Started told him `mirror init <your-name>` would write his user and find the
// home; it refused the home instead. Now it adopts it.

/** Every file under `dir`, by relative path, with its bytes. */
function tree(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(path.slice(dir.length), readFileSync(path, "base64"));
  }
  return files;
}

/** A home `init` made, with its configuration gone: the move from a clone to the package. */
function existingHome(home: string, user = "probeuser"): string {
  const made = spawnFrontDoor(["init", user], { HOME: home, ...NO_USER });
  assert.equal(made.status, 0, made.stderr);
  rmSync(join(home, ".config"), { recursive: true, force: true });
  return join(home, ".mirror-minds", user);
}

test("`init <name>` on an existing home configures it and changes nothing in it", () => {
  const { home, cleanup } = fakeHome();
  try {
    const userHome = existingHome(home);
    const before = tree(userHome);
    const result = spawnFrontDoor(["init", "probeuser"], {
      HOME: home,
      ...NO_USER,
      OPENROUTER_API_KEY: "",
    });
    assert.equal(result.status, 0, result.stderr);
    const config = join(home, ".config", "mirror", "env");
    const lines = result.stdout.split("\n");
    // The installer's contract (PR #45): the first stdout line is a one-line summary.
    assert.equal(lines[0], `Found user home: ${userHome} (nothing in it was changed)`);
    assert.ok(lines.includes(`Configuration: ${config} (MIRROR_USER=probeuser)`), result.stdout);
    assert.equal(readFileSync(config, "utf8"), "MIRROR_USER=probeuser\n");
    assert.equal(statSync(config).mode & 0o777, 0o600);
    assert.equal(statSync(join(home, ".config", "mirror")).mode & 0o777, 0o700);
    assert.deepEqual(tree(userHome), before);
    // Only what is left to do: the key, and the seed this home never had.
    assert.match(
      result.stdout,
      new RegExp(
        `  1\\. Add OPENROUTER_API_KEY=<your key> to ${config.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    );
    assert.match(result.stdout, /\n {2}2\. Run: mirror seed\n/);
    assert.doesNotMatch(
      result.stdout,
      /Created user home|Identity ready at|Your identity is ready/,
    );
  } finally {
    cleanup();
  }
});

test("`init <name>` again on the home already selected says so, writes nothing, and wires again", () => {
  // Getting Started, section 6: "re-run `mirror init your-name` any time to see
  // it again". The selection comes from the environment here: through this
  // checkout's entry, its own `.env` is read before the config file.
  const { home, cleanup } = fakeHome();
  try {
    spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
    const config = join(home, ".config", "mirror", "env");
    const written = readFileSync(config, "utf8");
    const bin = join(home, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "claude"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const result = spawnFrontDoor(["init", "probeuser"], {
      HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
      ...NO_USER,
      MIRROR_USER: "probeuser",
      OPENROUTER_API_KEY: "sk-test",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Found user home: .* \(nothing in it was changed\)\n/);
    assert.match(result.stdout, /\nConfiguration: already selects this home\n/);
    assert.equal(readFileSync(config, "utf8"), written);
    assert.doesNotMatch(result.stdout, /OPENROUTER_API_KEY|This machine already selects/);
    assert.match(result.stdout, /Wire your runtime/);
    assert.match(result.stdout, /Claude Code:/);
  } finally {
    cleanup();
  }
});

test("`init <name>` on an existing home while another is selected writes nothing", () => {
  const { home, cleanup } = fakeHome();
  try {
    existingHome(home, "second");
    const result = spawnFrontDoor(["init", "second"], {
      HOME: home,
      MIRROR_USER: "first",
      MIRROR_HOME: "",
      XDG_CONFIG_HOME: "",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(home, ".config", "mirror", "env")));
    assert.match(
      result.stdout,
      / {2}1\. This machine already selects a user; to use this one, run with MIRROR_USER=second\n/,
    );
  } finally {
    cleanup();
  }
});

test("an existing home with a key set and a database prints no step it does not need", () => {
  const { home, cleanup } = fakeHome();
  try {
    const userHome = existingHome(home);
    writeFileSync(join(userHome, "memory.db"), "");
    const result = spawnFrontDoor(["init", "probeuser"], {
      HOME: home,
      PATH: "/usr/bin:/bin",
      ...NO_USER,
      OPENROUTER_API_KEY: "sk-test",
      // The environment names the database a home must hold: CI runs the suite
      // with MEMORY_ENV=test, whose database is memory_test.db, not this one.
      MEMORY_ENV: "",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Next steps|OPENROUTER_API_KEY|mirror seed/);
  } finally {
    cleanup();
  }
});

test("a home whose identity lives only in its database is adopted, and no template is copied in", () => {
  const { home, cleanup } = fakeHome();
  try {
    const userHome = join(home, ".mirror-minds", "probeuser");
    mkdirSync(userHome, { recursive: true });
    writeFileSync(join(userHome, "memory.db"), "");
    const result = spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Found user home: /);
    assert.deepEqual(readdirSync(userHome), ["memory.db"]);
  } finally {
    cleanup();
  }
});

test("adopting keeps the config file's other lines, and twice in a row writes MIRROR_USER once", () => {
  const { home, cleanup } = fakeHome();
  try {
    existingHome(home);
    const dir = join(home, ".config", "mirror");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "env"), "OPENROUTER_API_KEY=sk-kept\n");
    for (let run = 0; run < 2; run += 1) {
      const result = spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(
      readFileSync(join(dir, "env"), "utf8"),
      "OPENROUTER_API_KEY=sk-kept\nMIRROR_USER=probeuser\n",
    );
  } finally {
    cleanup();
  }
});

test("a home reached through a symlink is adopted where it lives, untouched", () => {
  const { home, cleanup } = fakeHome();
  try {
    const target = join(home, "synced", "probeuser");
    mkdirSync(join(target, "identity"), { recursive: true });
    writeFileSync(join(target, "identity", "soul.yaml"), "mine\n");
    mkdirSync(join(home, ".mirror-minds"));
    symlinkSync(target, join(home, ".mirror-minds", "probeuser"));
    const result = spawnFrontDoor(["init", "probeuser"], { HOME: home, ...NO_USER });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Found user home: /);
    assert.deepEqual(readdirSync(join(target, "identity")), ["soul.yaml"]);
    assert.equal(readFileSync(join(target, "identity", "soul.yaml"), "utf8"), "mine\n");
  } finally {
    cleanup();
  }
});

test("a name init refuses is refused before any home is looked at, even with one present", () => {
  const { home, cleanup } = fakeHome();
  try {
    existingHome(home, "x");
    const result = spawnFrontDoor(["init", "../x"], { HOME: home, ...NO_USER });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /is not a user name/);
    assert.ok(!existsSync(join(home, ".config")));
  } finally {
    cleanup();
  }
});

test("a new home whose user is already selected says so, with no instruction to select it", () => {
  // The Windows installer (PR #45) writes the config file first, then runs init.
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "probeuser"], {
      HOME: home,
      MIRROR_USER: "probeuser",
      MIRROR_HOME: "",
      XDG_CONFIG_HOME: "",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Created user home: /);
    assert.match(result.stdout, /\nConfiguration: already selects this home\n/);
    assert.match(result.stdout, /\n {2}1\. Run: mirror seed\n/);
    assert.doesNotMatch(result.stdout, /This machine already selects a user/);
  } finally {
    cleanup();
  }
});

test("front door `init` requires a user argument", () => {
  const result = spawnFrontDoor(["init"]);
  assert.equal(result.status, 2);
});

test("front door `init` does not take a flag for a user name", () => {
  // `mirror init --help` created a home named `--help` under ~/.mirror-minds
  // (found while dogfooding on Windows): the only positional was read as the
  // user. A word that starts with `-` is a flag the command does not have,
  // and the answer is the usage line, with nothing created.
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "--help"], { HOME: home, ...NO_USER });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^Usage: init <user>/);
    assert.equal(existsSync(join(home, ".mirror-minds", "--help")), false);
  } finally {
    cleanup();
  }
});

test("front door `init` takes a kebab-case key for a user name, and nothing else", () => {
  // CR141: the name becomes `~/.mirror-minds/<user>` and the value of
  // MIRROR_USER in every wiring command `init` prints, so it is a key of the
  // kind CR104 constrained for slugs and persona ids. Before: `../escaped`
  // created `~/escaped`, outside the directory the product owns; `My User`
  // put a space into MIRROR_USER; `a/b` nested. The refusal is CR104's
  // sentence -- consequence, rule, a key that would work -- and creates
  // nothing.
  const rows: Array<[user: string, suggestion: string]> = [
    ["../escaped", "escaped"],
    ["My User", "my-user"],
    ["a/b", "a-b"],
    ["Vinícius", "vinicius"],
  ];
  for (const [user, suggestion] of rows) {
    const { home, cleanup } = fakeHome();
    try {
      const result = spawnFrontDoor(["init", user], { HOME: home, ...NO_USER });
      assert.equal(result.status, 2, user);
      assert.match(
        result.stderr,
        new RegExp(
          `^Error: no user home was created: '.*' is not a user name\\. Use lowercase letters, digits, and single hyphens, up to 80 characters, for example '${suggestion}'\\.$`,
          "m",
        ),
        user,
      );
      // Nothing under HOME but what the fake home came with: no `.mirror-minds`,
      // no escaped directory beside it, no config file.
      assert.deepEqual(readdirSync(home), [], user);
    } finally {
      cleanup();
    }
  }
});

test("`init` ends with the wiring step for each runtime found on the PATH, and only those", () => {
  // US3 plateau 3: the person who just created a home is handed the next line
  // for the runtimes they actually have, not a page. A scratch bin holds
  // stand-ins for two of the five; the other three must not be mentioned.
  const { home, cleanup } = fakeHome();
  try {
    const bin = join(home, "bin");
    mkdirSync(bin);
    for (const command of ["claude", "codex"]) {
      writeFileSync(join(bin, command), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }
    const result = spawnFrontDoor(["init", "probeuser"], {
      HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
      ...NO_USER,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Wire your runtime/);
    assert.match(
      result.stdout,
      /Claude Code:\n {2}mkdir -p ~\/\.claude\/skills && ln -s ".*\/plugins\/mirror-mind" ~\/\.claude\/skills\/mirror-mind/,
    );
    assert.match(
      result.stdout,
      /Codex:\n {2}1\. codex plugin marketplace add "\/.*"\n {2}2\. codex plugin add mirror-mind@mirror-mind/,
    );
    assert.doesNotMatch(result.stdout, /Gemini CLI:|^Pi:|^Grok Build:|^Antigravity:/m);
  } finally {
    cleanup();
  }
});

test("`init` with `grok` on the PATH prints the Grok Build block, two steps (CV21.DS10.US1)", () => {
  // The probe on grok 1.0.62: the trusted install copies and enables the
  // plugin in one command; a link under ~/.grok/rules/ carries the Operating
  // Instructions, since Grok ignores the plugin's session-start context.
  const { home, cleanup } = fakeHome();
  try {
    const bin = join(home, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "grok"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const result = spawnFrontDoor(["init", "probeuser"], {
      HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
      ...NO_USER,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /Grok Build:\n {2}1\. grok plugin install "\/.*\/plugins\/mirror-mind" --trust\n {5}\(--trust activates[^\n]*\n[^\n]*\n[^\n]*\n {2}2\. ln -s "\/.*\/AGENTS\.md" ~\/\.grok\/rules\/mirror-mind\.md/,
    );
    assert.doesNotMatch(result.stdout, /Claude Code:|Codex:|Antigravity:|^Pi:/m);
  } finally {
    cleanup();
  }
});

test("`init` with `gemini` on the PATH prints no Gemini CLI section (CV21.DS8.US1)", () => {
  // The Gemini CLI integration is retired: `init` no longer knows the
  // runtime, so a `gemini` binary on the PATH earns no wiring block, and no
  // succession sentence either -- that belongs to the cutoff note, not here.
  const { home, cleanup } = fakeHome();
  try {
    const bin = join(home, "bin");
    mkdirSync(bin);
    for (const command of ["gemini", "claude"]) {
      writeFileSync(join(bin, command), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }
    const result = spawnFrontDoor(["init", "probeuser"], {
      HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
      ...NO_USER,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Wire your runtime/);
    assert.match(result.stdout, /Claude Code:/);
    assert.doesNotMatch(result.stdout, /[Gg]emini/);
  } finally {
    cleanup();
  }
});

test("`init` with no runtime on the PATH prints no wiring section", () => {
  const { home, cleanup } = fakeHome();
  try {
    const result = spawnFrontDoor(["init", "probeuser"], {
      HOME: home,
      PATH: "/usr/bin:/bin",
      ...NO_USER,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Wire your runtime/);
  } finally {
    cleanup();
  }
});
