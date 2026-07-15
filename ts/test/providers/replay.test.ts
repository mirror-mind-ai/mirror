import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadReplayFixture } from "../../src/providers/replay.ts";

test("loadReplayFixture returns deterministic scrubbed fixture data without network", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mirror-provider-replay-"));
  const path = join(dir, "embedding.fixture.json");
  await writeFile(
    path,
    JSON.stringify({
      kind: "embedding",
      request: { model: "openai/text-embedding-3-small", input_sha256: "abc123" },
      response: { embedding: [0.1, 0.2, 0.3] },
    }),
  );

  const fixture = await loadReplayFixture(path, { secrets: ["sk-env-secret"] });

  assert.deepEqual(fixture, {
    kind: "embedding",
    request: { model: "openai/text-embedding-3-small", input_sha256: "abc123" },
    response: { embedding: [0.1, 0.2, 0.3] },
  });
});

test("loadReplayFixture rejects unsafe recorded provider data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mirror-provider-replay-"));
  const path = join(dir, "unsafe.fixture.json");
  await writeFile(
    path,
    JSON.stringify({
      request: { headers: { Authorization: "Bearer sk-env-secret" } },
      response: { text: "ok" },
    }),
  );

  await assert.rejects(
    () => loadReplayFixture(path, { secrets: ["sk-env-secret"] }),
    /unsafe fixture/i,
  );
});
