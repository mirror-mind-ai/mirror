import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDescriptorList } from "../../src/frontDoor/render/descriptor.ts";

test("renderDescriptorList reports no descriptors stored", () => {
  assert.equal(renderDescriptorList([]), "No descriptors stored.\n");
});

test("renderDescriptorList renders each row as header, indented body, blank line", () => {
  const rendered = renderDescriptorList([
    { layer: "ego", key: "behavior", descriptor: "How I act." },
    { layer: "persona", key: "engineer", descriptor: "Ships code." },
  ]);
  assert.equal(
    rendered,
    "[ego/behavior]\n" +
      "  How I act.\n" +
      "\n" +
      "[persona/engineer]\n" +
      "  Ships code.\n" +
      "\n",
  );
});
