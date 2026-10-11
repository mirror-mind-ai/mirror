// CV22.DS7.US7 plateau 1 — Explorer surfaces graded against the Python oracle.
//
// The golden is renderer-complete and carries the Unicode corpus that
// separates Python's string semantics from JavaScript's: astral emoji (code
// points vs UTF-16 units in the card padding), U+001F (whitespace to Python,
// not to `\s`), U+FEFF (whitespace to `\s`, not to Python), and the paragraph
// collapse that follows from `_box` having no `_wrap_blocks`.
//
// It also grades BOTH `_wrap` implementations -- the story cards chunk a long
// word, the mode-transition card lets it overflow and truncates -- so a future
// refactor that unifies them fails here instead of in a live session.

import assert from "node:assert/strict";
import test from "node:test";
import {
  type ExplorerStoryView,
  renderAttractorsEmerging,
  renderBuilderHandoffProposed,
  renderExperimentProposal,
  renderExploratoryStoryOpened,
  renderExploratoryStoryResumed,
  renderExplorerStoryArchived,
  renderExplorerStoryList,
  renderMissingExploratoryStory,
  renderNarrativeFieldSnapshot,
  renderNoBuilderHandoff,
  renderStoryThickened,
} from "#explorer/render.ts";
import { renderExplorerModeTransition } from "#explorer/transition.ts";
import golden from "#goldens/explorer-surface.golden.json" with { type: "json" };

interface StoryPayload {
  journey: string;
  current_exploratory_story?: string | null;
  narrative_field_summary?: string | null;
  last_story_card?: string | null;
  attractors?: { label: string; description?: string | null; status?: string }[];
  experiment_proposal?: { title: string; description?: string | null; status?: string } | null;
  builder_handoff?: Record<string, string | null> | null;
  source_conversations?: { conversation_id: string; title?: string | null; role?: string }[];
  id?: string | null;
  title?: string | null;
  status?: string;
  created_at?: string | null;
  updated_at?: string | null;
  promoted_at?: string | null;
  archived_at?: string | null;
}

interface Scenario {
  name: string;
  renderer: string;
  input: Record<string, unknown>;
  expected_stdout?: string;
  expected_error?: string;
}

const scenarios = (golden as { scenarios: Scenario[] }).scenarios;

/** Rebuild the view the Python generator recorded as its input payload. */
function toStory(payload: StoryPayload): ExplorerStoryView {
  const handoff = payload.builder_handoff;
  return {
    journey: payload.journey,
    currentExploratoryStory: payload.current_exploratory_story ?? null,
    narrativeFieldSummary: payload.narrative_field_summary ?? null,
    lastStoryCard: payload.last_story_card ?? null,
    attractors: (payload.attractors ?? []).map((item) => ({
      label: item.label,
      description: item.description ?? null,
      status: item.status ?? "proposed",
    })),
    experimentProposal: payload.experiment_proposal
      ? {
          title: payload.experiment_proposal.title,
          description: payload.experiment_proposal.description ?? null,
          status: payload.experiment_proposal.status ?? "proposed",
        }
      : null,
    builderHandoff: handoff
      ? {
          title: handoff.title as string,
          summary: handoff.summary ?? null,
          readiness: (handoff.readiness as string) ?? "proposed",
          artifactDir: handoff.artifact_dir ?? null,
          indexPath: handoff.index_path ?? null,
          exploratoryStoryPath: handoff.exploratory_story_path ?? null,
          handoffInfoPath: handoff.handoff_info_path ?? null,
          productDesignProposalPath: handoff.product_design_proposal_path ?? null,
          fullConversationPath: handoff.full_conversation_path ?? null,
        }
      : null,
    sourceConversations: (payload.source_conversations ?? []).map((item) => ({
      conversationId: item.conversation_id,
      title: item.title ?? null,
      role: item.role ?? "source evidence",
    })),
    id: payload.id ?? null,
    title: payload.title ?? null,
    status: payload.status ?? "active",
    createdAt: payload.created_at ?? null,
    updatedAt: payload.updated_at ?? null,
    promotedAt: payload.promoted_at ?? null,
    archivedAt: payload.archived_at ?? null,
  };
}

function render(scenario: Scenario): string {
  const input = scenario.input;
  const story = () => toStory(input.story as StoryPayload);

  switch (scenario.renderer) {
    case "exploratory_story_opened":
      return renderExploratoryStoryOpened(story());
    case "exploratory_story_resumed":
      return renderExploratoryStoryResumed(story());
    case "narrative_field_snapshot":
      return renderNarrativeFieldSnapshot(story());
    case "story_thickened":
      return renderStoryThickened(story(), input.changed as string | null);
    case "explorer_story_archived":
      return renderExplorerStoryArchived(
        input.story === null ? null : story(),
        input.journey as string,
      );
    case "explorer_story_list":
      return renderExplorerStoryList(
        input.journey as string,
        (input.stories as StoryPayload[]).map(toStory),
      );
    case "attractors_emerging":
      return renderAttractorsEmerging(story());
    case "experiment_proposal":
      return renderExperimentProposal(story());
    case "builder_handoff_proposed":
      return renderBuilderHandoffProposed(story());
    case "no_builder_handoff":
      return renderNoBuilderHandoff(input.journey as string);
    case "missing_exploratory_story":
      return renderMissingExploratoryStory(input.journey as string);
    case "explorer_mode_transition":
      return renderExplorerModeTransition(input.journey as string);
    default:
      throw new Error(`unknown renderer in golden: ${scenario.renderer}`);
  }
}

test("the Explorer surface golden covers every renderer", () => {
  const covered = new Set(scenarios.map((scenario) => scenario.renderer));
  assert.deepEqual(
    [...covered].sort(),
    [
      "attractors_emerging",
      "builder_handoff_proposed",
      "experiment_proposal",
      "exploratory_story_opened",
      "exploratory_story_resumed",
      "explorer_mode_transition",
      "explorer_story_archived",
      "explorer_story_list",
      "missing_exploratory_story",
      "narrative_field_snapshot",
      "no_builder_handoff",
      "story_thickened",
    ],
    "a renderer lost its coverage; regenerate the golden rather than deleting rows",
  );
});

for (const scenario of scenarios) {
  test(`explorer surface parity: ${scenario.name}`, () => {
    assert.equal(
      render(scenario),
      scenario.expected_stdout,
      "rendered surface diverged from the Python oracle",
    );
  });
}

test("the two _wrap oracles stay separate: long words chunk in cards, overflow in the mode card", () => {
  const long = "x".repeat(200);
  const card = renderMissingExploratoryStory(long);
  const mode = renderExplorerModeTransition(long);

  const cardBody = card.split("\n").filter((row) => row.includes("xxx"));
  const modeBody = mode.split("\n").filter((row) => row.includes("xxx"));

  assert.equal(cardBody.length, 4, "the story card chunks a 200-code-point word across lines");
  assert.equal(modeBody.length, 1, "the mode card overflows and lets _line truncate");
});
