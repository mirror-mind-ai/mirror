// CV22.DS7.US7 plateau 5 — the `explore` front-door route.
//
// Dispatch only: every behavior it reaches was ported and graded in plateaus
// 1-4. What this module owns is the argv shape, the exit codes, the refusals,
// and the one call into the projection seam.
//
// `explore` is the first family with a NESTED subparser, so the allowlist in
// `routing.ts` is two levels deep: `explore <sub>` and `explore story
// <action>`. A single-level allowlist would claim `explore story <anything>`
// and answer an argv shape this route has never implemented — the
// `conversations append` defect (RS009/CR055), which exited 0 and discarded the
// caller's data.
//
// `story promote` is deliberately NOT here. Python's `cmd_story_promote` ends
// by calling Builder `load`, which is US8's, so the leaf stays on Python by
// name until the Builder tree is ported. Recorded in the burn-down ledger, not
// only in this comment.

import type { WritableDatabase } from "#db/database.ts";
import {
  type HandoffConversationSource,
  type HandoffSourceMessage,
  writeBuilderHandoffArtifacts,
} from "#explorer/handoff.ts";
import {
  createPythonProjectionRefresh,
  type ProjectionRefreshSeam,
} from "#explorer/projectionRefresh.ts";
import {
  renderAttractorsEmerging,
  renderBuilderHandoffProposed,
  renderExperimentProposal,
  renderExploratoryStoryOpened,
  renderExploratoryStoryResumed,
  renderExplorerStoryArchived,
  renderExplorerStoryList,
  renderMissingExploratoryStory,
  renderNarrativeFieldSnapshot,
  // `renderNoBuilderHandoff` is deliberately NOT imported: its only caller is
  // `story promote`, which stays on Python until US8 owns Builder load. The
  // renderer is ported and graded by the surface golden, so the flip needs no
  // new rendering work — only the route entry.
  renderStoryThickened,
} from "#explorer/render.ts";
import {
  archiveExplorerStory,
  clearExplorerStory,
  type ExplorerStory,
  ExplorerStoryError,
  getExplorerStory,
  listExplorerStories,
  renderExplorerStoryContext,
  type Settable,
  type StoryClock,
  type StoryMutation,
  setExplorerAttractors,
  setExplorerBuilderHandoff,
  setExplorerExperimentProposal,
  setExplorerSourceConversations,
  UNSET,
  updateExplorerStory,
} from "#explorer/story.ts";
import { renderExplorerModeTransition } from "#explorer/transition.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { getProjectPath } from "#journey/journeyStatus.ts";
import { loadMirrorContext } from "#mirror/context.ts";
import { persistStickyDefaults } from "#mirror/orchestration.ts";
import { resolveRuntimeSessionId } from "#mirror/runtimeSession.ts";
import { activateOperatingMode, deactivateOperatingMode } from "#mode/operatingMode.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { optionValue, stripOptionWithValue } from "./args.ts";

/** Python's argparse subcommands for `explore`, by name. */
export const EXPLORE_SUBCOMMANDS = ["load", "deactivate", "story"] as const;

/** Python's argparse actions under `explore story`, by name. */
export const EXPLORE_STORY_ACTIONS = [
  "show",
  "list",
  "archive",
  "update",
  "clear",
  "open",
  "thicken",
  "snapshot",
  "attractors",
  "experiment",
  "handoff",
  // `promote` is absent on purpose: its tail is Builder `load` (US8).
] as const;

const OPTIONS_WITH_VALUES = [
  "--mirror-home",
  "--db-path",
  "--session-id",
  "--story",
  "--summary",
  "--last-card",
  "--changed",
  "--attractor",
  "--description",
  "--status",
  "--title",
  "--editorial-synthesis",
  "--source-conversation",
];

const FLAGS = ["--include-full-conversation"];

const EXPLORER_GUIDANCE = `=== Explorer Mode guidance ===
Explorer Mode is active and ready for durable exploration, story thickening, attractors, experiments, and Builder handoff.

Explorer preserves uncertainty. Builder executes commitment.

While Explorer Mode is active:
- Treat new substantive material as part of the current Exploratory Story unless the user asks for a clear operational action.
- Preserve tensions, hypotheses, corrections, and emerging story shape.
- Update the in-session story when new material changes the accumulated story.
- Render Story Thickened when new material changes the accumulated story.
- Do not promote to Builder or Delivery without explicit user confirmation.
`;

