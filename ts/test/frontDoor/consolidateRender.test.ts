import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ConsolidationRow,
  CultivationMemoryWithEmbedding,
} from "../../src/cultivation/consolidationStore.ts";
import type { ConsolidateScanResult } from "../../src/cultivation/scan.ts";
import type { ConsolidateApplyOutcome } from "../../src/frontDoor/cultivationRoute.ts";
import {
  renderConsolidateApply,
  renderConsolidateList,
  renderConsolidateReject,
  renderConsolidateRejected,
  renderConsolidateScan,
} from "../../src/frontDoor/render/consolidate.ts";

function row(overrides: Partial<ConsolidationRow> = {}): ConsolidationRow {
  return {
    id: "abcd1234ef56",
    action: "identity_update",
    proposal: "A surfaced pattern.",
    result: null,
    source_memory_ids: JSON.stringify(["m1", "m2"]),
    target_layer: "ego",
    target_key: "behavior",
    rationale: "seen across conversations",
    status: "pending",
    created_at: "2026-01-15T00:00:00.000000Z",
    reviewed_at: null,
    ...overrides,
  };
}

function mem(
  overrides: Partial<CultivationMemoryWithEmbedding> = {},
): CultivationMemoryWithEmbedding {
  return {
    id: "m1abcdef",
    memory_type: "insight",
    layer: "ego",
    title: "Memory title",
    content: "content",
    context: null,
    journey: null,
    created_at: "2026-01-10T00:00:00.000000Z",
    readiness_state: "observed",
    embedding_b64: "AAAAAA==",
    ...overrides,
  };
}

// --- list ----------------------------------------------------------------------

test("renderConsolidateList: empty with no status filter", () => {
  assert.equal(renderConsolidateList([], null), "No consolidations found.\n");
});

test("renderConsolidateList: empty with a status filter", () => {
  assert.equal(renderConsolidateList([], "pending"), "No consolidations found (pending).\n");
});

test("renderConsolidateList: one row with target and rationale", () => {
  const rendered = renderConsolidateList([row()], null);
  assert.equal(
    rendered,
    "⏳ [abcd1234] 2026-01-15  🧬 identity_update → ego/behavior  (2 memories)\n" +
      "   seen across conversations\n",
  );
});

test("renderConsolidateList: merge action icon, no target, no rationale", () => {
  const rendered = renderConsolidateList(
    [
      row({
        action: "merge",
        target_layer: null,
        target_key: null,
        rationale: null,
        status: "accepted",
      }),
    ],
    null,
  );
  assert.equal(rendered, "✓ [abcd1234] 2026-01-15  🔀 merge  (2 memories)\n");
});

test("renderConsolidateList: shadow_candidate action icon and rejected status", () => {
  const rendered = renderConsolidateList(
    [
      row({
        action: "shadow_candidate",
        target_layer: null,
        target_key: null,
        rationale: null,
        status: "rejected",
      }),
    ],
    null,
  );
  assert.equal(rendered, "✗ [abcd1234] 2026-01-15  🌑 shadow_candidate  (2 memories)\n");
});

// --- reject ----------------------------------------------------------------------

test("renderConsolidateRejected", () => {
  assert.equal(
    renderConsolidateRejected(row()),
    "Proposal [abcd1234] rejected. Source memories unchanged.\n",
  );
});

test("renderConsolidateReject: not_found/already_reviewed/rejected", () => {
  assert.deepEqual(renderConsolidateReject({ kind: "not_found", proposalId: "zzz" }), {
    text: "Error: proposal 'zzz' not found.\n",
    stderr: true,
    exitCode: 1,
  });
  assert.deepEqual(
    renderConsolidateReject({
      kind: "already_reviewed",
      consolidation: row({ status: "accepted" }),
    }),
    { text: "Proposal abcd1234 is already 'accepted'.\n", stderr: false, exitCode: 0 },
  );
  assert.deepEqual(renderConsolidateReject({ kind: "rejected", consolidation: row() }), {
    text: "Proposal [abcd1234] rejected. Source memories unchanged.\n",
    stderr: false,
    exitCode: 0,
  });
});

// --- apply -------------------------------------------------------------------------

