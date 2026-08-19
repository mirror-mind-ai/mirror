import type { Database, WritableDatabase } from "#db/database.ts";
import {
  type CollectExtensionContextOptions,
  collectExtensionContext,
  type ExtensionContextDiagnostic,
} from "#extensions/contextRuntime.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";
import { logLlmCall } from "#observability/llmCalls.ts";
import type { EmbeddingProvider } from "#providers/embedding.ts";
import type { LlmProvider } from "#providers/llm.ts";
import { loadMirrorContext } from "./context.ts";
import { type ResolvedMirrorDefaults, resolveMirrorDefaults } from "./defaultResolution.ts";
import { pythonTruthy, sliceCodePoints } from "./reception.ts";
import {
  renderJourneyDetected,
  renderMirrorBanner,
  renderMirrorJourneys,
  renderMirrorModeTransition,
} from "./render.ts";
import {
  decodeMetadata,
  GLOBAL_STICKY_DEFAULTS_SESSION_ID,
  getRuntimeSession,
  resolveRuntimeSessionId,
  upsertRuntimeSession,
} from "./runtimeSession.ts";

export interface MirrorLoadInput {
  identity: string;
  persona?: string | null;
  journey?: string | null;
  query?: string | null;
  org?: boolean;
  contextOnly?: boolean;
  sessionId?: string | null;
  environmentSessionId?: string | null;
  receptionEnabled: boolean;
  llmProvider?: LlmProvider;
  embeddingProvider?: EmbeddingProvider;
  databasePath?: string;
  mirrorHome?: string;
  user?: string;
  extensionRuntime?: Pick<
    CollectExtensionContextOptions,
    "timeoutMs" | "maxOutputBytes" | "legacyCommand" | "legacyCwd" | "environment"
  >;
  newId: () => string;
  nowIso: () => string;
}

export interface RenderedMirrorLoad {
  stdout: string;
  stderr: string;
  resolved: ResolvedMirrorDefaults;
  extensionDiagnostics: ExtensionContextDiagnostic[];
}

export async function runMirrorLoad(
  db: WritableDatabase,
  input: MirrorLoadInput,
): Promise<RenderedMirrorLoad> {
  const resolved = await resolveMirrorDefaults(db, {
    ...input,
    onReceptionLlmCall: (response, prompt) =>
      logLlmCall(
        db,
        {
          role: "reception",
          model: response.model ?? "unknown",
          prompt,
          response: response.content,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          latencyMs: response.latencyMs,
          sessionId: input.sessionId ?? null,
        },
        { id: input.newId, now: input.nowIso },
      ),
  });
  const extensionContext =
    input.databasePath && input.mirrorHome
      ? collectExtensionContext(db, {
          mirrorHome: input.mirrorHome,
          databasePath: input.databasePath,
          personaId: resolved.persona,
          journeyId: resolved.journey,
          user: input.user ?? "",
          query: input.query,
          ...input.extensionRuntime,
        })
      : { rendered: "", diagnostics: [] };
  const context = await loadMirrorContext(db, {
    persona: resolved.persona,
    journey: resolved.journey,
    org: input.org,
    query: input.query,
    touchesIdentity: resolved.touchesIdentity,
    touchesShadow: resolved.touchesShadow,
    embeddingProvider: input.embeddingProvider,
    extensionContext: extensionContext.rendered,
  });
  persistStickyDefaults(db, resolved.persona, resolved.journey, input.nowIso());
  activateOperatingMode(db, { mode: "Mirror Mode", journey: resolved.journey }, input.nowIso());
  writeMirrorState(
    db,
    {
      active: true,
      persona: resolved.persona,
      journey: resolved.journey,
      sessionId: input.sessionId ?? null,
    },
    input.nowIso(),
  );
  if (!input.contextOnly) {
    bindConversationContext(
      db,
      input.sessionId ?? null,
      input.environmentSessionId ?? null,
      resolved.persona,
      resolved.journey,
      input.newId,
      input.nowIso,
    );
  }
  const personas = db
    .prepare("SELECT key FROM identity WHERE layer = 'persona' ORDER BY key")
    .all()
    .map((row) => String(row.key));
  const transition = renderMirrorModeTransition({
    identity: input.identity,
    journey: resolved.journey,
    personas,
  });
  const detected = resolved.detectedJourney?.[0];
  return {
    stdout: `${transition}\n${context}\n`,
    stderr: `${detected ? renderJourneyDetected(detected) : ""}${renderMirrorBanner(resolved.persona)}`,
    resolved,
    extensionDiagnostics: extensionContext.diagnostics,
  };
}

export function deactivateMirrorState(
  db: WritableDatabase,
  sessionId: string,
  nowIso: string,
): void {
  writeMirrorState(db, { active: false, sessionId }, nowIso);
}

