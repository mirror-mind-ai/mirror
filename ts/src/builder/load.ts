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
import { ProviderConfigError } from "#providers/config.ts";
import type { EmbeddingProvider } from "#providers/embedding.ts";
import { searchMemoriesWithStatus } from "#search/memorySearch.ts";
import { renderBuilderOrientationSurface } from "./homeSurface.ts";
import { getAdoptedMethod } from "./methodAdoption.ts";
import { inspectPullCandidates, inspectRoadmapSnapshot } from "./pullCandidates.ts";
import { renderProjectPositionReport } from "./pullCandidatesRender.ts";
import { findCanonicalRefinementIndex, inspectRefinementField } from "./refinementField.ts";
import { readBuilderResumeState } from "./resumeState.ts";
import { renderBuilderResumeSurface } from "./resumeSurface.ts";
import { resolveRoadmapPosition } from "./roadmapPosition.ts";
import { extractQuery, renderBuilderModeTransition } from "./transition.ts";
import { getWorkbenchSnapshot } from "./workbenchSnapshot.ts";

export interface BuildLoadResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  /** Metadata only, for the front-door log: never the query, never a message. */
  readonly degradedKind?: string;
  /** How many provider calls the command made, for the log's `calls=` field. */
  readonly providerCalls: number;
}

/**
 * What an unconfigured install has instead of a provider.
 *
 * Python has no "absent provider" state: `generate_embedding` raises
 * `RuntimeError` when the key is missing, the search catches it, and the block
 * still renders FTS-only. Returning no results here instead -- which this did
 * until the degraded scenario measured it -- renders an EMPTY memories block on
 * a machine with a working corpus and no key, and does it silently, in the
 * surface a Navigator reads to choose the day's work.
 *
 * `ProviderConfigError` is the right class, not a convenience: it is the one
 * failure that fires no ledger hook, which is how Python prices a missing key
 * too (no call was made, so no row).
 */
const MISSING_EMBEDDING_PROVIDER: EmbeddingProvider = {
  embed: async () => {
    throw new ProviderConfigError(
      "No embedding provider was supplied to `build load`; the memories block " +
        "degrades to the local FTS index.",
    );
  },
};

export interface BuildLoadDeps {
  readonly nowIso: () => string;
  readonly newId: () => string;
  /** Absent means no provider: the searches degrade to FTS-only, as Python's do. */
  readonly embeddingProvider?: EmbeddingProvider;
  /** Python's `switch_conversation`, injected because it carries the close tail. */
  readonly switchConversation?: (journey: string, sessionId: string | null) => Promise<void>;
  /**
   * `_check_clone_role_guard`'s outcome, injected because its inputs are the
   * MACHINE's -- a git root and a marker file -- and this module is graded as a
   * pure port over a database. `frontDoor/cloneRoleGuard.ts` supplies the real
   * one; the corpus stages a neutral checkout so the guard stays silent.
   *
   * `exitCode: null` is the `--ignore-production-role` case: the warning prints
   * and the session start CONTINUES.
   */
  readonly cloneRoleGuard?: (
    projectPath: string | null,
  ) => { readonly stderr: string; readonly exitCode: number | null } | null;
}

/**
 * Python `_print_builder_entry_surface`.
 *
 * Which surface appears is decided by the CURSOR, not by adoption: an adopted
 * journey whose cursor has neither an active item nor a pending confirmation gets
 * the position report plus `■ Builder Home`; anything else gets `■ BUILDER
 * RESUME`. Both blocks were ported at plateaus 1–2; this is the branch that picks
 * between them.
 *
 * The Refinement field is read from the WORKBENCH only when the project has no
 * canonical index — `include_refinement` is `canonical is None`, which is also the
 * reason a legacy-store project can make `■ BUILDER RESUME` raise where Builder
 * Home degrades (the asymmetry recorded at plateau 2).
 */
