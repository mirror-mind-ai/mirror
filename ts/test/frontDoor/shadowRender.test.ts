import assert from "node:assert/strict";
import { test } from "node:test";

import type { ConsolidationRow } from "../../src/cultivation/consolidationStore.ts";
import type { ShadowScanResult } from "../../src/cultivation/scan.ts";
import type { ShadowApplyRouteOutcome } from "../../src/frontDoor/cultivationRoute.ts";
import {
  renderShadowApply,
  renderShadowList,
  renderShadowReject,
  renderShadowRejected,
  renderShadowScan,
  renderShadowShow,
} from "../../src/frontDoor/render/shadow.ts";

function row(overrides: Partial<ConsolidationRow> = {}): ConsolidationRow {
  return {
    id: "obs12345abc",
    action: "shadow_observation",
    proposal: "A pattern.",
    result: null,
    source_memory_ids: JSON.stringify(["s1abcdef"]),
    target_layer: "shadow",
    target_key: "profile",
    rationale: "Pattern A",
    status: "pending",
    created_at: "2026-01-15T00:00:00.000000Z",
    reviewed_at: null,
    ...overrides,
  };
}

// --- list ----------------------------------------------------------------------

test("renderShadowList: empty with no status filter", () => {
  assert.equal(renderShadowList([], null), "No shadow observations found.\n");
});

test("renderShadowList: empty with a status filter", () => {
  assert.equal(renderShadowList([], "pending"), "No shadow observations found (pending).\n");
});

test("renderShadowList: one row, rationale used as the label", () => {
  assert.equal(
    renderShadowList([row()], null),
    "⏳ [obs12345] 2026-01-15  🌑 Pattern A  (1 memories)\n",
  );
});

test("renderShadowList: falls back to 'shadow observation' when rationale is absent", () => {
  assert.equal(
    renderShadowList([row({ rationale: null, status: "accepted" })], null),
    "✓ [obs12345] 2026-01-15  🌑 shadow observation  (1 memories)\n",
  );
});

// --- show ----------------------------------------------------------------------

test("renderShadowShow: empty layer", () => {
  assert.equal(
    renderShadowShow([]),
    "The structural shadow layer is empty.\n" +
      "Run 'python -m memory shadow scan' to surface candidate observations.\n",
  );
});

test("renderShadowShow: entries with the exact blank-line shape", () => {
  const rendered = renderShadowShow([{ key: "profile", content: "Confirmed pattern." }]);
  assert.equal(
    rendered,
    "Shadow layer (1 entries):\n" +
      "\n" +
      "=== shadow/profile ===\n" +
      "Confirmed pattern.\n" +
      "\n",
  );
});

// --- reject ----------------------------------------------------------------------

test("renderShadowRejected", () => {
  assert.equal(
    renderShadowRejected(row()),
    "Proposal [obs12345] rejected. Shadow layer unchanged.\n",
  );
});

test("renderShadowReject: not_found/already_reviewed/rejected", () => {
  assert.deepEqual(renderShadowReject({ kind: "not_found", proposalId: "zzz" }), {
    text: "Error: proposal 'zzz' not found.\n",
    stderr: true,
    exitCode: 1,
  });
  assert.deepEqual(
    renderShadowReject({ kind: "already_reviewed", consolidation: row({ status: "rejected" }) }),
    { text: "Proposal obs12345 is already 'rejected'.\n", stderr: false, exitCode: 0 },
  );
  assert.deepEqual(renderShadowReject({ kind: "rejected", consolidation: row() }), {
    text: "Proposal [obs12345] rejected. Shadow layer unchanged.\n",
    stderr: false,
    exitCode: 0,
  });
});

// --- apply -------------------------------------------------------------------------

test("renderShadowApply: not_found -> stderr, exit 1", () => {
  const outcome: ShadowApplyRouteOutcome = { kind: "not_found", proposalId: "zzz" };
  assert.deepEqual(renderShadowApply(outcome), {
    text: "Error: proposal 'zzz' not found.\n",
    stderr: true,
    exitCode: 1,
  });
});

test("renderShadowApply: already_reviewed -> stdout, exit 0", () => {
  const outcome: ShadowApplyRouteOutcome = {
    kind: "already_reviewed",
    consolidation: row({ status: "rejected" }),
  };
  assert.deepEqual(renderShadowApply(outcome), {
    text: "Proposal obs12345 is already 'rejected'.\n",
    stderr: false,
    exitCode: 0,
  });
});

