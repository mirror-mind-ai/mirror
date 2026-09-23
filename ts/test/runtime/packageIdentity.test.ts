// CV22.DS10.TS5 plateau 1, decision D1 — identity and version leave pyproject.
//
// Both answers used to be read out of files this story deletes. The version
// would have rendered as `unknown` in the updater, the release doctor, the
// welcome card and the MCP handshake; the checkout guard would have answered
// "not a checkout" and stopped refusing production clones. Neither would have
// failed a test, because both degrade to a valid-looking value.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";

import { findPackageIdentity, PACKAGE_NAME } from "#runtime/packageIdentity.ts";
import { packageVersion } from "#runtime/version.ts";
import { stageMirrorPackage } from "../support/mirrorTree.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const roots: string[] = [];

function tmpRoot(prefix = "mirror-identity-"): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("this repository", () => {
  test("reports the version ts/package.json declares", () => {
    const version = packageVersion(REPO_ROOT);
    assert.match(version ?? "", /^\d+\.\d+\.\d+$/);
  });

  test("agrees with pyproject.toml while both exist", () => {
    // Not a permanent contract -- pyproject is deleted at plateau 3. It is the
    // plateau-1 evidence that moving the source changed no user-visible byte:
    // `runtime version`, `runtime status`, the welcome card and the MCP
    // handshake all render this string, and the per-family capture hashes
    // them.
    const pyproject = join(REPO_ROOT, "pyproject.toml");
    let declared: string | null = null;
    for (const line of readFileSync(pyproject, "utf8").split("\n")) {
      if (line.trim().startsWith("version =")) {
        declared =
          line
            .split("=", 2)[1]
            ?.trim()
            .replace(/^["']|["']$/g, "") ?? null;
        break;
      }
    }
    assert.equal(packageVersion(REPO_ROOT), declared);
  });

  test("is found by walking up from a nested directory", () => {
    assert.equal(
      packageVersion(join(REPO_ROOT, "ts", "src", "frontDoor")),
      packageVersion(REPO_ROOT),
    );
  });
});

describe("findPackageIdentity", () => {
  test("requires a manifest AND a front door, never a manifest alone", () => {
    // A package.json is a file anyone can have -- `.pi/` and `frame/` both
    // carry one inside this very repository. The front door is what makes the
    // tree this program.
    const root = tmpRoot();
    mkdirSync(join(root, "ts"), { recursive: true });
    writeFileSync(
      join(root, "ts", "package.json"),
      JSON.stringify({ name: PACKAGE_NAME, version: "1.0.0" }),
      "utf8",
    );

    assert.equal(findPackageIdentity(root), null);
  });

  test("recognizes an installed package, where ts/ has been flattened away", () => {
    // The shape US3 publishes: manifest and front door at the package root.
    const root = tmpRoot();
    mkdirSync(join(root, "src", "frontDoor"), { recursive: true });
    writeFileSync(join(root, "src", "frontDoor", "cli.ts"), "// entry\n", "utf8");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: PACKAGE_NAME, version: "2.0.0" }),
      "utf8",
    );

    assert.equal(findPackageIdentity(root)?.version, "2.0.0");
    assert.equal(packageVersion(root), "2.0.0");
  });

  test("stops at the first structural candidate, whatever it answers", () => {
    // Python's property, preserved: a nested project decides for itself rather
    // than inheriting its parent's identity. A walk that kept climbing would
    // find THIS repository from anywhere beneath it.
    const root = stageMirrorPackage(tmpRoot());
    const inner = join(root, "vendor", "other");
    stageMirrorPackage(inner, { name: "someone-elses-package" });

    assert.equal(findPackageIdentity(root)?.isMirrorMind, true);
    assert.equal(findPackageIdentity(inner)?.isMirrorMind, false);
    assert.equal(packageVersion(inner), null, "and reports no version for a foreign tree");
  });

  test("a malformed manifest answers false rather than climbing past it", () => {
    // Python's `return False` inside the `except`, not a `continue`: a broken
    // manifest is a broken tree, not an absent one. Climbing would let a
    // corrupt inner project silently adopt the outer repository's identity.
    const outer = stageMirrorPackage(tmpRoot());
    const inner = join(outer, "broken");
    mkdirSync(join(inner, "ts", "src", "frontDoor"), { recursive: true });
    writeFileSync(join(inner, "ts", "package.json"), "{ not json", "utf8");
    writeFileSync(join(inner, "ts", "src", "frontDoor", "cli.ts"), "// entry\n", "utf8");

    assert.equal(findPackageIdentity(inner)?.isMirrorMind, false);
    assert.equal(packageVersion(inner), null);
  });

  test("returns null above every tree", () => {
    assert.equal(findPackageIdentity("/"), null);
    assert.equal(packageVersion("/"), null);
  });

  test("a manifest with no version reports null, not a crash", () => {
    const root = tmpRoot();
    mkdirSync(join(root, "ts", "src", "frontDoor"), { recursive: true });
    writeFileSync(join(root, "ts", "package.json"), JSON.stringify({ name: PACKAGE_NAME }), "utf8");
    writeFileSync(join(root, "ts", "src", "frontDoor", "cli.ts"), "// entry\n", "utf8");

    assert.equal(packageVersion(root), null);
  });
});

describe("the one constant US3 changes", () => {
  test("PACKAGE_NAME is what ts/package.json actually declares", () => {
    // If these drift, every consumer -- version, checkout guard, plugin
    // builder -- silently stops recognizing this repository.
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "ts", "package.json"), "utf8")) as {
      name: string;
    };
    assert.equal(manifest.name, PACKAGE_NAME);
  });
});