function renderEntrySurface(
  db: WritableDatabase,
  slug: string,
  projectPath: string | null,
): string {
  const canonicalRefinementIndex = findCanonicalRefinementIndex(projectPath);
  const resumeState = readBuilderResumeState(db, slug, {
    includeRefinement: canonicalRefinementIndex === null,
  });
  const cursor = resumeState.cursor;
  if (cursor && !cursor.activeItem && !cursor.pendingConfirmation) {
    const candidates = inspectPullCandidates(projectPath, { journey: slug, method: "ariad" });
    const roadmap = inspectRoadmapSnapshot(projectPath, { journey: slug, method: "ariad" });
    return `${printed(
      renderProjectPositionReport(roadmap, { candidates: candidates.candidates }),
    )}${renderBuilderOrientationSurface({
      roadmap,
      candidatesReport: candidates,
      // The Workbench read happens only when there is no canonical index — and it
      // is passed IN, because `inspectRefinementField` is a pure reader over a
      // snapshot the caller took. Python reads it unguarded here, which is the
      // asymmetry plateau 2 recorded: Builder Home degrades where BUILDER RESUME
      // raises on a database predating CV20.DS6.
      refinement: inspectRefinementField(projectPath, {
        workbench: getWorkbenchSnapshot(db, slug),
      }),
    })}`;
  }
  return renderBuilderResumeSurface(resumeState, {
    roadmapPosition: projectPath ? resolveRoadmapPosition(projectPath) : null,
    canonicalRefinementIndex,
  });
}

/**
 * Python's merge of the two searches: dedupe by id, sort by score, take six.
 *
 * Exported and pure because the FIRST-occurrence rule is not observable through
 * the command in any case the corpus could hold. The same memory is ranked in both
 * searches, but its two scores differ only when MMR's diversity penalty differs
 * between the candidate sets, AND the difference has to invert the relative order
 * of two duplicated ids before the rendered block changes. Mutation testing
 * reported the rule ungraded, two corpus shapes failed to expose it, and inventing
 * a third would have been engineering a case to satisfy a mutant rather than to
 * describe behavior.
 *
 * So it is graded here instead, with hand-built inputs, and the limitation is
 * declared rather than implied — the same treatment plateau 5 gave the CAS
 * conflict branch.
 *
 * Keeping the FIRST occurrence means a duplicated memory carries its SCOPED score,
 * which is the one computed among the journey's own memories.
 */
export function mergeRankedResults(
  scoped: readonly { id: string; score: number }[],
  global: readonly { id: string; score: number }[],
  limit = 6,
): { id: string; score: number }[] {
  const seen = new Set<string>();
  const merged: { id: string; score: number }[] = [];
  for (const result of [...scoped, ...global]) {
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    merged.push({ id: result.id, score: result.score });
  }
  // Python sorts by score DESCENDING with a stable sort, so equal scores keep the
  // scoped-before-global order the merge produced. JavaScript's sort is stable by
  // specification since ES2019, so the comparator alone reproduces it.
  merged.sort((left, right) => right.score - left.score);
  return merged.slice(0, limit);
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
  //
  // It exits **2**, not 1 -- a usage-level refusal, the class argparse uses --
  // while the unknown-journey refusal above exits 1. The two are one `if` apart
  // and were the same code until the guard was ported and graded.
  const guard = deps.cloneRoleGuard?.(projectPath) ?? null;
  if (guard !== null && guard.exitCode !== null) {
    return { stdout: "", stderr: guard.stderr, exitCode: guard.exitCode, providerCalls: 0 };
  }

  let stdout = printed(renderBuilderModeTransition({ journey: slug, journeyContent, projectPath }));
  // The override warning precedes the banner, as Python's two `print`s do.
  const stderr = `${guard?.stderr ?? ""}${banner(slug, projectPath)}`;

  if (getAdoptedMethod(db, slug) === "ariad") {
    stdout += printed(renderEntrySurface(db, slug, projectPath));
  }

  stdout += printed(await loadMirrorContext(db, { persona: "engineer", journey: slug }));

  // The two searches. Python runs them unconditionally and passes `log_access`
  // by default, so this read MUTATES `access_count` on what it returns — which is
  // why a second `load` against the same database legitimately reorders the block.
  const query = extractQuery(journeyContent, slug);
  let providerCalls = 0;
  // `calls=` counts round-trips that REACHED a provider. A missing provider is a
  // configuration failure rather than a call -- Python raises before its attempt
  // loop and writes no ledger row -- so counting it would put a call in the
  // front-door log that no ledger row backs.
  const configured = deps.embeddingProvider !== undefined;
  const provider = deps.embeddingProvider ?? MISSING_EMBEDDING_PROVIDER;
  const runSearch = async (journey?: string) => {
    if (configured) providerCalls += 1;
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
  const relevant = mergeRankedResults(scoped.results, global.results);
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
