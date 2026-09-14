// CV22.DS7.US8 plateau 7 — `build load`, the last leaf.
//
// Port of `cmd_load` in `src/memory/cli/build.py`.
//
// This is the command `/mm-build <journey>` runs, in all three runtimes, and the
// only one in the `build` family that crosses the provider seam: two embeddings
// for its own searches, plus the previous conversation's close tail through
// `switchConversation`.
//
// ## The ORDER of effects is behavior
//
// identity read → clone-role guard → banner (stderr) → transition card → entry
// surface → identity context → two searches → memories block → sticky defaults →
// operating-mode row → conversation switch → trailer.
//
// A port that writes the mode row before the searches passes every surface golden
// and changes what a CRASHED `load` leaves behind — which is the state a Navigator
// meets when a provider is down. Four surfaces print before the first provider
// call, so the transport decision has to be taken before any of them (the route
// does that; see `frontDoor/buildRoute.ts` at plateau 8).
//
// ## What it does NOT do
//
// It never falls back mid-command. If the embedding provider fails, the search
// degrades to FTS-only and the lifecycle continues: the mode row is still written
// and the conversation still switches, because in Python those statements simply
// follow the searches. The degraded card is indistinguishable from a healthy one —
// reproduced, and carried to Debt Review as a CR rather than marked here.

import type { WritableDatabase } from "#db/database.ts";
import { memoriesById } from "#frontDoor/searchRoute.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { getProjectPath } from "#journey/journeyStatus.ts";
import { loadMirrorContext } from "#mirror/context.ts";
import { persistStickyDefaults } from "#mirror/orchestration.ts";
import { resolveRuntimeSessionId } from "#mirror/runtimeSession.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";
import type { EmbeddingProvider } from "#providers/embedding.ts";
import { searchMemoriesWithStatus } from "#search/memorySearch.ts";
import { getAdoptedMethod } from "./methodAdoption.ts";
import { extractQuery, renderBuilderModeTransition } from "./transition.ts";

export interface BuildLoadResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  /** Metadata only, for the front-door log: never the query, never a message. */
  readonly degradedKind?: string;
  /** How many provider calls the command made, for the log's `calls=` field. */
  readonly providerCalls: number;
}

export interface BuildLoadDeps {
  readonly nowIso: () => string;
  readonly newId: () => string;
  /** Absent means no provider: the searches degrade to FTS-only. */
  readonly embeddingProvider?: EmbeddingProvider;
  /** Python's `switch_conversation`, injected because it carries the close tail. */
  readonly switchConversation?: (journey: string, sessionId: string | null) => Promise<void>;
  /** `inspect_clone_role`'s refusal, injected so the pure composition stays testable. */
  readonly cloneRoleRefusal?: (projectPath: string | null) => string | null;
  /** The `■ Builder Home` / `■ BUILDER RESUME` block, which plateaus 1–2 already own. */
  readonly renderEntrySurface?: (journey: string, projectPath: string | null) => string;
}

/** Python's `print(...)`: the value plus the newline `print` adds. */
function printed(text: string): string {
  return `${text}\n`;
}

const BANNER_COLOR = "\u001b[38;5;117m";
const BANNER_RESET = "\u001b[0m";

/** Python `_print_builder_banner`: stderr, ANSI bytes included. */
function banner(slug: string, projectPath: string | null): string {
  const lines = [`${BANNER_COLOR}⚙ Builder Mode active — journey: ${slug}${BANNER_RESET}`];
  if (projectPath) lines.push(`${BANNER_COLOR}  📁 ${projectPath}${BANNER_RESET}`);
  return lines.map(printed).join("");
}

export interface BuildLoadOptions {
  readonly slug: string;
  readonly sessionId?: string | null;
  readonly environmentSessionId?: string | null;
}

