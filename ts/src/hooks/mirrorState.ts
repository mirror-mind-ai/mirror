// Mirror Mode state for one runtime session, as Antigravity's PreInvocation
// hook needs it (the Claude-family inject hook stopped reading it in
// CV9.DS8.US4: it hands the turn to `mirror doorman`, which reads for itself).
//
// The TypeScript replacement for the Python hook module `mirror_state` (144
// lines, deleted with the core at CV22.DS10.TS5), which
// `mirror-inject.sh` invoked up to three times per prompt -- `needs-inject`,
// `get persona`, `get journey` -- each a separate interpreter start, each
// re-opening the database and re-running bootstrap.
//
// It is NOT ported as a front-door command. Its only caller was ever that one
// script, and the state it reads already belongs to `#mirror/runtimeSession.ts`;
// adding two commands whose sole consumer is a hook would widen the command
// surface this story exists to shrink.
//
// `needs_inject` and `mark_injected` -- the once-injection the inject hook
// used to owe a Mirror Mode session -- left with US4; nothing reads
// `hook_injected` since. The column and the writes that still fill it are one
// debt item, dropped together in a `runtime_sessions` migration.

import { openDatabaseReadOnly } from "#db/database.ts";
import { getRuntimeSession } from "#mirror/runtimeSession.ts";

export interface MirrorHookState {
  readonly active: boolean;
  readonly persona: string;
  readonly journey: string;
}

const NO_STATE: MirrorHookState = {
  active: false,
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
      persona: session.persona ?? "",
      journey: session.journey ?? "",
    };
  } catch {
    return NO_STATE;
  } finally {
    db.close();
  }
}
