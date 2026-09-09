// CV22.DS7.US7 plateau 3 — Explorer handoff artifacts graded against the oracle.
//
// Two things are graded, and the first one is the security boundary: the
// redaction matrix carries a positive AND a near-miss row for every pattern,
// because over-matching destroys evidence as silently as under-matching leaks
// it. The second is the written documents, byte for byte, plus the directory
// the writer chose — the slug, the collision suffix, and the confinement of a
// traversal-looking title.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import {
  type HandoffConversationSource,
  obfuscateSensitiveText,
  writeBuilderHandoffArtifacts,
} from "#explorer/handoff.ts";
import type { ExplorerStory } from "#explorer/story.ts";
import golden from "#goldens/explorer-handoff.golden.json" with { type: "json" };

const directories: string[] = [];

test.after(() => {
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "explorer-handoff-"));
  directories.push(dir);
  return dir;
}

interface StoryPayload {
  journey: string;
  id: string | null;
  title: string | null;
  status: string;
  current_exploratory_story: string | null;
  narrative_field_summary: string | null;
  last_story_card: string | null;
  attractors: { label: string; description: string | null; status: string }[];
  experiment_proposal: { title: string; description: string | null; status: string } | null;
}

function toStory(payload: StoryPayload): ExplorerStory {
  return {
    journey: payload.journey,
    currentExploratoryStory: payload.current_exploratory_story,
    narrativeFieldSummary: payload.narrative_field_summary,
    lastStoryCard: payload.last_story_card,
    attractors: payload.attractors,
    experimentProposal: payload.experiment_proposal,
    builderHandoff: null,
    sourceConversations: [],
    id: payload.id,
    title: payload.title,
    status: payload.status,
    createdAt: null,
    updatedAt: null,
    promotedAt: null,
    archivedAt: null,
  };
}

// --- the redaction matrix --------------------------------------------------

for (const scenario of golden.redaction) {
  test(`explorer handoff redaction: ${scenario.name}`, () => {
    assert.equal(
      obfuscateSensitiveText(scenario.input),
      scenario.expected,
      "redaction diverged from the oracle — this writes into the user's repository",
    );
  });
}

test("every redaction pattern is exercised in both directions", () => {
  // A pattern silently dropped from the port would still pass every positive
  // row for the OTHER patterns. This asserts the corpus keeps both directions
  // for each of the five, so deleting one fails here rather than in the field.
  const names = golden.redaction.map((row) => row.name);
  for (const prefix of ["path", "secret", "sk_key", "email", "phone"]) {
    const family = golden.redaction.filter((row) => row.name.startsWith(prefix));
    assert.ok(
      family.some((row) => row.input !== row.expected),
      `${prefix}: no positive row`,
    );
    assert.ok(
      family.some((row) => row.input === row.expected && row.input !== ""),
      `${prefix}: no near-miss row that must survive`,
    );
  }
  assert.equal(new Set(names).size, names.length, "duplicate redaction scenario name");
});

test("a unicode-digit phone number redacts, because Python's \\d is not [0-9]", () => {
  // The single most dangerous divergence in this module: `\d` in JavaScript is
  // ASCII, so a naive port leaks exactly this string.
  const redacted = obfuscateSensitiveText("call १२३४५६७८९० today");
  assert.ok(!redacted.includes("१२३४५६७८९०"), "Devanagari phone number survived redaction");
});

test("redaction markers are literal, not replacement patterns", () => {
  // `String.replace` interprets `$&` and friends in the REPLACEMENT string. If
  // a marker ever gains one, the matched secret writes itself back out.
  const redacted = obfuscateSensitiveText("token=abc$&def$1ghi and more");
  assert.ok(!redacted.includes("abc"), "the secret leaked through a replacement pattern");
});

// --- the written artifacts -------------------------------------------------

function readTree(root: string, base: string): Record<string, string> {
  const documents: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else documents[relative(root, path).split("\\").join("/")] = readFileSync(path, "utf-8");
    }
  };
  walk(base);
  return documents;
}

for (const scenario of golden.artifacts) {
  test(`explorer handoff artifacts: ${scenario.name}`, () => {
    const project = tempProject();
    for (const existing of scenario.pre_existing) {
      mkdirSync(join(project, "docs", "project", "explorations", existing), { recursive: true });
    }

    const sources: HandoffConversationSource[] = scenario.sources.map((source) => ({
      conversationId: source.conversation_id,
      title: source.title,
      role: source.role,
      messages: source.messages,
    }));

    const handoff = writeBuilderHandoffArtifacts(project, toStory(scenario.story as StoryPayload), {
      title: scenario.title,
      summary: scenario.summary,
      editorialSynthesis: scenario.editorial_synthesis,
      sourceConversations: sources,
      includeFullConversation: scenario.include_full_conversation,
    });

    const relativePath = (path: string | null) =>
      path === null ? null : relative(project, path).split("\\").join("/");

    assert.deepEqual(
      {
        title: handoff.title,
        summary: handoff.summary,
        readiness: handoff.readiness,
        artifact_dir: relativePath(handoff.artifactDir),
        index_path: relativePath(handoff.indexPath),
        exploratory_story_path: relativePath(handoff.exploratoryStoryPath),
        handoff_info_path: relativePath(handoff.handoffInfoPath),
        product_design_proposal_path: relativePath(handoff.productDesignProposalPath),
        full_conversation_path: relativePath(handoff.fullConversationPath),
      },
      scenario.handoff,
      "the recorded handoff diverged from the oracle",
    );

    assert.deepEqual(
      readTree(project, handoff.artifactDir as string),
      scenario.documents,
      "written documents diverged from the oracle",
    );
  });
}

test("a traversal-looking title cannot escape the explorations directory", () => {
  const project = tempProject();
  const handoff = writeBuilderHandoffArtifacts(
    project,
    toStory(golden.artifacts[0]?.story as StoryPayload),
    { title: "../../../../etc/passwd" },
  );
  const root = join(project, "docs", "project", "explorations");
  assert.ok(
    (handoff.artifactDir as string).startsWith(root),
    "handoff directory escaped the explorations root",
  );
});