const EXPLORER_DEACTIVATED_SURFACE = `Mirror
╭────────────────────────────────────────────────────────╮
│        △  EXPLORER MODE DEACTIVATED                    │
│                                                        │
│  current lens                                          │
│  ◌ Mirror Mode                                         │
│                                                        │
│  context                                               │
│  Journey context remains available when it is sticky.  │
│                                                        │
│  boundary                                              │
│  Explorer lens ended. Uncertainty was not promoted.    │
╰────────────────────────────────────────────────────────╯
`;

function positionals(args: readonly string[]): string[] {
  const withoutFlags = args.filter((arg) => !FLAGS.includes(arg));
  return OPTIONS_WITH_VALUES.reduce<string[]>(
    (remaining, option) => stripOptionWithValue(remaining, option),
    withoutFlags,
  );
}

/** Python's `_required_surface` marker protocol, byte for byte. */
function requiredSurface(surfaceId: string, rendered: string): string {
  return `[[MIRROR_REQUIRED_SURFACE_BEGIN:${surfaceId}]]\n${rendered}\n[[MIRROR_REQUIRED_SURFACE_END:${surfaceId}]]`;
}

function write(text: string): number {
  process.stdout.write(`${text}\n`);
  return 0;
}

function fail(message: string): number {
  process.stderr.write(`Error: ${message}\n`);
  return 1;
}

/** argparse's own exit for an unknown subcommand or a missing required argument. */
function usageError(message: string): number {
  process.stderr.write(`${message}\n`);
  return 2;
}

export interface ExploreRouteDeps {
  clock: StoryClock;
  projectionRefresh: ProjectionRefreshSeam;
  readMessages: (db: WritableDatabase, conversationId: string) => HandoffSourceMessage[];
}

export function defaultExploreRouteDeps(mirrorHome: string | null): ExploreRouteDeps {
  return {
    clock: { now: nowIso, uuid: newId },
    projectionRefresh: createPythonProjectionRefresh({
      mirrorHome,
      // Diagnostics go to stderr, never stdout: the Explorer surfaces are
      // `transport=verbatim` and a stray line corrupts one.
      onDiagnostic: (message) => {
        if (process.env.MIRROR_DEBUG) process.stderr.write(`${message}\n`);
      },
    }),
    readMessages: (db, conversationId) =>
      db
        .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY rowid")
        .all(conversationId) as unknown as HandoffSourceMessage[],
  };
}

/** Every story mutation asks Python to refresh, and only when the projection changed. */
function afterMutation(
  mutation: StoryMutation,
  journey: string,
  deps: ExploreRouteDeps,
): ExplorerStory {
  if (mutation.refreshRequested) deps.projectionRefresh.request(journey);
  return mutation.story;
}

export async function runExploreRoute(
  db: WritableDatabase,
  argv: readonly string[],
  deps: ExploreRouteDeps,
): Promise<number> {
  const rawArgs = argv.slice(1);
  const args = positionals(rawArgs);
  const sub = args[0];
  const option = (name: string) => optionValue(rawArgs, name);

  try {
    switch (sub) {
      case "load": {
        const slug = args[1];
        if (!slug) return usageError("explore load requires a journey slug");
        // Awaited inside the try: returning the promise would carry a
        // rejection past the catch that turns ExplorerStoryError into exit 1.
        return await runLoad(db, slug, option("--session-id"));
      }
      case "deactivate": {
        deactivateOperatingMode(db, resolveRuntimeSessionId(db, option("--session-id")), nowIso());
        return write(EXPLORER_DEACTIVATED_SURFACE);
      }
      case "story":
        return runStory(db, args, option, rawArgs, deps);
      default:
        return usageError(`explore: unknown subcommand ${sub ?? ""}`);
    }
  } catch (error) {
    if (error instanceof ExplorerStoryError) return fail(error.message);
    throw error;
  }
}

