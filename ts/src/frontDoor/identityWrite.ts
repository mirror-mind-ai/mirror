// Front-door `identity set` write handler (US4).
//
// `applyIdentitySet` is the testable core of routing `identity set` to the TS
// core: it decides the created/updated verb from the pre-write state and applies
// the ported `setIdentity` (US3) with a generated id/now. The pre-write backup
// that `openDatabaseForWrite` requires lives in `liveBackup.ts`. Only
// `identity set` is routed here; `identity edit` is interactive ($EDITOR) and
// stays on Python.

import type { WritableDatabase } from "../db/database.ts";
import { setIdentity } from "../identity/setIdentity.ts";

export interface IdentitySetOutcome {
  action: "created" | "updated";
  layer: string;
  key: string;
}

/** Apply `identity set`: upsert content (metadata inherited), reporting the verb. */
export function applyIdentitySet(
  db: WritableDatabase,
  params: { layer: string; key: string; content: string; id: string; nowIso: string },
): IdentitySetOutcome {
  const existing =
    db
      .prepare("SELECT id FROM identity WHERE layer = ? AND key = ?")
      .get(params.layer, params.key) !== undefined;
  setIdentity(
    db,
    { id: params.id, layer: params.layer, key: params.key, content: params.content },
    params.nowIso,
  );
  return { action: existing ? "updated" : "created", layer: params.layer, key: params.key };
}
