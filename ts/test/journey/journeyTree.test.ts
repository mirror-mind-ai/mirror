// CV24.DS3 — the Journey tree a host renders.
//
// The rules are the removed `journey export-registry`'s, so a host's sidebar
// reads the same on the day it moves to this core: names from `display_name`,
// then the first `# ` heading, then the key; siblings by `sibling_position`,
// then by key. Unlike the export, malformed data does not fail the read: the
// tree falls back deterministically and names what it read around.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildJourneyTree,
  type JourneyTreeNode,
  type JourneyTreeRow,
} from "#journey/journeyTree.ts";

function row(
  key: string,
  content: string,
  metadata: Record<string, unknown> | string | null = null,
): JourneyTreeRow {
  return {
    key,
    content,
    updated_at: `2026-10-28T00:00:0${key.length % 10}Z`,
    metadata:
      metadata === null ? null : typeof metadata === "string" ? metadata : JSON.stringify(metadata),
  };
}

function ids(nodes: readonly JourneyTreeNode[]): unknown[] {
  return nodes.map((node) => (node.children ? [node.id, ids(node.children)] : node.id));
}

function count(nodes: readonly JourneyTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + count(node.children ?? []), 0);
}

test("a node carries the export's fields, and only those present", () => {
  const { roots, findings } = buildJourneyTree([
    row(
      "alpha",
      "# Alpha Journey\n\n**Status:** active\n**Stage:** building\n\n## Description\n\nFirst   line\nsecond line.\n\n## Next\nignored",
      { project_path: "/p/alpha", sibling_position: 0 },
    ),
    row("bare", "no heading here"),
  ]);
  assert.deepEqual(findings, []);
  assert.deepEqual(roots[0], {
    id: "alpha",
    name: "Alpha Journey",
    updatedAt: "2026-10-28T00:00:05Z",
    description: "First line second line.",
    status: "active",
    stage: "building",
    projectPath: "/p/alpha",
    siblingPosition: 0,
  });
  assert.deepEqual(roots[1], { id: "bare", name: "bare", updatedAt: "2026-10-28T00:00:04Z" });
});

test("the name is display_name, then the first # heading, then the key", () => {
  const { roots } = buildJourneyTree([
    row("a-key", "# Heading A", { display_name: "Shown A" }),
    row("b-key", "intro\n## Not this\n# Heading B"),
    row("c-key", "## Only a subheading"),
  ]);
  assert.deepEqual(
    roots.map((node) => node.name),
    ["Shown A", "Heading B", "c-key"],
  );
});

test("a Portuguese description heading is read too, to the end of the content", () => {
  const { roots } = buildJourneyTree([
    row("pt", "# PT\n\n## Descrição\n\nUma travessia\n  longa."),
  ]);
  assert.equal(roots[0]?.description, "Uma travessia longa.");
});

test("siblings follow sibling_position, then key, with the unpositioned last", () => {
  const { roots, findings } = buildJourneyTree([
    row("root", "# Root"),
    row("z-first", "# Z", { parent_journey: "root", sibling_position: 0 }),
    row("a-second", "# A", { parent_journey: "root", sibling_position: 1 }),
    row("m-unpositioned", "# M", { parent_journey: "root" }),
    row("b-unpositioned", "# B", { parent_journey: "root" }),
    row("deep", "# Deep", { parent_journey: "z-first" }),
  ]);
  assert.deepEqual(findings, []);
  assert.deepEqual(ids(roots), [
    ["root", [["z-first", ["deep"]], "a-second", "b-unpositioned", "m-unpositioned"]],
  ]);
  assert.equal(roots[0]?.children?.[0]?.parentId, "root");
});

test("a parent that is not a Journey makes a root, and keeps its parentId", () => {
  const { roots } = buildJourneyTree([row("orphan", "# O", { parent_journey: "gone" })]);
  assert.deepEqual(ids(roots), ["orphan"]);
  assert.equal(roots[0]?.parentId, "gone");
});

test("malformed metadata is read as empty, as the export read it", () => {
  const { roots } = buildJourneyTree([
    row("bad", "# Bad", "{not json"),
    row("list", "# List", "[1,2]"),
  ]);
  assert.deepEqual(ids(roots), ["bad", "list"]);
});

test("a malformed sibling order falls back to key order and is named, not fatal", () => {
  for (const positions of [
    [1, 1],
    [-1, 0],
    [0.5, 1],
    [true, 0],
    ["1", 0],
  ]) {
    const { roots, findings } = buildJourneyTree([
      row("root", "# Root"),
      row("b", "# B", { parent_journey: "root", sibling_position: positions[1] }),
      row("a", "# A", { parent_journey: "root", sibling_position: positions[0] }),
    ]);
    assert.deepEqual(ids(roots), [["root", ["a", "b"]]], JSON.stringify(positions));
    assert.deepEqual(
      findings,
      [{ kind: "malformed_order", journeyId: "root" }],
      JSON.stringify(positions),
    );
  }
});

test("a cycle is shown once, from its smallest key, and named", () => {
  const { roots, findings } = buildJourneyTree([
    row("ok", "# Ok"),
    row("x", "# X", { parent_journey: "y" }),
    row("y", "# Y", { parent_journey: "x" }),
    row("hanger", "# H", { parent_journey: "y" }),
  ]);
  assert.deepEqual(ids(roots), ["ok", ["x", [["y", ["hanger"]]]]]);
  assert.deepEqual(findings, [{ kind: "malformed_hierarchy", journeyId: "x" }]);
  assert.equal(count(roots), 4);
});

test("a chain deeper than 16 is cut there, and its rest shown as a root", () => {
  const rows = [row("n00", "# 0")];
  for (let i = 1; i <= 20; i++) {
    rows.push(
      row(`n${String(i).padStart(2, "0")}`, `# ${i}`, {
        parent_journey: `n${String(i - 1).padStart(2, "0")}`,
      }),
    );
  }
  const { roots, findings } = buildJourneyTree(rows);
  assert.equal(count(roots), 21, "every Journey appears exactly once");
  assert.equal(roots.length, 2);
  assert.equal(roots[1]?.id, "n17");
  assert.deepEqual(findings, [{ kind: "malformed_hierarchy", journeyId: "n17" }]);
});