test("renderConsolidateApply: not_found -> stderr, exit 1", () => {
  const rendered = renderConsolidateApply({ kind: "not_found", proposalId: "zzz" });
  assert.deepEqual(rendered, {
    text: "Error: proposal 'zzz' not found.\n",
    stderr: true,
    exitCode: 1,
  });
});

test("renderConsolidateApply: already_reviewed -> stdout, exit 0, no brackets around the id", () => {
  const rendered = renderConsolidateApply({
    kind: "already_reviewed",
    consolidation: row({ status: "accepted" }),
  });
  assert.deepEqual(rendered, {
    text: "Proposal abcd1234 is already 'accepted'.\n",
    stderr: false,
    exitCode: 0,
  });
});

test("renderConsolidateApply: identity_missing_target -> stderr, exit 1", () => {
  const rendered = renderConsolidateApply({ kind: "identity_missing_target" });
  assert.deepEqual(rendered, {
    text: "Error: identity_update proposal has no target_layer/target_key.\n",
    stderr: true,
    exitCode: 1,
  });
});

test("renderConsolidateApply: identity_refused -> stderr, exit 1, exact allowlist message", () => {
  const rendered = renderConsolidateApply({
    kind: "identity_refused",
    message:
      "Refusing identity_update to layer 'shadow': not in the consolidation allowlist ['ego', 'self'].",
  });
  assert.deepEqual(rendered, {
    text: "Error: Refusing identity_update to layer 'shadow': not in the consolidation allowlist ['ego', 'self'].\n",
    stderr: true,
    exitCode: 1,
  });
});

test("renderConsolidateApply: merge_source_not_found -> stderr, exit 1", () => {
  const rendered = renderConsolidateApply({ kind: "merge_source_not_found" });
  assert.deepEqual(rendered, {
    text: "Error: source memory not found.\n",
    stderr: true,
    exitCode: 1,
  });
});

test("renderConsolidateApply: applied identity_update", () => {
  const outcome: ConsolidateApplyOutcome = {
    kind: "applied",
    action: "identity_update",
    consolidation: row(),
    resultContent: "content",
    identityUpdate: { targetLayer: "ego", targetKey: "behavior", sourceMemoryIds: ["m1", "m2"] },
  };
  const rendered = renderConsolidateApply(outcome);
  assert.deepEqual(rendered, {
    text:
      "✓ Updated identity: ego/behavior\n" +
      "  Source memories (2) advanced to 'acknowledged'.\n" +
      "\nProposal [abcd1234] marked as accepted.\n",
    stderr: false,
    exitCode: 0,
  });
});

test("renderConsolidateApply: applied merge", () => {
  const outcome: ConsolidateApplyOutcome = {
    kind: "applied",
    action: "merge",
    consolidation: row({ action: "merge" }),
    resultContent: "content",
    merge: {
      mergedMemoryId: "ffeeddcc9988",
      mergedTitle: "[merged] Original",
      sourceMemoryIds: ["m1", "m2"],
    },
  };
  const rendered = renderConsolidateApply(outcome);
  assert.deepEqual(rendered, {
    text:
      "✓ Created merged memory: [ffeeddcc] [merged] Original\n" +
      "  Source memories (2) marked as 'integrated'.\n" +
      "\nProposal [abcd1234] marked as accepted.\n",
    stderr: false,
    exitCode: 0,
  });
});

test("renderConsolidateApply: applied shadow_candidate", () => {
  const outcome: ConsolidateApplyOutcome = {
    kind: "applied",
    action: "shadow_candidate",
    consolidation: row({ action: "shadow_candidate" }),
    resultContent: "content",
    shadowCandidate: { sourceMemoryIds: ["m1", "m2"] },
  };
  const rendered = renderConsolidateApply(outcome);
  assert.deepEqual(rendered, {
    text:
      "✓ Shadow candidate accepted. 2 memories advanced to 'candidate'.\n" +
      "  Run mm-shadow to surface these in the next shadow review pass.\n" +
      "\nProposal [abcd1234] marked as accepted.\n",
    stderr: false,
    exitCode: 0,
  });
});

