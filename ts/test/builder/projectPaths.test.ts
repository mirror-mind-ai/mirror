// CR082 — one core says where a path is in the project, and each caller keeps its reading.
//
// `displayPath` names a path on a surface: relative, `.` for the project root, and the
// path as given outside the project. The Delivery Story Done preflight names a roadmap
// file in a refusal: relative in POSIX form, and it refuses the root and a path outside,
// as it did before it shared the core.

import assert from "node:assert/strict";
import { join, relative } from "node:path";
import test from "node:test";

import { relativeOrRefuse } from "#builder/deliveryStoryRoadmapClosure.ts";
import { displayPath, projectRelative } from "#builder/projectPaths.ts";

const ROOT = "/tmp/a-project";

test("the core answers the relation, empty for the root, and none outside the project", () => {
  assert.equal(
    projectRelative(join(ROOT, "docs/project/roadmap/cv1"), ROOT),
    join("docs/project/roadmap/cv1"),
  );
  assert.equal(projectRelative(ROOT, ROOT), "");
  assert.equal(projectRelative(`${ROOT}/`, ROOT), "");
  assert.equal(projectRelative("/tmp/another/docs", ROOT), null);
  assert.equal(projectRelative("/tmp/a-project-sibling/docs", ROOT), null);
});

test("the core resolves both sides, so a relative root and an absolute path agree", () => {
  const root = relative(process.cwd(), ROOT);
  assert.equal(projectRelative(join(ROOT, "docs/plan.md"), root), join("docs/plan.md"));
  assert.equal(projectRelative(join(root, "docs/plan.md"), ROOT), join("docs/plan.md"));
});

test("a surface prints `.` for the root and the path as given outside the project", () => {
  assert.equal(displayPath(join(ROOT, "docs/plan.md"), ROOT), join("docs/plan.md"));
  assert.equal(displayPath(ROOT, ROOT), ".");
  assert.equal(
    displayPath("/tmp/elsewhere/../another/plan.md", ROOT),
    "/tmp/elsewhere/../another/plan.md",
  );
  assert.equal(displayPath(join(ROOT, "docs/plan.md"), null), join(ROOT, "docs/plan.md"));
});

test("the Done preflight names a roadmap file in POSIX form, and refuses the root and outside", () => {
  assert.equal(
    relativeOrRefuse(join(ROOT, "docs", "project", "roadmap", "cv1", "index.md"), ROOT),
    "docs/project/roadmap/cv1/index.md",
  );
  for (const path of [ROOT, "/tmp/another/index.md"]) {
    assert.throws(
      () => relativeOrRefuse(path, ROOT),
      new Error(
        `roadmap file ${path} is not inside the project at ${ROOT}; ` +
          "refusing to name a path outside the project in a closure refusal",
      ),
      path,
    );
  }
});
