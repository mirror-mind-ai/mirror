// CV22.DS7.US8 plateau 7 — the production-clone guard, graded against Python.
//
// The guard's inputs are the MACHINE's: a git root, a `.mirror-clone-role`
// marker, and a `pyproject.toml` declaring Mirror Mind. So each case stages a
// whole tree under a temp root OUTSIDE this checkout — inside it, `git rev-parse
// --show-toplevel` walks up to this repository and reads the developer's own
// marker, which is how the plateau-1 corpus once encoded one machine's `dev`.
//
// The recorded messages carry `<ROOT>`; each side substitutes its own staged
// path, so the bytes stay graded rather than normalized away.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectBuilderCloneRole, isMirrorMindCheckout } from "#frontDoor/cloneRoleGuard.ts";
import golden from "#goldens/builder-load.golden.json" with { type: "json" };
import { stageMirrorPackage } from "../support/mirrorTree.ts";

interface CloneRoleCase {
  name: string;
  tree: {
    pyproject: string | null;
    src_memory: boolean;
    git: boolean;
    marker: string | null;
  };
  with_project: boolean;
  ignore_production_role: boolean;
  stderr: string;
  exit_code: number | null;
}

const cases = (golden as unknown as { clone_role: CloneRoleCase[] }).clone_role;
const MIRROR_PYPROJECT = '[project]\nname = "mirror"\nversion = "0.0.0"\n';

/**
 * The generator's `_stage_clone_role_tree`, in TypeScript.
 *
 * CV22.DS10.TS5 (D1) moved checkout detection off `pyproject.toml` +
 * `src/memory/` and onto the TypeScript package, because deleting
 * `src/memory/` at plateau 3 would otherwise have silently disabled the
 * production clone-role guard -- it would answer "not a checkout" and stop
 * refusing, with nothing going red.
 *
 * These cases are recorded from the Python oracle, so the staging keeps BOTH
 * marker sets and maps them case-for-case: a tree Python reads as Mirror Mind
 * gets a `mirror-core` manifest, a tree it reads as structurally-a-project-
 * but-not-ours gets a manifest under another name, and a tree it does not
 * recognize at all gets no manifest. The recorded decisions therefore stay
 * exactly as Python produced them, and plateau 3 deletes the Python half of
 * the staging rather than re-recording the matrix.
 */
function stageTree(root: string, tree: CloneRoleCase["tree"]): void {
  mkdirSync(root, { recursive: true });
  const pyproject =
    tree.pyproject !== null ? tree.pyproject : tree.src_memory ? MIRROR_PYPROJECT : null;
  if (pyproject !== null) writeFileSync(join(root, "pyproject.toml"), pyproject, "utf8");
  if (tree.src_memory) mkdirSync(join(root, "src", "memory"), { recursive: true });

  // Structural for Python == both markers present. Ours == both of ours.
  if (pyproject !== null && tree.src_memory) {
    stageMirrorPackage(root, {
      name: pyproject.includes('name = "mirror"') ? undefined : "something-else",
    });
  }
  if (tree.git) {
    const result = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, `git init failed: ${result.stderr}`);
  }
  if (tree.marker) writeFileSync(join(root, ".mirror-clone-role"), `${tree.marker}\n`, "utf8");
}

