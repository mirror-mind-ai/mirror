// Session backfills from runtime-written JSONL (CV22.DS7.US10 slice E).
//
// Ports `backfill_pi_sessions` and `backfill_codex_session` from
// `src/memory/cli/conversation_logger.py`. Both import a closed session the
// live hooks never saw, through the atomic seam in `sessionImport.ts`, and
// both are graded against `ts/test/goldens/backfill.golden.json`.
//
// The two are deliberately NOT unified beyond that seam, because Python's
// asymmetries are the contract:
//   * Pi titles through `set_provisional_title` (whitespace collapse plus
//     `title_source`/`title_status` provenance in metadata); Codex titles
//     through `_generate_title` and a bare column write with no provenance.
//   * Pi tolerates a corrupt or structurally invalid file by skipping THAT
//     file and continuing the walk; Codex gives up on its single file.
//   * Pi parses every timestamp form (millisecond epoch, string, absent);
//     Codex stores the raw `timestamp` value and lets the model reject a
//     missing one.
//
// Nothing here touches a provider or the clock directly: `now` is injected
// through `LoggerDeps`, which is what makes "no timestamp -> now" pinnable.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { generateTitle, type LoggerDeps, setProvisionalTitle } from "#conversation/logger.ts";
import { type ImportedMessage, importClosedConversation } from "#conversation/sessionImport.ts";
import type { WritableDatabase } from "#db/database.ts";
import { expandHome } from "#util/paths.ts";
import { comparePathComponents, sliceCodePoints } from "#util/pythonText.ts";

/** Python `_DEFAULT_PI_SESSIONS_DIR`: `~/.pi/agent/sessions`. */
export function defaultPiSessionsDir(homeDir: string): string {
  return join(homeDir, ".pi", "agent", "sessions");
}

/**
 * Python's source-directory resolution for the Pi backfill, in order:
 * explicit argument -> `PI_SESSIONS_DIR` -> `~/.pi/agent/sessions`.
 * (Python's module-level `_PI_SESSIONS_DIR` override exists only for its own
 * test monkey-patching and has no runtime input; it is not a contract.)
 */
export function resolvePiSessionsDir(
  explicit: string | null | undefined,
  env: { PI_SESSIONS_DIR?: string },
  homeDir: string,
): string {
  if (explicit) return expandHome(explicit);
  if (env.PI_SESSIONS_DIR) return expandHome(env.PI_SESSIONS_DIR);
  return defaultPiSessionsDir(homeDir);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Python `dict.get(key, default)` on a value that MUST be a dict: anything
 * else raises AttributeError, which each parser turns into its own failure
 * mode. The default applies only when the key is ABSENT -- a present `null`
 * is returned as null, exactly as Python returns None, so a later `.get` on
 * it raises rather than silently reading from the default.
 */
function getOr(container: unknown, key: string, fallback: unknown): unknown {
  if (!isRecord(container)) throw new TypeError(`expected an object with '${key}'`);
  return key in container ? container[key] : fallback;
}

function getFrom(container: unknown, key: string): unknown {
  return getOr(container, key, undefined);
}

/** Python truthiness for JSON values: empty containers are falsy too. */
function pythonTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return Boolean(value);
}

/** Python `_parse_pi_content`: a string as-is, text blocks joined by `\n`, else `""`. */
export function parsePiContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (!isRecord(block) || block.type !== "text") continue;
      const text = block.text ?? "";
      // `"\n".join(...)` raises on a non-str item; the file is skipped.
      if (typeof text !== "string") throw new TypeError("text block is not a string");
      parts.push(text);
    }
    return parts.join("\n");
  }
  return "";
}

/**
 * Python `datetime.fromtimestamp(ms / 1000, tz=utc).isoformat()`:
 * `+00:00` suffix (not `Z`), microseconds only when non-zero, rounded from
 * the fractional second the way CPython does (`round(frac * 1e6)`).
 */
