// Stage the markers that identify a Mirror Mind tree, for tests.
//
// CV22.DS10.TS5 plateau 1 (decision D1) moved identity and version from
// `pyproject.toml` + `src/memory/` to the TypeScript package. Seven test files
// staged the Python markers to make a fixture look like a checkout; they now
// stage these, through one helper, so US3's rename touches one constant here
// as well as one in `#runtime/packageIdentity.ts`.
//
// Kept deliberately structural: a manifest AND a front door, because that pair
// is what `findPackageIdentity` requires. A fixture that wrote only the
// manifest would pass a test while failing to represent a real tree.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { PACKAGE_NAME } from "#runtime/packageIdentity.ts";

export interface MirrorTreeOptions {
  /** The version the manifest reports. Defaults to a fixture-obvious value. */
  readonly version?: string;
  /**
   * The package name to write. Defaults to the real one.
   *
   * Pass something else to stage a tree that is structurally a package but is
   * NOT Mirror Mind -- the case that proves the walk stops at the first
   * candidate instead of climbing toward one that would say yes.
   */
  readonly name?: string;
}

/**
 * Write `ts/package.json` and `ts/src/frontDoor/cli.ts` under `root`.
 *
 * Returns `root` so it can be used inline in a fixture builder.
 */
export function stageMirrorPackage(root: string, options: MirrorTreeOptions = {}): string {
  const manifest = join(root, "ts", "package.json");
  mkdirSync(dirname(manifest), { recursive: true });
  writeFileSync(
    manifest,
    `${JSON.stringify(
      {
        name: options.name ?? PACKAGE_NAME,
        version: options.version ?? "9.9.9",
        private: true,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const frontDoor = join(root, "ts", "src", "frontDoor", "cli.ts");
  mkdirSync(dirname(frontDoor), { recursive: true });
  writeFileSync(frontDoor, "// fixture front door\n", "utf8");

  return root;
}