// No `deps`: `load` activates the mode and renders, but never mutates the
// story, so it cannot change the projection and never reaches the seam.
async function runLoad(
  db: WritableDatabase,
  slug: string,
  sessionId: string | null,
): Promise<number> {
  const journeyContent = getIdentityContent(db, "journey", slug);
  if (!journeyContent) {
    process.stderr.write(`Error: journey '${slug}' not found.\n`);
    return 1;
  }

  const resolved = resolveRuntimeSessionId(db, sessionId);
  const now = nowIso();
  activateOperatingMode(db, { mode: "Explorer Mode", journey: slug, sessionId: resolved }, now);
  // Python's `cmd_load` reaches into `memory.skills.mirror`'s PRIVATE sticky
  // writer; the port calls the public one and does not reproduce the violation.
  persistStickyDefaults(db, null, slug, now);

  // The activation banner goes to stderr, as Python's does: stdout carries the
  // surfaces a runtime must render verbatim.
  process.stderr.write(`\u001b[38;5;183m△ Explorer Mode active — journey: ${slug}\u001b[0m\n`);
  write(renderExplorerModeTransition(slug));
  write(await loadMirrorContext(db, { journey: slug }));

  const story = getExplorerStory(db, slug);
  if (story) {
    write(
      `\n${requiredSurface("exploratory_story_resumed", renderExploratoryStoryResumed(story))}`,
    );
    write(`\n${renderExplorerStoryContext(story)}`);
  }
  write(`\n${EXPLORER_GUIDANCE}`);
  return 0;
}

function runStory(
  db: WritableDatabase,
  args: readonly string[],
  option: (name: string) => string | null,
  rawArgs: readonly string[],
  deps: ExploreRouteDeps,
): number {
  const action = args[1];
  const slug = args[2];
  if (!action) return usageError("explore story requires an action");
  if (!slug) return usageError(`explore story ${action} requires a journey slug`);

  // A settable scalar is present-or-absent, never nullish: `--story` given with
  // an empty value CLEARS, while omitting it keeps. `optionValue` returns null
  // for both, so presence is read from argv.
  const settable = (name: string): Settable =>
    rawArgs.includes(name) ? (option(name) ?? "") : UNSET;

  switch (action) {
    case "show": {
      const story = getExplorerStory(db, slug);
      if (!story) return write(`No Exploratory Story for journey: ${slug}`);
      return write(renderExplorerStoryContext(story));
    }
    case "list":
      return write(
        requiredSurface(
          "exploratory_stories",
          renderExplorerStoryList(slug, listExplorerStories(db, slug)),
        ),
      );
    case "archive": {
      const { story, refreshRequested } = archiveExplorerStory(db, slug, deps.clock);
      if (refreshRequested) deps.projectionRefresh.request(slug);
      return write(
        requiredSurface("exploratory_story_archived", renderExplorerStoryArchived(story, slug)),
      );
    }
    case "clear":
      clearExplorerStory(db, slug, deps.clock);
      return write(`Exploratory Story cleared for journey: ${slug}`);
    case "update": {
      const story = afterMutation(updateStory(db, slug, settable, deps), slug, deps);
      return write(renderExplorerStoryContext(story));
    }
    case "open": {
      const story = afterMutation(updateStory(db, slug, settable, deps), slug, deps);
      return write(
        requiredSurface("exploratory_story_opened", renderExploratoryStoryOpened(story)),
      );
    }
    case "thicken": {
      const story = afterMutation(updateStory(db, slug, settable, deps), slug, deps);
      return write(
        requiredSurface("story_thickened", renderStoryThickened(story, option("--changed"))),
      );
    }
    case "snapshot": {
      const story = getExplorerStory(db, slug);
      if (!story) {
        return write(requiredSurface("no_exploratory_story", renderMissingExploratoryStory(slug)));
      }
      return write(
        requiredSurface("narrative_field_snapshot", renderNarrativeFieldSnapshot(story)),
      );
    }
    case "attractors": {
      const label = option("--attractor");
      if (label === null) {
        return usageError(
          "explore story attractors: the following arguments are required: --attractor",
        );
      }
      const story = afterMutation(
        setExplorerAttractors(db, slug, deps.clock, [
          {
            label,
            description: option("--description"),
            status: option("--status") ?? "proposed",
          },
        ]),
        slug,
        deps,
      );
      return write(requiredSurface("attractors_emerging", renderAttractorsEmerging(story)));
    }
    case "experiment": {
      const title = option("--title");
      if (title === null) {
        return usageError(
          "explore story experiment: the following arguments are required: --title",
        );
      }
      const story = afterMutation(
        setExplorerExperimentProposal(db, slug, deps.clock, {
          title,
          description: option("--description"),
          status: option("--status") ?? "proposed",
        }),
        slug,
        deps,
      );
      return write(requiredSurface("experiment_proposal", renderExperimentProposal(story)));
    }
    case "handoff":
      return runHandoff(db, slug, option, rawArgs, deps);
    default:
      return usageError(`explore story: unknown action ${action}`);
  }
}

