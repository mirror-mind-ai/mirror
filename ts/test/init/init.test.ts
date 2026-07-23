import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  defaultUserHome,
  findTemplatesIdentityRoot,
  IdentityRootExistsError,
  initUserHome,
  TemplatesNotFoundError,
} from "../../src/init/init.ts";

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("defaultUserHome joins the legacy .mirror path (not .mirror-minds), matching Python exactly", () => {
  assert.equal(defaultUserHome("alice", "/home/alice"), "/home/alice/.mirror/alice");
});

test("findTemplatesIdentityRoot walks up from a starting file to find templates/identity", () => {
  const { dir, cleanup } = tempDir("mirror-core-findtemplates-");
  try {
    const nested = join(dir, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    mkdirSync(join(dir, "templates", "identity"), { recursive: true });
    const startFile = join(nested, "fake-module.ts");
    writeFileSync(startFile, "");
    assert.equal(
      findTemplatesIdentityRoot(pathToFileURL(startFile).href),
      join(dir, "templates", "identity"),
    );
  } finally {
    cleanup();
  }
});

test("findTemplatesIdentityRoot throws TemplatesNotFoundError when no ancestor has one", () => {
  const { dir, cleanup } = tempDir("mirror-core-findtemplates-missing-");
  try {
    const startFile = join(dir, "fake-module.ts");
    writeFileSync(startFile, "");
    assert.throws(
      () => findTemplatesIdentityRoot(pathToFileURL(startFile).href),
      TemplatesNotFoundError,
    );
  } finally {
    cleanup();
  }
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