function pythonUtcIsoFromEpochMs(epochMs: number): string {
  const seconds = epochMs / 1000;
  let whole = Math.floor(seconds);
  let micros = Math.round((seconds - whole) * 1e6);
  if (micros >= 1_000_000) {
    whole += 1;
    micros -= 1_000_000;
  }
  const base = new Date(whole * 1000).toISOString().slice(0, 19);
  const fraction = micros === 0 ? "" : `.${String(micros).padStart(6, "0")}`;
  return `${base}${fraction}+00:00`;
}

/**
 * Python `_parse_pi_timestamp`: a number above 1e10 is a millisecond epoch;
 * a string is stored verbatim; anything else (absent, null, a seconds epoch,
 * a boolean -- which is an int in Python but never exceeds 1e10) is `now`.
 */
export function parsePiTimestamp(value: unknown, now: () => string): string {
  if (typeof value === "number" && value > 1e10) return pythonUtcIsoFromEpochMs(value);
  if (typeof value === "string") return value;
  return now();
}

/**
 * Parse one Pi session file into importable messages. Throws on any line
 * that is not valid JSON or not the expected shape -- Python wraps the whole
 * file loop in one `try` and skips the file on the first failure, even after
 * earlier lines parsed cleanly.
 */
function parsePiSessionFile(path: string, now: () => string): ImportedMessage[] {
  const messages: ImportedMessage[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n|\r/)) {
    if (!line.trim()) continue;
    const entry: unknown = JSON.parse(line);
    if (getFrom(entry, "type") !== "message") continue;
    const message = getOr(entry, "message", {});
    const role = getOr(message, "role", "");
    if (role !== "user" && role !== "assistant") continue;
    const content = parsePiContent(getOr(message, "content", ""));
    if (!content.trim()) continue;
    const createdAt = parsePiTimestamp(getFrom(message, "timestamp"), now);
    messages.push({ role, content, createdAt });
  }
  return messages;
}

/**
 * Python `sorted(pi_sessions_dir.rglob("*.jsonl"))`: every `.jsonl` file
 * under the directory, ordered by path components (see
 * `comparePathComponents` for why that is not a string sort).
 */
function listPiSessionFiles(sessionsDir: string): string[] {
  const entries = readdirSync(sessionsDir, { recursive: true, withFileTypes: true });
  const found: string[][] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".jsonl")) continue;
    const parents = relative(sessionsDir, entry.parentPath).split(sep).filter(Boolean);
    found.push([...parents, entry.name]);
  }
  found.sort(comparePathComponents);
  return found.map((components) => join(sessionsDir, ...components));
}

export interface PiBackfillOptions {
  /** Already resolved through `resolvePiSessionsDir`. */
  sessionsDir: string;
}

/**
 * Python `backfill_pi_sessions`: import every untracked Pi session with at
 * least two messages as a closed `pi` conversation, titled provisionally from
 * the first user line. Returns the number imported.
 *
 * The session id is the session file's path, exactly as Python's
 * `str(session_file)` -- which is also what the live Pi extension binds, so a
 * session the hooks already track is skipped before its file is even read.
 */
export function backfillPiSessions(
  db: WritableDatabase,
  options: PiBackfillOptions,
  deps: LoggerDeps,
): number {
  if (!existsSync(options.sessionsDir)) return 0;

  let count = 0;
  for (const sessionFile of listPiSessionFiles(options.sessionsDir)) {
    const sessionId = sessionFile;
    if (db.prepare("SELECT 1 FROM runtime_sessions WHERE session_id = ?").get(sessionId)) {
      continue;
    }
    let messages: ImportedMessage[];
    try {
      messages = parsePiSessionFile(sessionFile, deps.nowIso);
    } catch {
      continue;
    }
    if (messages.length < 2) continue;

    const conversationId = importClosedConversation(
      db,
      sessionId,
      { interface: "pi", messages, endedAt: (messages.at(-1) as ImportedMessage).createdAt },
      deps,
    );
    if (conversationId === null) {
      // A concurrent writer (a live hook) bound this session while the import
      // waited for the write lock -- their binding wins.
      continue;
    }
    const firstUser = messages.find((message) => message.role === "user");
    if (firstUser) {
      // Python: `content.strip().split("\n")[0][:60]` -- cut BEFORE the
      // provisional-title whitespace collapse, by code point.
      const title = sliceCodePoints(firstUser.content.trim().split("\n")[0] ?? "", 60);
      setProvisionalTitle(db, conversationId, title);
    }
    count += 1;
  }
  return count;
}

