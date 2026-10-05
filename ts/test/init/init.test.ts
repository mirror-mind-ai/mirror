import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  defaultUserHome,
  IdentityRootExistsError,
  initUserHome,
  TemplatesNotFoundError,
  templatesIdentityRoot,
} from "#init/init.ts";
import { runningTreeRoot } from "#runtime/treeRoot.ts";

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("defaultUserHome is the modern .mirror-minds path, the one MIRROR_USER resolves to (US3 D14)", () => {
  // Python wrote `~/.mirror/<user>` -- the pre-.mirror-minds layout -- and
  // told the person to set MIRROR_HOME by hand. With init writing
  // MIRROR_USER into the config file (D3), a legacy home would make every
  // later command print the legacy-path warning.
  assert.equal(defaultUserHome("alice", "/home/alice"), "/home/alice/.mirror-minds/alice");
});

test("templatesIdentityRoot is <tree root>/templates/identity (US3: one resolver for the tree)", () => {
  const { dir, cleanup } = tempDir("mirror-core-findtemplates-");
  try {
    mkdirSync(join(dir, "templates", "identity"), { recursive: true });
    assert.equal(templatesIdentityRoot(dir), join(dir, "templates", "identity"));
  } finally {
    cleanup();
  }
});

test("templatesIdentityRoot throws TemplatesNotFoundError when the tree has none", () => {
  const { dir, cleanup } = tempDir("mirror-core-findtemplates-missing-");
  try {
    assert.throws(() => templatesIdentityRoot(dir), TemplatesNotFoundError);
  } finally {
    cleanup();
  }
});

test("by default the templates come from the running tree, never from the cwd", () => {
  assert.equal(templatesIdentityRoot(), join(runningTreeRoot(), "templates", "identity"));
});

function buildFakeTemplates(root: string): void {
  mkdirSync(join(root, "self"), { recursive: true });
  mkdirSync(join(root, "user"), { recursive: true });
  writeFileSync(join(root, "README.md"), "Hello {{user_name}}, welcome.");
  writeFileSync(join(root, "self", "soul.yaml"), "soul: I am {{user_name}}'s mirror.\n");
  writeFileSync(join(root, "user", "identity.yaml"), "user: {{user_name}}\nother: no token here\n");
}

test("initUserHome copies the template tree, substitutes {{user_name}} in .yaml only, and returns the identity root", () => {
  const templates = tempDir("mirror-core-init-templates-");
  const home = tempDir("mirror-core-init-home-");
  try {
    buildFakeTemplates(templates.dir);
    const identityRoot = initUserHome("proberuser", {
      templatesIdentityRoot: templates.dir,
      userHome: home.dir,
    });
    assert.equal(identityRoot, join(home.dir, "identity"));
    assert.equal(
      readFileSync(join(identityRoot, "self", "soul.yaml"), "utf8"),
      "soul: I am proberuser's mirror.\n",
    );
    assert.equal(
      readFileSync(join(identityRoot, "user", "identity.yaml"), "utf8"),
      "user: proberuser\nother: no token here\n",
    );
    // README.md is not a .yaml file: the token is left untouched, matching
    // Python's rglob("*.yaml") scope exactly.
    assert.equal(
      readFileSync(join(identityRoot, "README.md"), "utf8"),
      "Hello {{user_name}}, welcome.",
    );
  } finally {
    templates.cleanup();
    home.cleanup();
  }
});

test("initUserHome refuses a non-empty existing identity root", () => {
  const templates = tempDir("mirror-core-init-templates2-");
  const home = tempDir("mirror-core-init-home2-");
  try {
    buildFakeTemplates(templates.dir);
    initUserHome("proberuser", { templatesIdentityRoot: templates.dir, userHome: home.dir });
    assert.throws(
      () =>
        initUserHome("proberuser", { templatesIdentityRoot: templates.dir, userHome: home.dir }),
      (error: unknown) =>
        error instanceof IdentityRootExistsError &&
        error.message ===
          `Identity root already exists and is not empty: ${join(home.dir, "identity")}`,
    );
  } finally {
    templates.cleanup();
    home.cleanup();
  }
});

test("initUserHome throws TemplatesNotFoundError when the given templates root does not exist", () => {
  const home = tempDir("mirror-core-init-home3-");
  try {
    assert.throws(
      () =>
        initUserHome("proberuser", {
          templatesIdentityRoot: "/definitely/does/not/exist",
          userHome: home.dir,
        }),
      TemplatesNotFoundError,
    );
  } finally {
    home.cleanup();
  }
});
