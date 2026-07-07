import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  type JourneyIdentityRow,
  type JourneyOption,
  listJourneyOptions,
} from "../../src/journey/journeyOptions.ts";

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
