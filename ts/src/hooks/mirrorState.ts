// Mirror Mode state for one runtime session, as the inject hook needs it.
//
// The TypeScript replacement for `memory.hooks.mirror_state` (144 lines), which
// `mirror-inject.sh` invoked up to three times per prompt -- `needs-inject`,
// `get persona`, `get journey` -- each a separate interpreter start, each
// re-opening the database and re-running bootstrap.
//
// It is NOT ported as a front-door command. Its only caller was ever that one
// script, and the state it reads already belongs to `#mirror/runtimeSession.ts`;
// adding two commands whose sole consumer is a hook would widen the command
// surface this story exists to shrink.
//
// One Python behavior is deliberately kept, because it is a real safeguard:
// a missing session id FAILS LOUD on stderr rather than silently answering
// "nothing to do". A hook integration that forgets to pass one would otherwise
// look like a user who simply has Mirror Mode off.

import { openDatabaseReadOnly, type WritableDatabase } from "#db/database.ts";
import { getRuntimeSession, upsertRuntimeSession } from "#mirror/runtimeSession.ts";

export interface MirrorHookState {
  readonly active: boolean;
  readonly hookInjected: boolean;
  readonly persona: string;
  readonly journey: string;
}

const NO_STATE: MirrorHookState = {
  active: false,
  hookInjected: false,
  persona: "",
  journey: "",
};

/** Python `_load_state`: the session's Mirror fields, or empty when unknown. */
export function readMirrorState(dbPath: string, sessionId: string): MirrorHookState {
  if (!sessionId) return NO_STATE;
  let db: ReturnType<typeof openDatabaseReadOnly>;
  try {
    db = openDatabaseReadOnly(dbPath);
  } catch {
    return NO_STATE;
  }
  try {
    const session = getRuntimeSession(db, sessionId);
    if (!session) return NO_STATE;
    return {
      active: session.mirrorActive,
      hookInjected: session.hookInjected,
      persona: session.persona ?? "",
      journey: session.journey ?? "",
    };
  } catch {
    return NO_STATE;
  } finally {
    db.close();
  }
}

/** Python `needs_inject`: Mirror Mode is on and context has not been injected. */
export function needsInject(state: MirrorHookState): boolean {
  return state.active && !state.hookInjected;
}

/** Python `mark_injected`, over an already-open writable connection. */
export function markInjected(db: WritableDatabase, sessionId: string, nowIso: string): void {
  if (!sessionId) return;
  if (!getRuntimeSession(db, sessionId)) return;
  upsertRuntimeSession(db, sessionId, { hookInjected: true }, nowIso);
}
