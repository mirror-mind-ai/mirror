// Front-door `identity set` write handler (US4).
//
// `applyIdentitySet` is the testable core of routing `identity set` to the TS
// core: it decides the created/updated verb from the pre-write state and applies
// the ported `setIdentity` (US3) with a generated id/now. `ensureBackup` takes the
// hash-verified backup that `openDatabaseForWrite` requires, so a live write is
// never unguarded. Only `identity set` is routed here; `identity edit` is
// interactive ($EDITOR) and stays on Python.

import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type BackupRecord, sha256File } from "../db/backupGate.ts";
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

/**
 * Copy the live DB to a sibling backup and return its verified record. A fixed
 * name means only the latest pre-write state is retained (last-known-good before
 * this write), avoiding unbounded backup accumulation on a rare command.
 */
export function ensureBackup(dbPath: string): BackupRecord {
  const backupPath = join(dirname(dbPath), ".mirror-frontdoor-backup.db");
  copyFileSync(dbPath, backupPath);
  return { path: backupPath, sha256: sha256File(backupPath) };
}
