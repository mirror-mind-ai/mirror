import { readFile } from "node:fs/promises";

import { assertFixtureSafe, type RedactionOptions } from "./redaction.ts";

export type ReplayFixture = unknown;

export async function loadReplayFixture(
  path: string,
  options: RedactionOptions = {},
): Promise<ReplayFixture> {
  const raw = await readFile(path, "utf8");
  const fixture = JSON.parse(raw) as ReplayFixture;
  assertFixtureSafe(fixture, options);
  return fixture;
}