interface CodexParse {
  sessionId: string | null;
  messages: { role: string; content: unknown; createdAt: unknown }[];
}

/**
 * Parse a Codex session file. Throws on the first line that is not valid
 * JSON or not the expected shape; Python's single `try` turns that into
 * "return 0". Values are collected raw: Python validates them only when the
 * import constructs its models.
 */
function parseCodexSessionFile(path: string): CodexParse {
  const parsed: CodexParse = { sessionId: null, messages: [] };
  for (const line of readFileSync(path, "utf8").split(/\r?\n|\r/)) {
    if (!line.trim()) continue;
    const entry: unknown = JSON.parse(line);
    const entryType = getFrom(entry, "type");
    const payload = getOr(entry, "payload", {});
    if (entryType === "session_meta") {
      // Codex writes a UUID string; a non-string id is treated as absent
      // (the same simplification the hook payloads make).
      const id = getFrom(payload, "id");
      parsed.sessionId = typeof id === "string" ? id : null;
    } else if (entryType === "event_msg") {
      const payloadType = getFrom(payload, "type");
      if (payloadType === "user_message" || payloadType === "agent_message") {
        const content = getOr(payload, "message", "");
        // Python: `if content:` -- any truthy value is kept and validated later.
        if (pythonTruthy(content)) {
          parsed.messages.push({
            role: payloadType === "user_message" ? "user" : "assistant",
            content,
            createdAt: getFrom(entry, "timestamp"),
          });
        }
      }
    }
  }
  return parsed;
}

export interface CodexBackfillOptions {
  jsonlPath: string;
  interface?: string;
}

/**
 * Python `backfill_codex_session`: import one Codex session file as a closed
 * conversation titled through `_generate_title`. Returns 1 on import, else 0.
 *
 * Throws when a kept event has a non-string `message` or `timestamp`: Python's
 * `Message(...)` model rejects those inside the import transaction, so the
 * database is left untouched and the caller sees the failure.
 */
export function backfillCodexSession(
  db: WritableDatabase,
  options: CodexBackfillOptions,
  deps: LoggerDeps,
): number {
  const jsonlPath = expandHome(options.jsonlPath);
  if (!existsSync(jsonlPath) || !statSync(jsonlPath).isFile()) return 0;

  let parsed: CodexParse;
  try {
    parsed = parseCodexSessionFile(jsonlPath);
  } catch {
    return 0;
  }
  if (!parsed.sessionId || parsed.messages.length === 0) return 0;
  if (db.prepare("SELECT 1 FROM runtime_sessions WHERE session_id = ?").get(parsed.sessionId)) {
    return 0;
  }

  const messages: ImportedMessage[] = parsed.messages.map((message) => {
    if (typeof message.content !== "string") {
      throw new TypeError("Codex event message must be a string");
    }
    if (typeof message.createdAt !== "string") {
      throw new TypeError("Codex event timestamp must be a string");
    }
    return { role: message.role, content: message.content, createdAt: message.createdAt };
  });

  const conversationId = importClosedConversation(
    db,
    parsed.sessionId,
    {
      interface: options.interface ?? "codex",
      messages,
      endedAt: (messages.at(-1) as ImportedMessage).createdAt,
    },
    deps,
  );
  if (conversationId === null) return 0;

  const firstUser = messages.find((message) => message.role === "user");
  if (firstUser) {
    db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(
      generateTitle(firstUser.content),
      conversationId,
    );
  }
  return 1;
}