test("renderShadowApply: wrong_action -> stderr, exit 1", () => {
  const outcome: ShadowApplyRouteOutcome = {
    kind: "wrong_action",
    consolidation: row({ action: "identity_update" }),
  };
  assert.deepEqual(renderShadowApply(outcome), {
    text: "Error: [obs12345] has action='identity_update'. Use mm-consolidate for non-shadow proposals.\n",
    stderr: true,
    exitCode: 1,
  });
});

test("renderShadowApply: applied, with source memories advanced line present", () => {
  const outcome: ShadowApplyRouteOutcome = {
    kind: "applied",
    consolidation: row(),
    targetKey: "profile",
    sourceMemoryIds: ["s1", "s2"],
  };
  assert.deepEqual(renderShadowApply(outcome), {
    text:
      "✓ Shadow layer updated: shadow/profile\n" +
      "  2 source memories advanced to 'acknowledged'.\n" +
      "\nProposal [obs12345] accepted and recorded with provenance.\n",
    stderr: false,
    exitCode: 0,
  });
});

test("renderShadowApply: applied, with NO source memories -- the advanced line is omitted entirely", () => {
  const outcome: ShadowApplyRouteOutcome = {
    kind: "applied",
    consolidation: row(),
    targetKey: "profile",
    sourceMemoryIds: [],
  };
  assert.deepEqual(renderShadowApply(outcome), {
    text: "✓ Shadow layer updated: shadow/profile\n\nProposal [obs12345] accepted and recorded with provenance.\n",
    stderr: false,
    exitCode: 0,
  });
});

// --- scan -------------------------------------------------------------------------

test("renderShadowScan: no candidate memories", () => {
  const result: ShadowScanResult = { candidatesConsidered: 0, proposalsCreated: [] };
  assert.equal(
    renderShadowScan(result),
    "No shadow-candidate memories found.\n" +
      "Shadow candidates come from:\n" +
      "  \u2022 memories with layer='shadow'\n" +
      "  \u2022 memories of type 'tension' or 'pattern'\n" +
      "  \u2022 memories advanced to 'candidate' via mm-consolidate\n" +
      "\n",
  );
});

test("renderShadowScan: candidates found but no observations proposed", () => {
  const result: ShadowScanResult = { candidatesConsidered: 2, proposalsCreated: [] };
  assert.equal(
    renderShadowScan(result),
    "Found 2 shadow-candidate memories. Generating observations...\n\n" +
      "No new observations were proposed.\n" +
      "The LLM found nothing new beyond what is already in the structural shadow layer,\n" +
      "or the evidence was insufficient to surface an observation.\n",
  );
});

test("renderShadowScan: one observation, full block and footer, matching the live Python oracle byte-for-byte", () => {
  const result: ShadowScanResult = { candidatesConsidered: 1, proposalsCreated: [row()] };
  const bar = "─".repeat(60);
  assert.equal(
    renderShadowScan(result),
    "Found 1 shadow-candidate memories. Generating observations...\n\n" +
      `\n${bar}\n` +
      "Observation 1/1  [obs12345]  🌑 SHADOW_OBSERVATION\n" +
      `${bar}\n` +
      "**Pattern:** Pattern A\n" +
      "**Source memories:** s1abcdef\n" +
      "\nA pattern.\n" +
      "\n" +
      "\n1 observation(s) created with status='pending'.\n" +
      "Review each observation above, then:\n" +
      "  Accept:  python -m memory shadow apply <proposal_id>\n" +
      '  Edit:    python -m memory shadow apply <proposal_id> --content "revised text"\n' +
      "  Reject:  python -m memory shadow reject <proposal_id>\n",
  );
});

test("renderShadowScan: observation with no rationale/no source ids omits those lines", () => {
  const result: ShadowScanResult = {
    candidatesConsidered: 1,
    proposalsCreated: [row({ rationale: null, source_memory_ids: "[]" })],
  };
  const rendered = renderShadowScan(result);
  assert.doesNotMatch(rendered, /\*\*Pattern:\*\*/);
  assert.doesNotMatch(rendered, /\*\*Source memories:\*\*/);
});