/** Python `cmd_load`. */
export async function runBuildLoad(
  db: WritableDatabase,
  options: BuildLoadOptions,
  deps: BuildLoadDeps,
): Promise<BuildLoadResult> {
  const slug = options.slug;
  const journeyContent = getIdentityContent(db, "journey", slug);
  if (!journeyContent) {
    return {
      stdout: "",
      stderr: printed(`Error: journey '${slug}' not found.`),
      exitCode: 1,
      providerCalls: 0,
    };
  }
  const projectPath = getProjectPath(db, slug);

  // The clone-role guard runs BEFORE the banner: refusing after it would print a
  // session start the command then abandons.
  const refusal = deps.cloneRoleRefusal?.(projectPath) ?? null;
  if (refusal !== null) {
    return { stdout: "", stderr: refusal, exitCode: 1, providerCalls: 0 };
  }

  let stdout = printed(renderBuilderModeTransition({ journey: slug, journeyContent, projectPath }));
  const stderr = banner(slug, projectPath);

  if (getAdoptedMethod(db, slug) === "ariad" && deps.renderEntrySurface) {
    stdout += printed(deps.renderEntrySurface(slug, projectPath));
  }

  stdout += printed(await loadMirrorContext(db, { persona: "engineer", journey: slug }));

  // The two searches. Python runs them unconditionally and passes `log_access`
  // by default, so this read MUTATES `access_count` on what it returns — which is
  // why a second `load` against the same database legitimately reorders the block.
  const query = extractQuery(journeyContent, slug);
  let providerCalls = 0;
  const provider = deps.embeddingProvider;
  const runSearch = async (journey?: string) => {
    if (provider === undefined) return { results: [], degraded: true, degradedKind: "config" };
    providerCalls += 1;
    return searchMemoriesWithStatus(db, {
      query,
      limit: 5,
      provider,
      ...(journey === undefined ? {} : { journey }),
    });
  };
  const scoped = await runSearch(slug);
  const global = await runSearch();
  const degradedKind = scoped.degradedKind ?? global.degradedKind;

  // Merge, dedupe by id keeping the FIRST occurrence, then sort by score
  // descending and take six. Python's `sort` is STABLE, so equal scores keep the
  // scoped-before-global order the merge produced.
  const seen = new Set<string>();
  const merged: { id: string; score: number }[] = [];
  for (const result of [...scoped.results, ...global.results]) {
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    merged.push({ id: result.id, score: result.score });
  }
  // Python sorts by score DESCENDING with a stable sort, so equal scores keep the
  // scoped-before-global order the merge produced. JavaScript's sort is stable by
  // specification since ES2019, so the comparator alone reproduces it.
  merged.sort((left, right) => right.score - left.score);
  const relevant = merged.slice(0, 6);
  if (relevant.length > 0) {
    // The ranker returns ids and scores; the rendered block needs the rows, read
    // through the same helper `memories --search` uses.
    const rows = memoriesById(
      db,
      relevant.map((entry) => entry.id),
    );
    stdout += "\n=== recent memories ===\n";
    for (const entry of relevant) {
      const memory = rows.get(entry.id);
      if (memory === undefined) continue;
      stdout += `\n[${memory.layer}] ${memory.title}\n`;
      stdout += printed(memory.content);
    }
  }

  persistStickyDefaults(db, "engineer", slug, deps.nowIso());
  const resolvedSessionId = resolveRuntimeSessionId(
    db,
    options.sessionId ?? null,
    options.environmentSessionId ?? null,
  );
  activateOperatingMode(
    db,
    { mode: "Builder Mode", journey: slug, sessionId: resolvedSessionId },
    deps.nowIso(),
  );
  await deps.switchConversation?.(slug, resolvedSessionId);

  stdout += projectPath
    ? `\nproject_path=${projectPath}\n`
    : `\n[Journey '${slug}' has no project_path configured. ` +
      `Run: python -m memory journey set-path ${slug} /path/to/project]\n`;

  return {
    stdout,
    stderr,
    exitCode: 0,
    ...(degradedKind === undefined ? {} : { degradedKind }),
    providerCalls,
  };
}
