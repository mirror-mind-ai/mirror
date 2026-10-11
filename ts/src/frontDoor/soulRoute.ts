// CV22.DS7.US6 plateau 6 — the `soul` front-door route.
//
// Dispatch only: every behavior it reaches was ported and graded in plateaus
// 1-5. What this module owns is the argv shape, the exit codes, and the
// refusals — Python's `cmd_*` wrappers print `Error: <message>` to stderr and
// exit 1 for a ValueError, and argparse exits 2 for an unknown subcommand or a
// missing required argument.
//
// The subcommands are allowlisted BY NAME by `routing.ts`, so a subcommand
// Python grows later reaches Python instead of inheriting this route. That is
// the `conversations append` lesson (RS009/CR055): a family claimed wholesale
// answered an argv shape it had never implemented, exited 0, and discarded the
// caller's data.

import type { Database, WritableDatabase } from "#db/database.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { persistStickyDefaults } from "#mirror/orchestration.ts";
import { resolveRuntimeSessionId } from "#mirror/runtimeSession.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";
import { embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import { generateEmbeddingSafely } from "#providers/embedding.ts";
import { resolveFamilyProviders } from "#providers/familyProviders.ts";
import { SOUL_HARVEST_TRANSPORT } from "#providers/transport.ts";
import { applyIdentityIntegration, SoulApplyError } from "#soul/apply.ts";
import {
  persistHarvestSave,
  planHarvestSave,
  SoulHarvestError,
  type TranscriptMessage,
} from "#soul/harvest.ts";
import {
  composeSoulBeautyVoicePrompt,
  composeSoulSelfVoicePrompt,
  composeSoulWisdomVoicePrompt,
} from "#soul/prompts.ts";
import {
  renderActiveRite,
  renderClosingRite,
  renderEnrichmentProposal,
  renderFruitInMaturation,
  renderHarvestedFruit,
  renderIdentityChangeApplied,
  renderIntegrationReview,
  renderPossibleListenings,
  type SoulListeningOption,
  SoulSurfaceError,
} from "#soul/render.ts";
import {
  clearFruitInMaturation,
  clearHarvestedFruit,
  getFruitInMaturation,
  getHarvestedFruit,
  harvestFruit,
  resolveCliSoulSessionId,
  SoulStateError,
  setFruitInMaturation,
} from "#soul/state.ts";
import { renderSoulModeTransition } from "#soul/transition.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { pyStrip } from "#util/pythonText.ts";
import { optionValue, stripOptionWithValue } from "./args.ts";

/** Python's argparse subcommands, by name. Order is irrelevant; membership is not. */
export const SOUL_SUBCOMMANDS = [
  "load",
  "listen",
  "rite",
  "close",
  "review",
  "propose",
  "apply",
  "fruit",
  "harvest",
  "prompt",
] as const;

const OPTIONS_WITH_VALUES = [
  "--mirror-home",
  "--db-path",
  "--session-id",
  "--matter",
  "--self",
  "--shadow",
  "--wisdom",
  "--beauty",
  "--says",
  "--listening-for",
  "--question",
  "--harvested",
  "--echoes",
  "--open",
  "--integration",
  "--origin",
  "--journal",
  "--ego",
  "--persona",
  "--key",
  "--current",
  "--proposed",
  "--why",
  "--confirm",
  "--conversation-id",
  "--journal-id",
  "--journey",
];

function positionals(args: readonly string[]): string[] {
  return OPTIONS_WITH_VALUES.reduce<string[]>(
    (remaining, option) => stripOptionWithValue(remaining, option),
    [...args],
  );
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

export interface SoulRouteDeps {
  readMessages: (db: Database, conversationId: string) => TranscriptMessage[];
  /**
   * The harvest journal's embedding (CV22.DS8.US3).
   *
   * Async because it is a real, billable provider round trip: `routing.ts`
   * used to keep `harvest save` on Python unless a replay fixture was set, and
   * nothing ever supplied one through the front door -- so the only leaf of
   * the Soul command that crosses the provider seam could not complete on
   * TypeScript at all. The route now resolves the family's provider and
   * embeds through `generateEmbeddingSafely`, with the ledger hook attached.
   */
  embed: (db: WritableDatabase, text: string) => Promise<Uint8Array>;
  newId: () => string;
  nowIso: () => string;
}

export const defaultSoulRouteDeps: SoulRouteDeps = {
  readMessages: (db, conversationId) =>
    db
      .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY rowid")
      .all(conversationId) as unknown as TranscriptMessage[],
  embed: async (db, text) => {
    const family = await resolveFamilyProviders(process.env, SOUL_HARVEST_TRANSPORT);
    if (!family?.embedding) {
      // `routing.ts` reverts the family before the route is reached, so this
      // is defense in depth rather than the operator-facing message.
      throw new SoulHarvestError("soul harvest save requires an embedding provider");
    }
    // Through the wrapper, like every other embedding path: bounded retry of a
    // transient empty payload, the AI-07 dimension guard, and one ledger row
    // per round trip, priced (CR075's adjacent case).
    const vector = await generateEmbeddingSafely(family.embedding, text, {
      onAttempt: embeddingLedgerHook(db),
    });
    return new Uint8Array(new Float32Array(vector).buffer);
  },
  newId,
  nowIso,
};

export async function runSoulRoute(
  db: WritableDatabase,
  argv: readonly string[],
  deps: SoulRouteDeps = defaultSoulRouteDeps,
): Promise<number> {
  const rawArgs = argv.slice(1);
  const args = positionals(rawArgs);
  const sub = args[0];
  const option = (name: string) => optionValue(rawArgs, name);

  try {
    switch (sub) {
      case "load":
        return runLoad(db, args[1] ?? null, option("--session-id"), deps);
      case "listen":
        return write(renderPossibleListenings(listeningOptions(option)));
      case "rite": {
        const voice = args[1];
        if (!voice) return usageError("soul rite requires a voice");
        return write(
          renderActiveRite(voice, {
            utterance: option("--says"),
            listeningFor: option("--listening-for"),
            question: option("--question"),
          }),
        );
      }
      case "close":
        return write(
          renderClosingRite({
            harvested: option("--harvested"),
            echoes: option("--echoes"),
            remainsOpen: option("--open"),
            integration: option("--integration"),
          }),
        );
      case "review":
        return write(
          renderIntegrationReview({
            // `--origin` and its legacy alias `--journal` share one argparse
            // destination, so the LAST one on the command line wins -- not a
            // fixed precedence between them.
            journal: lastOptionValue(rawArgs, ["--origin", "--journal"]),
            selfMaterial: option("--self"),
            shadow: option("--shadow"),
            ego: option("--ego"),
            persona: option("--persona"),
            leaveOpen: option("--open"),
          }),
        );
      case "propose": {
        const layer = args[1];
        if (!layer) return usageError("soul propose requires a layer");
        const key = resolveIdentityKey(layer, option("--key"));
        return write(
          renderEnrichmentProposal(layer, {
            key,
            origin: option("--origin") ?? "",
            current: option("--current"),
            proposed: option("--proposed") ?? "",
            why: option("--why") ?? "",
          }),
        );
      }
      case "apply":
        return runApply(db, args[1], option, deps);
      case "fruit":
        return runFruit(db, args[1], args[2] ?? null, option("--session-id"), deps);
      case "harvest":
        return await runHarvest(db, args[1], args[2] ?? null, option, deps);
      case "prompt":
        return runPrompt(db, args[1]);
      default:
        return usageError(`soul: unknown subcommand ${sub ?? ""}`);
    }
  } catch (error) {
    if (
      error instanceof SoulSurfaceError ||
      error instanceof SoulStateError ||
      error instanceof SoulApplyError ||
      error instanceof SoulHarvestError
    ) {
      return fail(error.message);
    }
    throw error;
  }
}

/** The value of whichever of `names` appears LAST in argv, as argparse resolves a shared dest. */
function lastOptionValue(args: readonly string[], names: readonly string[]): string | null {
  let value: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    if (names.includes(args[index] as string)) value = args[index + 1] ?? null;
  }
  return value;
}

function write(rendered: string): number {
  process.stdout.write(`${rendered}\n`);
  return 0;
}

function listeningOptions(option: (name: string) => string | null): SoulListeningOption[] {
  const raw: [string, string | null][] = [
    ["self", option("--self")],
    ["shadow", option("--shadow")],
    ["wisdom", option("--wisdom")],
    ["beauty", option("--beauty")],
  ];
  return raw
    .filter(([, description]) => description !== null && description.trim() !== "")
    .map(([voice, description]) => ({ voice, description: (description as string).trim() }));
}

/** Port of `_resolve_identity_key`. */
function resolveIdentityKey(layer: string, key: string | null): string {
  if (layer === "self") return key || "soul";
  if (layer === "shadow") return key || "profile";
  if (layer === "ego") return key || "behavior";
  if (layer === "persona") {
    if (!key) throw new SoulApplyError("persona proposals require --key");
    return key;
  }
  throw new SoulApplyError(`unsupported psyche layer: ${layer}`);
}

function runLoad(
  db: WritableDatabase,
  slug: string | null,
  sessionId: string | null,
  deps: SoulRouteDeps,
): number {
  const now = deps.nowIso();
  if (slug) {
    if (!getIdentityContent(db, "journey", slug)) {
      process.stderr.write(`Error: journey '${slug}' not found.\n`);
      return 1;
    }
    persistStickyDefaults(db, null, slug, now);
  }
  // `cmd_load` uses the OPERATING-MODE resolver, not the Soul one, and that
  // resolver may return null -- in which case `activate_mode` writes the GLOBAL
  // mode row instead of a session row. Falling back to `__global_soul_mode__`
  // here would silently write to a different row than Python does.
  const resolvedSessionId = resolveRuntimeSessionId(
    db,
    sessionId,
    process.env.MIRROR_SESSION_ID ?? null,
  );
  activateOperatingMode(
    db,
    { mode: "Soul Mode", journey: slug, sessionId: resolvedSessionId },
    now,
  );
  return write(renderSoulModeTransition(slug));
}

function runApply(
  db: WritableDatabase,
  layer: string | undefined,
  option: (name: string) => string | null,
  deps: SoulRouteDeps,
): number {
  if (!layer) return usageError("soul apply requires a layer");
  const key = resolveIdentityKey(layer, option("--key"));
  if (option("--confirm") !== "APPLY") {
    return fail("identity update requires --confirm APPLY");
  }
  const content = pyStrip(option("--proposed") ?? "");
  if (!content) return fail("identity content must not be empty");
  applyIdentityIntegration(
    db,
    {
      layer,
      key,
      content,
      origin: option("--origin"),
      conversationId: option("--conversation-id"),
      journalId: option("--journal-id"),
    },
    { newId: deps.newId, nowIso: deps.nowIso() },
  );
  return write(renderIdentityChangeApplied(layer, { key, content }));
}

function runFruit(
  db: WritableDatabase,
  action: string | undefined,
  fruit: string | null,
  sessionId: string | null,
  deps: SoulRouteDeps,
): number {
  const resolved = resolveCliSoulSessionId(db, sessionId, process.env.MIRROR_SESSION_ID ?? null);
  if (action === "set") {
    if (fruit === null) return usageError("soul fruit set requires a fruit");
    const state = setFruitInMaturation(db, fruit, resolved, deps.nowIso());
    return write(renderFruitInMaturation(state.fruit ?? ""));
  }
  if (action === "show") {
    const state = getFruitInMaturation(db, resolved);
    if (!state.fruit) return fail("No fruit in maturation.");
    return write(renderFruitInMaturation(state.fruit));
  }
  if (action === "clear") {
    clearFruitInMaturation(db, resolved, deps.nowIso());
    process.stdout.write("Fruit in maturation cleared.\n");
    return 0;
  }
  return usageError(`soul fruit: unknown action ${action ?? ""}`);
}

async function runHarvest(
  db: WritableDatabase,
  action: string | undefined,
  fruit: string | null,
  option: (name: string) => string | null,
  deps: SoulRouteDeps,
): Promise<number> {
  const resolved = resolveCliSoulSessionId(
    db,
    option("--session-id"),
    process.env.MIRROR_SESSION_ID ?? null,
  );
  if (action === "set") {
    const state = harvestFruit(db, { fruit, sessionId: resolved }, deps.nowIso());
    return write(renderHarvestedFruit(state.fruit ?? ""));
  }
  if (action === "show") {
    const state = getHarvestedFruit(db, resolved);
    if (!state.fruit) return fail("No harvested fruit.");
    return write(renderHarvestedFruit(state.fruit));
  }
  if (action === "save") {
    const state = getHarvestedFruit(db, resolved);
    if (!state.fruit) return fail("No harvested fruit.");
    // Compose, then embed, then persist. The fruit is cleared inside the
    // persist step, so a failing embedding leaves it harvested for a retry
    // rather than losing it to a provider outage -- Python's ordering.
    const plan = planHarvestSave(db, resolved, (conversationId) =>
      deps.readMessages(db, conversationId),
    );
    const embedding = await deps.embed(db, plan.embedText);
    const result = persistHarvestSave(
      db,
      plan,
      { sessionId: resolved, journey: option("--journey") },
      { newId: deps.newId, nowIso: deps.nowIso(), embedding },
    );
    process.stdout.write(`Harvest saved to journal. ${result.memoryId}\n`);
    return 0;
  }
  if (action === "decline") {
    clearHarvestedFruit(db, resolved, deps.nowIso());
    process.stdout.write("Harvest discarded without journal save.\n");
    return 0;
  }
  return usageError(`soul harvest: unknown action ${action ?? ""}`);
}

function runPrompt(db: Database, voice: string | undefined): number {
  // `print(prompt)` appends a newline to a template that already ends with one,
  // so the shipped output ends with two. Stripping either is a divergence.
  if (voice === "self") return write(composeSoulSelfVoicePrompt(db));
  if (voice === "wisdom") return write(composeSoulWisdomVoicePrompt());
  if (voice === "beauty") return write(composeSoulBeautyVoicePrompt());
  process.stderr.write(`Error: unsupported Soul Mode prompt voice: ${voice ?? ""}\n`);
  return 1;
}
