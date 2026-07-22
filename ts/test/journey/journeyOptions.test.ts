import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  groupJourneysByParent,
  type JourneyIdentityRow,
  type JourneyOption,
  listJourneyOptions,
} from "../../src/journey/journeyOptions.ts";

test("groupJourneysByParent splits roots and children and treats orphan parents as roots", () => {
  const items = [
    { id: "a", parent_journey: "" },
    { id: "b", parent_journey: "a" },
    { id: "c", parent_journey: "a" },
    { id: "d", parent_journey: "missing" }, // parent absent -> root
  ];
  const { roots, childrenByParent } = groupJourneysByParent(items);
  assert.deepEqual(
    roots.map((r) => r.id),
    ["a", "d"],
  );
  assert.deepEqual(
    (childrenByParent.get("a") ?? []).map((r) => r.id),
    ["b", "c"],
  );
  assert.equal(childrenByParent.get("missing"), undefined);
});

test("listJourneyOptions reads parent_journey from both the old Python dialect and the new canonical form", () => {
  // read-tolerance: the old json.dumps byte-dialect (sorted keys, spaced) and
  // the new canonical JSON.stringify form must parse to the same parent.
  const oldDialect = '{"parent_journey": "root", "project_path": "/p"}';
  const canonical = '{"project_path":"/p","parent_journey":"root"}';
  const rows: JourneyIdentityRow[] = [
    { key: "root", content: "# Root" },
    { key: "a", content: "# A", metadata: oldDialect },
    { key: "b", content: "# B", metadata: canonical },
  ];
  const byId = new Map(listJourneyOptions(rows).map((option) => [option.id, option]));
  assert.equal(byId.get("a")?.parent_journey, "root");
  assert.equal(byId.get("b")?.parent_journey, "root");
});

interface JourneysGolden {
  journey_rows: JourneyIdentityRow[];
  expected: JourneyOption[];
  expected_order: string[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "journeys.golden.json");
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as JourneysGolden;

test("journeys golden is well-formed", () => {
  assert.ok(golden.journey_rows.length > 0, "corpus has journey rows");
  assert.equal(golden.expected.length, golden.expected_order.length);
});

test("TS listJourneyOptions reproduces the Python oracle options and order", () => {
  const actual = listJourneyOptions(golden.journey_rows);
  assert.deepEqual(actual, golden.expected);
  assert.deepEqual(
    actual.map((option) => option.id),
    golden.expected_order,
  );
});

test("name is derived from the first content line, stripping leading '# '", () => {
  const [option] = listJourneyOptions([
    { key: "j1", content: "##  My Journey\n**Status:** active" },
  ]);
  assert.equal(option.name, "My Journey");
});

test("status defaults to 'unknown' when no **Status:** marker is present", () => {
  const [option] = listJourneyOptions([{ key: "j1", content: "# Nameless" }]);
  assert.equal(option.status, "unknown");
});

test("falls back to the key when the content has no usable first line", () => {
  const [option] = listJourneyOptions([{ key: "j1", content: "" }]);
  assert.equal(option.name, "j1");
});

test("active roots sort before non-active, then by lowercased name", () => {
  const rows: JourneyIdentityRow[] = [
    { key: "b", content: "# Bravo\n**Status:** completed" },
    { key: "a", content: "# alpha\n**Status:** active" },
    { key: "c", content: "# Charlie\n**Status:** active" },
  ];
  assert.deepEqual(
    listJourneyOptions(rows).map((option) => option.id),
    ["a", "c", "b"],
  );
});

test("children are grouped under their root and sorted the same way", () => {
  const rows: JourneyIdentityRow[] = [
    { key: "root", content: "# Root\n**Status:** active" },
    {
      key: "child-z",
      content: "# Zeta Child\n**Status:** active",
      metadata: JSON.stringify({ parent_journey: "root" }),
    },
    {
      key: "child-a",
      content: "# Alpha Child\n**Status:** active",
      metadata: JSON.stringify({ parent_journey: "root" }),
    },
  ];
  assert.deepEqual(
    listJourneyOptions(rows).map((option) => option.id),
    ["root", "child-a", "child-z"],
  );
});

test("a child whose parent is absent is treated as a root", () => {
  const rows: JourneyIdentityRow[] = [
    {
      key: "orphan",
      content: "# Orphan\n**Status:** active",
      metadata: JSON.stringify({ parent_journey: "missing" }),
    },
  ];
  const options = listJourneyOptions(rows);
  assert.equal(options.length, 1);
  assert.equal(options[0].parent_journey, "missing");
});

test("malformed metadata yields an empty parent without throwing", () => {
  const [option] = listJourneyOptions([
    { key: "j1", content: "# J\n**Status:** active", metadata: "{not json" },
  ]);
  assert.equal(option.parent_journey, "");
});
