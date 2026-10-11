// CV22.DS7.US10 slice C′ — metadata lifecycle decision engine parity.
//
// Grades the TS port of `src/memory/services/metadata_lifecycle.py` against the
// Python-generated golden from `ts/parity/generate_metadata_lifecycle_golden.py`.
//
// The plan grades this engine by its *decisions*, not by code reading: it is the
// largest unported piece of the extraction lifecycle and it decides whether the
// close tail generates a title/summary/tags at all. Every branch of the three
// field policies is covered by the golden corpus, and every scenario is also
// graded through all five execution profiles, because `metadataProfileAction`
// is the function the close tail actually consults.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  type ConversationLike,
  dryRunMetadataLifecycle,
  type MessageLike,
  meaningfulTerms,
  metadataExecutionProfile,
  metadataProfileAction,
  summaryQualityIssues,
  titleNeedsImprovement,
} from "#conversation/metadataLifecycle.ts";

const GOLDEN_PATH = new URL("../goldens/metadata-lifecycle.golden.json", import.meta.url);

interface Golden {
  meta: { metadata_lifecycle_version: number; profiles: string[] };
  profiles: Record<
    string,
    {
      name: string;
      title_apply_decisions: string[];
      summary_apply_decisions: string[];
      tags_apply_decisions: string[];
      force_regenerate: boolean;
      preserve_manual: boolean;
    }
  >;
  scenarios: {
    label: string;
    conversation: ConversationLike;
    messages: MessageLike[];
    report: Record<string, unknown>;
    actions_by_profile: Record<string, Record<string, string>>;
  }[];
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

test("golden corpus covers every scenario with a decision report", () => {
  assert.ok(golden.scenarios.length >= 44, "golden must carry the full branch corpus");
});

for (const scenario of golden.scenarios) {
  test(`dry-run lifecycle parity: ${scenario.label}`, () => {
    const metadata = parseMetadata(scenario.conversation.metadata);
    const report = dryRunMetadataLifecycle(scenario.conversation, scenario.messages, metadata, {
      titleNeedsImprovement,
    });
    assert.deepEqual(report, scenario.report);
  });

  test(`profile action matrix parity: ${scenario.label}`, () => {
    const metadata = parseMetadata(scenario.conversation.metadata);
    const report = dryRunMetadataLifecycle(scenario.conversation, scenario.messages, metadata, {
      titleNeedsImprovement,
    });
    for (const [profileName, expected] of Object.entries(scenario.actions_by_profile)) {
      const profile = metadataExecutionProfile(profileName);
      const actual = Object.fromEntries(
        Object.entries(report.fields).map(([field, fieldReport]) => [
          field,
          metadataProfileAction(profile, field, fieldReport),
        ]),
      );
      assert.deepEqual(actual, expected, `profile ${profileName}`);
    }
  });
}

test("execution profiles match the Python definitions", () => {
  for (const [name, expected] of Object.entries(golden.profiles)) {
    const profile = metadataExecutionProfile(name);
    assert.equal(profile.name, expected.name);
    assert.deepEqual([...profile.titleApplyDecisions].sort(), expected.title_apply_decisions);
    assert.deepEqual([...profile.summaryApplyDecisions].sort(), expected.summary_apply_decisions);
    assert.deepEqual([...profile.tagsApplyDecisions].sort(), expected.tags_apply_decisions);
    assert.equal(profile.forceRegenerate, expected.force_regenerate);
    assert.equal(profile.preserveManual, expected.preserve_manual);
  }
});

test("unknown execution profile raises, matching Python's ValueError", () => {
  assert.throws(
    () => metadataExecutionProfile("no_such_profile"),
    /Unknown metadata execution profile: no_such_profile/,
  );
});

// Python's `\w` and `\b` are Unicode-aware in str patterns; JavaScript's are
// ASCII by default. These three cases are the ones where a naive port silently
// diverges, and each expectation below was taken from the Python oracle.
test("unicode fidelity: accented paths are detected like Python's unicode \\w", () => {
  assert.deepEqual(summaryQualityIssues("Trabalho em /Usuários/joão/projeto hoje."), [
    "contains_paths",
  ]);
});

test("unicode fidelity: a unicode letter before `eu:` suppresses the transcript probe", () => {
  // Python's unicode \b sees `ã` as a word character, so there is no boundary
  // and no match. A JS `\b` would match here — hence the explicit lookbehind.
  assert.deepEqual(summaryQualityIssues("palavraãeu: algo aqui"), []);
  assert.deepEqual(summaryQualityIssues("entao eu: algo aqui"), ["looks_like_transcript"]);
  assert.deepEqual(summaryQualityIssues("meu: algo aqui"), []);
});

test("unicode fidelity: term extraction matches Python's [\\wÀ-ÿ] class", () => {
  // `joão×` keeps the multiplication sign because Python's explicit À-ÿ range
  // admits U+00D7; a `\p{L}`-only class would split the token.
  assert.deepEqual([...meaningfulTerms("Programação análise João× Ábaco")].sort(), [
    "análise",
    "joão×",
    "programação",
    "ábaco",
  ]);
});

test("manual title lock wins over every profile decision", () => {
  // preserve_manual is checked before the decision, so even the force profiles
  // must refuse to regenerate a manually-locked title.
  const lockedReport = { decision: "create", lock_state: "manual_locked" };
  for (const name of golden.meta.profiles) {
    const action = metadataProfileAction(metadataExecutionProfile(name), "title", lockedReport);
    assert.equal(action, "preserve_manual", `profile ${name}`);
  }
});
