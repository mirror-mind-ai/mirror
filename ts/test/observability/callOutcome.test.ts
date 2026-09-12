import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { consolidateScan, shadowScan } from "#cultivation/scan.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { embeddingToBytes } from "#db/decode.ts";
import {
  createConsolidationsTable,
  createMemoriesTable,
  insertMemory,
} from "#helpers/cultivationSchema.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { runReception } from "#mirror/reception.ts";
import {
  CallOutcomeTally,
  classifyProviderError,
  formatCallOutcome,
  type ProviderCallReport,
} from "#observability/callOutcome.ts";
import { ProviderConfigError } from "#providers/config.ts";
import { type LlmProvider, ReplayLlmProvider } from "#providers/llm.ts";
import { LlmTransportError } from "#providers/openrouter.ts";

/**
 * CV22.DS8.US3 plateau 5 — the outcome seam.
 *
 * Three leaves swallow every failure, faithfully: Python returns `None`/`[]`/
 * an empty result for a transport error, for unusable output, and for an
 * honest "nothing to say" alike. That parity is correct, and it means a live
 * run can spend real money, report "no proposals found", and be
 * indistinguishable from a healthy run that genuinely found nothing.
 *
 * These tests pin the distinction the swallow destroys.
 */

const NOW = "2026-09-11T12:00:00.000000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-outcome-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createMemoriesTable(db);
  createConsolidationsTable(db);
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function twoSimilarMemories(db: WritableDatabase): void {
  insertMemory(db, { id: "m1", createdAt: NOW, embedding: embeddingToBytes([1, 0, 0, 0]) });
  insertMemory(db, { id: "m2", createdAt: NOW, embedding: embeddingToBytes([0.99, 0.01, 0, 0]) });
}

function failingProvider(error: unknown): LlmProvider {
  return {
    complete: async () => {
      throw error;
    },
  };
}

async function scanOutcomes(
  db: WritableDatabase,
  provider: LlmProvider,
): Promise<ProviderCallReport[]> {
  const reports: ProviderCallReport[] = [];
  await consolidateScan(db, {
    provider,
    id: () => "c1",
    nowIso: () => NOW,
    onOutcome: (report) => reports.push(report),
  });
  return reports;
}

test("the four ways a scan can produce nothing are four different outcomes", async () => {
  const cases: [string, LlmProvider, ProviderCallReport][] = [
    [
      "the provider never answered",
      failingProvider(new LlmTransportError("rate_limit", "429")),
      { outcome: "transport_failed", kind: "rate_limit" },
    ],
    [
      "the model answered with prose",
      new ReplayLlmProvider({ kind: "llm", responses: { consolidation: "I am not JSON." } }),
      { outcome: "parse_failed" },
    ],
    [
      "the model proposed an action outside the allowlist",
      new ReplayLlmProvider({
        kind: "llm",
        responses: {
          consolidation: JSON.stringify({ action: "delete_everything", proposed_content: "x" }),
        },
      }),
      { outcome: "empty" },
    ],
    [
      "the model proposed a real merge",
      new ReplayLlmProvider({
        kind: "llm",
        responses: { consolidation: JSON.stringify({ action: "merge", proposed_content: "one" }) },
      }),
      { outcome: "answered" },
    ],
  ];

  for (const [label, provider, expected] of cases) {
    const { db, cleanup } = tempDb();
    try {
      twoSimilarMemories(db);
      assert.deepEqual(await scanOutcomes(db, provider), [expected], label);
    } finally {
      cleanup();
    }
  }
});

test("a missing key is config, not a mysterious absence of proposals", async () => {
  const { db, cleanup } = tempDb();
  try {
    twoSimilarMemories(db);

    assert.deepEqual(await scanOutcomes(db, failingProvider(new ProviderConfigError("no key"))), [
      { outcome: "transport_failed", kind: "config" },
    ]);
  } finally {
    cleanup();
  }
});