test("renderConsolidateApply: applied with an unrecognized action -- Python's silent fallthrough (no branch text, just the shared line)", () => {
  const outcome: ConsolidateApplyOutcome = {
    kind: "applied",
    action: "shadow_observation",
    consolidation: row({ action: "shadow_observation" }),
    resultContent: "content",
  };
  const rendered = renderConsolidateApply(outcome);
  assert.deepEqual(rendered, {
    text: "\nProposal [abcd1234] marked as accepted.\n",
    stderr: false,
    exitCode: 0,
  });
});

// --- scan -------------------------------------------------------------------------

test("renderConsolidateScan: no memories with embeddings", () => {
  const result: ConsolidateScanResult = { memoriesScanned: 0, results: [] };
  assert.equal(
    renderConsolidateScan(result, 0.75),
    "No memories with embeddings found for the given filters.\n",
  );
});

test("renderConsolidateScan: memories but no clusters above threshold", () => {
  const result: ConsolidateScanResult = { memoriesScanned: 3, results: [] };
  assert.equal(
    renderConsolidateScan(result, 0.75),
    "Scanning 3 memories (threshold=0.75)...\n" +
      "No clusters found above the similarity threshold.\n" +
      "Try lowering --threshold (current: 0.75).\n",
  );
});

test("renderConsolidateScan: one cluster, one created proposal, full footer", () => {
  const cluster = [
    mem({
      id: "m1abcdef",
      title: "First",
      memory_type: "insight",
      layer: "ego",
      created_at: "2026-01-10T00:00:00.000000Z",
    }),
  ];
  const proposal = row({
    id: "propid12",
    target_layer: "ego",
    target_key: "behavior",
    rationale: "why",
  });
  const result: ConsolidateScanResult = { memoriesScanned: 2, results: [{ cluster, proposal }] };
  const rendered = renderConsolidateScan(result, 0.75);
  const bar = "─".repeat(60);
  assert.equal(
    rendered,
    "Scanning 2 memories (threshold=0.75)...\n" +
      "Found 1 cluster(s). Generating proposals...\n\n" +
      `\n${bar}\n` +
      "Proposal 1/1  [propid12]  🧬 IDENTITY_UPDATE\n" +
      `${bar}\n` +
      "\n**Source memories:**\n" +
      "  • [m1abcdef] First  (insight/ego, 2026-01-10)\n" +
      "\n**Target:** `ego/behavior`\n" +
      "\n**Rationale:** why\n" +
      "\n**Proposed content:**\nA surfaced pattern.\n" +
      "\n" +
      "\n1 proposal(s) created with status='pending'.\n" +
      "Review each proposal above, then:\n" +
      "  Accept:  python -m memory consolidate apply <proposal_id>\n" +
      '  Edit:    python -m memory consolidate apply <proposal_id> --content "revised text"\n' +
      "  Reject:  python -m memory consolidate reject <proposal_id>\n" +
      "  List all: python -m memory consolidate list\n",
  );
});

test("renderConsolidateScan: a cluster with no valid proposal is reported and skipped, index counts only created ones", () => {
  const clusterA = [mem({ id: "a1" }), mem({ id: "a2" })];
  const clusterB = [mem({ id: "b1" })];
  const proposalB = row({ id: "created1" });
  const result: ConsolidateScanResult = {
    memoriesScanned: 3,
    results: [
      { cluster: clusterA, proposal: null },
      { cluster: clusterB, proposal: proposalB },
    ],
  };
  const rendered = renderConsolidateScan(result, 0.75);
  assert.match(rendered, /Found 2 cluster\(s\)\. Generating proposals\.\.\./);
  assert.match(rendered, /⚠ LLM returned no valid proposal for cluster of 2 memories\./);
  // The successfully-created proposal is index 1 of TOTAL 2 (clusters attempted), not 2 of 2.
  assert.match(rendered, /Proposal 1\/2\s+\[created1\]/);
  assert.match(rendered, /1 proposal\(s\) created with status='pending'\./);
});

test("renderConsolidateScan: every cluster fails -> 'No proposals were generated.'", () => {
  const cluster = [mem({ id: "a1" }), mem({ id: "a2" })];
  const result: ConsolidateScanResult = {
    memoriesScanned: 2,
    results: [{ cluster, proposal: null }],
  };
  const rendered = renderConsolidateScan(result, 0.75);
  assert.match(rendered, /No proposals were generated\.\n$/);
});