function updateStory(
  db: WritableDatabase,
  slug: string,
  settable: (name: string) => Settable,
  deps: ExploreRouteDeps,
): StoryMutation {
  const fields: {
    currentExploratoryStory?: Settable;
    narrativeFieldSummary?: Settable;
    lastStoryCard?: Settable;
  } = {};
  const story = settable("--story");
  const summary = settable("--summary");
  const lastCard = settable("--last-card");
  if (story !== UNSET) fields.currentExploratoryStory = story;
  if (summary !== UNSET) fields.narrativeFieldSummary = summary;
  if (lastCard !== UNSET) fields.lastStoryCard = lastCard;
  return updateExplorerStory(db, slug, deps.clock, fields);
}

function runHandoff(
  db: WritableDatabase,
  slug: string,
  option: (name: string) => string | null,
  rawArgs: readonly string[],
  deps: ExploreRouteDeps,
): number {
  const title = option("--title");
  if (title === null) {
    return usageError("explore story handoff: the following arguments are required: --title");
  }

  const story = getExplorerStory(db, slug);
  if (!story) {
    return write(requiredSurface("no_exploratory_story", renderMissingExploratoryStory(slug)));
  }

  const includeFullConversation = rawArgs.includes("--include-full-conversation");
  const sources = loadHandoffSources(
    db,
    collectRepeated(rawArgs, "--source-conversation"),
    includeFullConversation,
    deps,
  );

  let current = story;
  if (sources.length > 0) {
    current = afterMutation(
      setExplorerSourceConversations(
        db,
        slug,
        deps.clock,
        sources.map((source) => ({
          conversationId: source.conversationId,
          title: source.title,
          role: source.role,
        })),
      ),
      slug,
      deps,
    );
  }

  const projectPath = getProjectPath(db, slug);
  const handoff = projectPath
    ? writeBuilderHandoffArtifacts(projectPath, current, {
        title,
        summary: option("--summary"),
        editorialSynthesis: option("--editorial-synthesis"),
        sourceConversations: sources,
        includeFullConversation,
      })
    : {
        title,
        summary: option("--summary"),
        readiness: "proposed" as const,
        artifactDir: null,
        indexPath: null,
        exploratoryStoryPath: null,
        handoffInfoPath: null,
        productDesignProposalPath: null,
        fullConversationPath: null,
      };

  const updated = afterMutation(
    setExplorerBuilderHandoff(db, slug, deps.clock, handoff),
    slug,
    deps,
  );
  return write(requiredSurface("builder_handoff_proposed", renderBuilderHandoffProposed(updated)));
}

/** `action="append"`: every occurrence, in order. */
function collectRepeated(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && index + 1 < args.length) values.push(args[index + 1] as string);
  }
  return values;
}

/** Python `_parse_source_conversation_arg`: `id` or `id:role`. */
function parseSourceConversationArg(value: string): { id: string; role: string } {
  const separator = value.indexOf(":");
  if (separator === -1) return { id: value.trim(), role: "source evidence" };
  return {
    id: value.slice(0, separator).trim(),
    role: value.slice(separator + 1).trim() || "source evidence",
  };
}

/** Python `_load_handoff_sources`: id, then id-prefix; an unknown id is skipped. */
function loadHandoffSources(
  db: WritableDatabase,
  raw: readonly string[],
  includeMessages: boolean,
  deps: ExploreRouteDeps,
): HandoffConversationSource[] {
  const sources: HandoffConversationSource[] = [];
  for (const value of raw) {
    const { id, role } = parseSourceConversationArg(value);
    const conversation =
      (db.prepare("SELECT id, title FROM conversations WHERE id = ?").get(id) as
        | { id: string; title: string | null }
        | undefined) ??
      (db
        .prepare("SELECT id, title FROM conversations WHERE id LIKE ? ORDER BY id LIMIT 1")
        .get(`${id}%`) as { id: string; title: string | null } | undefined);
    if (!conversation) continue;
    sources.push({
      conversationId: conversation.id,
      title: conversation.title ?? null,
      role,
      messages: includeMessages ? deps.readMessages(db, conversation.id) : [],
    });
  }
  return sources;
}