test("shadow scan separates an empty list from an unusable response", async () => {
  for (const [response, expected] of [
    ["[]", "empty"],
    ["not json at all", "parse_failed"],
    ['[{"observation": "A pattern.", "memory_ids": []}]', "answered"],
  ] as const) {
    const { db, cleanup } = tempDb();
    try {
      insertMemory(db, {
        id: "s1",
        createdAt: NOW,
        layer: "shadow",
        embedding: embeddingToBytes([1, 0, 0, 0]),
      });
      const reports: ProviderCallReport[] = [];
      await shadowScan(db, {
        provider: new ReplayLlmProvider({ kind: "llm", responses: { shadow_scan: response } }),
        id: () => "o1",
        nowIso: () => NOW,
        onOutcome: (report) => reports.push(report),
      });

      assert.deepEqual(reports, [{ outcome: expected }], response);
    } finally {
      cleanup();
    }
  }
});

test("reception distinguishes an outage from an unroutable message", async () => {
  const personas = [{ slug: "engineer", description: "code", routingKeywords: [] }];

  const seen: ProviderCallReport[] = [];
  await runReception(
    "q",
    personas,
    [],
    failingProvider(new LlmTransportError("timeout", "slow")),
    undefined,
    (report) => seen.push(report),
  );
  await runReception(
    "q",
    personas,
    [],
    new ReplayLlmProvider({ kind: "llm", responses: { reception: "sorry, I cannot" } }),
    undefined,
    (report) => seen.push(report),
  );
  await runReception(
    "q",
    personas,
    [],
    new ReplayLlmProvider({ kind: "llm", responses: { reception: "{}" } }),
    undefined,
    (report) => seen.push(report),
  );
  await runReception(
    "q",
    personas,
    [],
    new ReplayLlmProvider({
      kind: "llm",
      responses: { reception: JSON.stringify({ personas: ["engineer"] }) },
    }),
    undefined,
    (report) => seen.push(report),
  );

  assert.deepEqual(seen, [
    { outcome: "transport_failed", kind: "timeout" },
    { outcome: "parse_failed" },
    { outcome: "empty" },
    { outcome: "answered" },
  ]);
});

test("a zero-proposal run is legible as healthy or broken, not merely as zero", () => {
  // The property the live smoke depends on. Both runs below produce no
  // proposals and the same ledger row count; a count-based verdict passes
  // both. This is the US2 false start -- "exit 0, clean report, zero live
  // calls" -- caught one story earlier.
  const healthy = new CallOutcomeTally();
  for (const _ of [1, 2, 3]) healthy.record({ outcome: "empty" });

  const broken = new CallOutcomeTally();
  for (const _ of [1, 2, 3]) broken.record({ outcome: "parse_failed" });

  assert.equal(healthy.summary(), "calls=3 empty=3");
  assert.equal(broken.summary(), "calls=3 parse_failed=3");
});

test("the tally reports the fan-out, in a stable order", () => {
  const tally = new CallOutcomeTally();
  tally.record({ outcome: "parse_failed" });
  tally.record({ outcome: "answered" });
  tally.record({ outcome: "transport_failed", kind: "auth" });
  tally.record({ outcome: "answered" });

  assert.equal(tally.calls, 4);
  assert.equal(tally.summary(), "calls=4 answered=2 parse_failed=1 transport_failed=1");
});

test("the tally names the transport-failure classes behind transport_failed=N", () => {
  const tally = new CallOutcomeTally();
  tally.record({ outcome: "transport_failed", kind: "timeout" });
  tally.record({ outcome: "answered" });
  tally.record({ outcome: "transport_failed", kind: "rate_limit" });
  tally.record({ outcome: "transport_failed", kind: "timeout" });
  tally.record({ outcome: "transport_failed" });

  assert.equal(tally.failureKinds(), "rate_limit=1 timeout=2 unknown=1");
  // The pinned summary line is unchanged by the new view.
  assert.equal(tally.summary(), "calls=5 answered=1 transport_failed=4");
  assert.equal(new CallOutcomeTally().failureKinds(), "");
});

test("the log line carries the class and never a message", () => {
  assert.equal(
    formatCallOutcome("consolidation", { outcome: "transport_failed", kind: "rate_limit" }),
    "consolidation outcome=transport_failed kind=rate_limit",
  );
  assert.equal(formatCallOutcome("reception", { outcome: "empty" }), "reception outcome=empty");
  assert.equal(
    classifyProviderError(new LlmTransportError("auth", "sk-or-v1-secret is revoked")),
    "auth",
    "the class, never the provider's words",
  );
  assert.equal(classifyProviderError(new Error("boom")), "unknown");
});
