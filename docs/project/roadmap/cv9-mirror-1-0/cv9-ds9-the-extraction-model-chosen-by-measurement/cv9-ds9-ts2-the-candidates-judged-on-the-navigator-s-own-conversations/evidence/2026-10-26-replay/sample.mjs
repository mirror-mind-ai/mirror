// Draw CV9.DS9.TS2's sample from the production home, read-only; copy the
// transcripts and the user's name to scratch; close the database before any
// model call ever runs.
//
//   node sample.mjs            draw (refuses when a sample already exists)
//   node sample.mjs --check    redraw with the recorded seed and cutoff: same ids,
//                              all ended, all with at least four messages
//
// Eligible: ended (ended_at set, at or before the cutoff), started within the 60
// days before the cutoff, at least four messages (extraction's own gate). Drawn:
// 16 with a journey (at most 5 from any one), 8 without, and 1 pilot from the
// journey pool. Nothing is excluded: the Navigator's consent covers them all.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { openDatabaseReadOnly } from "#db/database.ts";
import {
  ensureScratch,
  PRODUCTION_HOME,
  readJson,
  rng,
  SEEDS,
  scratch,
  shuffle,
  writeJson,
} from "./common.mjs";

const WITH_JOURNEY = 16;
const WITHOUT_JOURNEY = 8;
const PER_JOURNEY_CAP = 5;
const DAYS = 60;

function eligible(db, cutoff) {
  const since = new Date(Date.parse(cutoff) - DAYS * 86_400_000).toISOString();
  return db
    .prepare(
      `SELECT c.id AS id, c.journey AS journey, c.persona AS persona, COUNT(m.id) AS n
         FROM conversations c JOIN messages m ON m.conversation_id = c.id
        WHERE c.ended_at IS NOT NULL AND c.ended_at <= ? AND c.started_at >= ?
        GROUP BY c.id HAVING COUNT(m.id) >= 4
        ORDER BY c.id`,
    )
    .all(cutoff, since);
}

function draw(rows, seed) {
  const random = rng(seed);
  const withJourney = shuffle(
    rows.filter((r) => r.journey),
    random,
  );
  const without = shuffle(
    rows.filter((r) => !r.journey),
    random,
  );
  const picked = [];
  const perJourney = {};
  for (const row of withJourney) {
    if (picked.length === WITH_JOURNEY) break;
    if ((perJourney[row.journey] ?? 0) >= PER_JOURNEY_CAP) continue;
    perJourney[row.journey] = (perJourney[row.journey] ?? 0) + 1;
    picked.push(row);
  }
  const pilot = withJourney.find((row) => !picked.includes(row));
  return { picked, without: without.slice(0, WITHOUT_JOURNEY), pilot };
}

/** Production's own read (closeTail.ts / conversation/extraction.ts). */
function messagesOf(db, id) {
  return db
    .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at")
    .all(id)
    .map((row) => ({ role: String(row.role), content: String(row.content ?? "") }));
}

/** Production's resolveUserName (conversation/extraction.ts), unchanged. */
function userNameOf(db) {
  const row = db
    .prepare("SELECT content FROM identity WHERE layer = ? AND key = ? LIMIT 1")
    .get("user", "identity");
  const content = row ? String(row.content ?? "") : null;
  const match = content?.match(/(?:You are talking to|Você está falando com) ([A-Z][a-zA-Záéíóúãõ]+)/);
  return match?.[1] ?? "User";
}

const itemsOf = ({ picked, without, pilot }) => [
  ...picked.map((row, i) => ({ item: `C${String(i + 1).padStart(2, "0")}`, ...row })),
  ...without.map((row, i) => ({
    item: `C${String(WITH_JOURNEY + i + 1).padStart(2, "0")}`,
    ...row,
  })),
  { item: "P01", ...pilot },
];

const db = openDatabaseReadOnly(join(PRODUCTION_HOME, "memory.db"));
try {
  if (process.argv.includes("--check")) {
    const recorded = readJson(scratch("sample.json"));
    const redrawn = itemsOf(draw(eligible(db, recorded.cutoff), recorded.seed));
    const same =
      JSON.stringify(redrawn.map((r) => [r.item, r.id])) ===
      JSON.stringify(recorded.items.map((r) => [r.item, r.id]));
    const states = recorded.items.map((r) =>
      db
        .prepare(
          "SELECT c.ended_at AS ended, (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS n FROM conversations c WHERE c.id = ?",
        )
        .get(r.id),
    );
    const ended = states.every((s) => s?.ended && s.ended <= recorded.cutoff);
    const enough = states.every((s) => (s?.n ?? 0) >= 4);
    const sample = recorded.items.filter((r) => r.item !== "P01");
    const shape =
      sample.filter((r) => r.journey).length === WITH_JOURNEY &&
      sample.filter((r) => !r.journey).length === WITHOUT_JOURNEY &&
      Object.values(
        sample.filter((r) => r.journey).reduce((acc, r) => {
          acc[r.journey] = (acc[r.journey] ?? 0) + 1;
          return acc;
        }, {}),
      ).every((n) => n <= PER_JOURNEY_CAP);
    console.log(
      `same draw: ${same}; all ended by the cutoff: ${ended}; all >= 4 messages: ${enough}; ` +
        `shape 16/8 with cap ${PER_JOURNEY_CAP}: ${shape}`,
    );
    process.exitCode = same && ended && enough && shape ? 0 : 1;
  } else {
    if (existsSync(scratch("sample.json"))) {
      throw new Error("a sample already exists in scratch; it is drawn once");
    }
    ensureScratch();
    const cutoff = new Date().toISOString();
    const rows = eligible(db, cutoff);
    const items = itemsOf(draw(rows, SEEDS.draw));
    const userName = userNameOf(db);
    for (const row of items) {
      writeJson(scratch("transcripts", `${row.item}.json`), {
        item: row.item,
        userName,
        journey: row.journey || null,
        persona: row.persona || null,
        messages: messagesOf(db, row.id),
      });
    }
    writeJson(scratch("sample.json"), {
      seed: SEEDS.draw,
      cutoff,
      eligible: rows.length,
      eligible_with_journey: rows.filter((r) => r.journey).length,
      items: items.map((r) => ({ item: r.item, id: r.id, journey: r.journey || null, n: r.n })),
    });
    console.log(
      `drawn ${items.length - 1} + pilot from ${rows.length} eligible ` +
        `(${rows.filter((r) => r.journey).length} with a journey); transcripts in scratch`,
    );
  }
} finally {
  db.close();
}