export function logMirrorResponse(
  db: WritableDatabase,
  input: {
    summary: string;
    sessionId?: string | null;
    environmentSessionId?: string | null;
    muted: boolean;
    newId: () => string;
    nowIso: () => string;
  },
): void {
  if (input.muted) return;
  const sessionId = resolveRuntimeSessionId(
    db,
    input.sessionId ?? null,
    input.environmentSessionId ?? null,
  );
  if (!sessionId) return;
  const session = getRuntimeSession(db, sessionId);
  const discarded = pythonTruthy(
    decodeMetadata(session?.metadata ?? null).discard_current_conversation,
  );
  const conversationId = discarded
    ? session?.conversationId &&
      db.prepare("SELECT 1 FROM conversations WHERE id = ?").get(session.conversationId)
      ? session.conversationId
      : null
    : getOrCreateConversation(db, sessionId, input.newId, input.nowIso);
  if (!conversationId) return;
  if (!discarded) {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at, token_count, metadata)
       VALUES (?, ?, 'assistant', ?, ?, NULL, NULL)`,
    ).run(input.newId(), conversationId, input.summary, input.nowIso());
  }
  db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(
    titleFromSummary(input.summary),
    conversationId,
  );
}

export function listActiveMirrorJourneys(db: Database): string {
  const rows = db
    .prepare("SELECT key, content FROM identity WHERE layer = 'journey' ORDER BY key")
    .all()
    .map((row) => journeyDto(String(row.key), typeof row.content === "string" ? row.content : ""))
    .filter((row) => row.status === "active");
  return renderMirrorJourneys(rows);
}

export function titleFromSummary(summary: string): string {
  let title = summary.split(/[.!?]/, 1)[0]?.trim() ?? "";
  if ([...title].length > 60) {
    const prefix = [...title].slice(0, 60).join("");
    const space = prefix.lastIndexOf(" ");
    title = `${space >= 0 ? prefix.slice(0, space) : prefix}...`;
  }
  return title;
}

function persistStickyDefaults(
  db: WritableDatabase,
  persona: string | null,
  journey: string | null,
  nowIso: string,
): void {
  if (persona === null && journey === null) return;
  upsertRuntimeSession(
    db,
    GLOBAL_STICKY_DEFAULTS_SESSION_ID,
    {
      interface: "global_defaults",
      mirrorActive: false,
      ...(persona !== null ? { persona } : {}),
      ...(journey !== null ? { journey } : {}),
      hookInjected: true,
      active: false,
    },
    nowIso,
  );
}

function writeMirrorState(
  db: WritableDatabase,
  input: {
    active: boolean;
    persona?: string | null;
    journey?: string | null;
    sessionId: string | null;
  },
  nowIso: string,
): void {
  if (!input.sessionId) return;
  upsertRuntimeSession(
    db,
    input.sessionId,
    {
      mirrorActive: input.active,
      ...(input.persona !== undefined && input.persona !== null ? { persona: input.persona } : {}),
      ...(input.journey !== undefined && input.journey !== null ? { journey: input.journey } : {}),
      hookInjected: !input.active,
    },
    nowIso,
  );
}

function bindConversationContext(
  db: WritableDatabase,
  explicitSessionId: string | null,
  environmentSessionId: string | null,
  persona: string | null,
  journey: string | null,
  newId: () => string,
  nowIso: () => string,
): string | null {
  const sessionId = resolveRuntimeSessionId(db, explicitSessionId, environmentSessionId);
  if (!sessionId) return null;
  const session = getRuntimeSession(db, sessionId);
  const existing = session?.conversationId
    ? db.prepare("SELECT id, ended_at FROM conversations WHERE id = ?").get(session.conversationId)
    : undefined;
  let conversationId: string;
  if (existing && existing.ended_at === null) {
    conversationId = String(existing.id);
    db.prepare("UPDATE conversations SET persona = ?, journey = ? WHERE id = ?").run(
      persona,
      journey,
      conversationId,
    );
  } else {
    conversationId = newId();
    db.prepare(
      `INSERT INTO conversations
        (id, title, started_at, ended_at, interface, persona, journey, summary, tags, metadata)
       VALUES (?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, NULL)`,
    ).run(conversationId, nowIso(), session?.interface ?? "claude_code", persona, journey);
  }
  upsertRuntimeSession(
    db,
    sessionId,
    {
      conversationId,
      interface: session?.interface ?? "claude_code",
      ...(persona !== null ? { persona } : {}),
      ...(journey !== null ? { journey } : {}),
      active: true,
      closedAt: null,
    },
    nowIso(),
  );
  return conversationId;
}

function getOrCreateConversation(
  db: WritableDatabase,
  sessionId: string,
  newId: () => string,
  nowIso: () => string,
): string {
  const session = getRuntimeSession(db, sessionId);
  if (session?.conversationId) {
    const existing = db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get(session.conversationId);
    if (existing) return String(existing.id);
  }
  const id = newId();
  const now = nowIso();
  const interfaceName = session?.interface ?? "claude_code";
  db.prepare(
    `INSERT INTO conversations
      (id, title, started_at, ended_at, interface, persona, journey, summary, tags, metadata)
     VALUES (?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, NULL)`,
  ).run(id, now, interfaceName, session?.persona ?? null, session?.journey ?? null);
  upsertRuntimeSession(
    db,
    sessionId,
    { conversationId: id, interface: interfaceName, active: true, closedAt: null },
    now,
  );
  return id;
}

function journeyDto(id: string, content: string) {
  const name = (content.split("\n")[0] ?? "").trim().replace(/^[# ]+/, "");
  const status = content.match(/\*\*Status:\*\*\s*([\p{L}\p{N}_]+)/u)?.[1] ?? "unknown";
  const description =
    content.match(/## (?:Description|Descrição)\s*\n+(.+?)(?:\n\n|\n##)/s)?.[1]?.trim() ?? "";
  const truncatedDescription = sliceCodePoints(description, 150);
  return { id, name, description: truncatedDescription, status };
}