test("every recorded clone-role decision matches Python, bytes and exit code", () => {
  assert.ok(cases.length >= 8, "expected the recorded clone-role matrix");
  for (const entry of cases) {
    // RESOLVED, like the generator's `Path(...).resolve()`. On macOS `/var` is a
    // symlink to `/private/var`, so `git rev-parse --show-toplevel` answers with
    // the real path while `mkdtemp` returns the symlinked one -- and the marker
    // path in the message would then survive substitution as `/private<ROOT>`.
    const root = realpathSync(mkdtempSync(join(tmpdir(), "clone-role-ts-")));
    try {
      stageTree(root, entry.tree);
      const outcome = inspectBuilderCloneRole(entry.with_project ? root : null, {
        ignoreProductionRole: entry.ignore_production_role,
        // Python reads `Path.cwd()` when the journey has no project path; the
        // generator chdir'd into the staged root, and this is the same input
        // without mutating the test process's working directory.
        currentDirectory: root,
      });

      const stderr = (outcome?.stderr ?? "").replaceAll(root, "<ROOT>");
      assert.equal(stderr, entry.stderr, `${entry.name} stderr`);
      assert.equal(outcome?.exitCode ?? null, entry.exit_code, `${entry.name} exit code`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("the guard survives the deletion of src/memory -- the regression TS5 exists to avoid", () => {
  // The defect this pins, found by TS5's inventory and never reached by any
  // earlier test: `isMirrorMindCheckout` used to require `pyproject.toml` AND
  // `src/memory/`. Deleting the Python core at plateau 3 would have made it
  // answer "not a checkout" everywhere, and `inspectBuilderCloneRole` returns
  // null for a non-checkout -- so the production clone-role refusal would have
  // vanished silently. Nothing would have gone red: the guard has no output
  // when it decides it has nothing to say.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "clone-role-post-python-")));
  try {
    // A plateau-3 tree: no pyproject, no src/memory, just the TypeScript
    // package and a production marker.
    stageMirrorPackage(root);
    spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
    writeFileSync(join(root, ".mirror-clone-role"), "production\n", "utf8");

    assert.equal(isMirrorMindCheckout(root), true, "still recognized with no Python present");

    const outcome = inspectBuilderCloneRole(root);
    assert.equal(outcome?.exitCode, 2, "and still refuses a production clone");
    assert.match(outcome?.stderr ?? "", /production/iu);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a tree with the Python markers but no TypeScript package is not a checkout", () => {
  // The other direction, so the move is a MOVE and not an addition: after D1
  // the pyproject alone decides nothing. This is what makes plateau 3's
  // deletion a no-op for the guard rather than a behavior change.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "clone-role-python-only-")));
  try {
    writeFileSync(join(root, "pyproject.toml"), MIRROR_PYPROJECT, "utf8");
    mkdirSync(join(root, "src", "memory"), { recursive: true });

    assert.equal(isMirrorMindCheckout(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the matrix covers refusal, override, and silence, or it grades one branch", () => {
  // A corpus of eight cases that all refuse would still pass the loop above.
  const refusals = cases.filter((entry) => entry.exit_code === 2);
  const silent = cases.filter((entry) => entry.exit_code === null && entry.stderr === "");
  const overrides = cases.filter((entry) => entry.exit_code === null && entry.stderr !== "");

  assert.ok(refusals.length >= 4, "refusals");
  assert.ok(silent.length >= 3, "silent passes");
  assert.equal(overrides.length, 1, "the --ignore-production-role warning");
  // The override is a DOWNGRADE, not a skip: it prints and continues.
  assert.match(overrides[0]?.stderr ?? "", /Production clone override/u);
});

test("the checkout walk stops at the first candidate, whatever it answers", () => {
  // Python's loop `continue`s only while a directory lacks both markers; the
  // first directory holding `pyproject.toml` AND `src/memory` decides, even when
  // its pyproject belongs to another project. A port that kept climbing would
  // find THIS repository from anywhere beneath it and refuse on its marker.
  const root = mkdtempSync(join(tmpdir(), "clone-role-walk-"));
  try {
    stageTree(root, { pyproject: MIRROR_PYPROJECT, src_memory: true, git: false, marker: null });
    const inner = join(root, "vendor", "other");
    mkdirSync(join(inner, "src", "memory"), { recursive: true });
    writeFileSync(join(inner, "pyproject.toml"), '[project]\nname = "other"\n', "utf8");
    stageMirrorPackage(inner, { name: "other" });

    assert.equal(isMirrorMindCheckout(root), true, "the outer tree is Mirror Mind");
    assert.equal(isMirrorMindCheckout(inner), false, "the inner one decides for itself");
    // And a directory between them walks up to the first candidate, which is the
    // outer one.
    const between = join(root, "vendor");
    mkdirSync(between, { recursive: true });
    assert.equal(isMirrorMindCheckout(between), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
