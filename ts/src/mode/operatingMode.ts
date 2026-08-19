import type { Database, WritableDatabase } from "#db/database.ts";
import {
  decodeMetadata,
  GLOBAL_OPERATING_MODE_SESSION_ID,
  getRuntimeSession,
  upsertRuntimeSession,
} from "#mirror/runtimeSession.ts";

export const OPERATING_MODE_METADATA_KEY = "operating_mode";

export interface OperatingModeState {
  mode: string;
  journey: string | null;
}

export function activateOperatingMode(
  db: WritableDatabase,
  input: { mode: string; journey?: string | null; sessionId?: string | null },
  nowIso: string,
): OperatingModeState {
  const mode = input.mode.trim();
  if (!mode) throw new Error("mode must not be empty");
  const journey = input.journey?.trim() || null;
  const state = { mode, journey };
  const payload = { active_mode: mode, active_journey: journey };
  if (input.sessionId) {
    const session = getRuntimeSession(db, input.sessionId);
    const metadata = decodeMetadata(session?.metadata ?? null);
    metadata[OPERATING_MODE_METADATA_KEY] = payload;
    upsertRuntimeSession(
      db,
      input.sessionId,
      { metadata: JSON.stringify(metadata), active: true },
      nowIso,
    );
  } else {
    upsertRuntimeSession(
      db,
      GLOBAL_OPERATING_MODE_SESSION_ID,
      { metadata: JSON.stringify(payload), active: true },
      nowIso,
    );
  }
  return state;
}

export function deactivateOperatingMode(
  db: WritableDatabase,
  sessionId: string | null,
  nowIso: string,
): void {
  if (!sessionId) {
    upsertRuntimeSession(
      db,
      GLOBAL_OPERATING_MODE_SESSION_ID,
      { metadata: null, active: false },
      nowIso,
    );
    return;
  }
  const session = getRuntimeSession(db, sessionId);
  if (!session) return;
  const metadata = decodeMetadata(session.metadata);
  delete metadata[OPERATING_MODE_METADATA_KEY];
  upsertRuntimeSession(
    db,
    sessionId,
    { metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null },
    nowIso,
  );
}

export function getActiveOperatingMode(
  db: Database,
  sessionId: string | null,
): OperatingModeState | null {
  if (sessionId) {
    const session = getRuntimeSession(db, sessionId);
    const payload = decodeMetadata(session?.metadata ?? null)[OPERATING_MODE_METADATA_KEY];
    const state = stateFromPayload(payload);
    if (state) return state;
  }
  const global = getRuntimeSession(db, GLOBAL_OPERATING_MODE_SESSION_ID);
  if (!global?.active) return null;
  return stateFromPayload(decodeMetadata(global.metadata));
}

function stateFromPayload(payload: unknown): OperatingModeState | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const mode = typeof record.active_mode === "string" ? record.active_mode.trim() : "";
  if (!mode) return null;
  const journey =
    typeof record.active_journey === "string" && record.active_journey.trim()
      ? record.active_journey.trim()
      : null;
  return { mode, journey };
}

export function renderModeActivation(state: OperatingModeState): string {
  return state.journey
    ? `Activated ${state.mode} for ${state.journey}\n`
    : `Activated ${state.mode}\n`;
}

export function renderModeStatus(state: OperatingModeState | null): string {
  if (!state) return "Mirror Mode\n";
  return state.journey ? `${state.mode} · ${state.journey}\n` : `${state.mode}\n`;
}
