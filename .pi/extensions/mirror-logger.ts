/**
 * Mirror Logger Extension
 *
 * Integrates Pi with the Mirror Mind memory system.
 *
 * Events handled:
 * - session_start      → unmute + welcome card + status line, in ONE front-door
 *                        process (CV9.E2.S32); maintenance detached; the session
 *                        named in the environment (`MIRROR_SESSION_ID`, CV9.DS8.US5)
 * - input              → what the person typed, kept for the run it starts (CR160)
 * - before_agent_start → the turn to the one doorman (`mirror doorman`), AWAITED:
 *                        its block, when there is one, is the run's message, so
 *                        Mirror's context is before the model on this turn
 *                        (CV9.DS8.US5); then the turn to the core's prompt rule
 *                        (`user-prompt`), with a turn id minted for it, NOT
 *                        awaited: queued on the per-session chain behind the
 *                        doorman, so the turn starts at once (CV9.E2.S32)
 * - agent_end          → the run's assistant text, kept for the prompt's reply
 * - agent_settled      → the prompt's whole reply to `stop`, after the chain settles
 * - session_compact    → the folder left the transcript: `mirror doorman --forget`,
 *                        so the next ordinary turn is delivered whole (CV9.DS8.US5)
 * - session_shutdown   → close conversation (after the chain settles) + backup;
 *                        the session's name cleared from the environment
 *
 * The session's name (CV9.DS8.US5, from TS1's P2 measurement on Pi 1.4.0): at
 * `session_start` this extension sets `MIRROR_SESSION_ID` in Pi's OWN process
 * environment, which every later `pi.exec` and every bash command the model runs
 * inherits. So a `mirror mirror load` the model runs by itself on an unprompted
 * personal question, and a `mirror build load` on a mode switch, name THIS
 * session's row instead of guessing one -- and the doorman, which reads that row,
 * takes the next turn. Named-session behaviors that were dormant on Pi while no
 * session was named wake with it (`mirror log`, journey binding, the mode stamps).
 *
 * All heavy logic lives in the TypeScript core, reached through the `mirror`
 * bin that ships beside this file (`bin/mirror.js`). This extension is a thin
 * dispatcher. Failures are swallowed to never block Pi — but logged to
 * mirror-logger.log in the resolved mirror home (homes root only as bootstrap
 * fallback when no mirror home is resolvable).
 *
 * Since CV22.DS10.US3 this extension assumes nothing about the cwd: the core it
 * runs is the one it ships with, located from this file (D6); configuration
 * is the core's own (D3); and for a session Pi did not open inside the tree,
 * it supplies the Operating Instructions (`AGENTS.md`) itself (D13), and says
 * so once when `mirror` is not on the PATH.
 *
 * External skill prep note:
 * Pi reads installed external skills from
 *   ~/.mirror-minds/<user>/runtime/skills/pi/extensions.json
 * rather than from source manifests under ~/.mirror-minds/<user>/extensions/.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { accessSync, appendFileSync, closeSync, constants, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

/** The tree this extension ships in: `.pi/extensions/` sits two below the root. */
const TREE_ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
/** The core this extension runs: the bin beside it, never one found by the cwd (D6). */
const MIRROR_BIN = join(TREE_ROOT, "bin", "mirror.js");
/** The Operating Instructions that ship with the core (D13). */
const AGENTS_FILE = join(TREE_ROOT, "AGENTS.md");

// Mirror home directory names. Mirrors the Python core contract in
// src/memory/config.py (_DEFAULT_USER_HOMES_DIR_NAME / _LEGACY_USER_HOMES_DIR_NAME).
// The core migrated the default homes root from ~/.mirror to ~/.mirror-minds; the
// legacy layout stays supported indefinitely. This extension is TypeScript and cannot
// import the Python constants, so it duplicates the contract — keep the names here.
const NEW_HOMES_DIR = ".mirror-minds";
const LEGACY_HOMES_DIR = ".mirror";

// Respect MEMORY_DIR so Pi session files land in the same directory Python reads.
// Fallback to ~/.mirror-minds if unset (matches config.DEFAULT_MEMORY_DIR).
function _resolveMemoryDir(): string {
	// CV9.E2.S6 — log containment. Precedence mirrors the Python core:
	// explicit MEMORY_DIR > resolved mirror home (shell env > .env, with the
	// legacy ~/.mirror/<user> location honored when only it exists) > homes
	// root. The homes-root fallback is deliberate: it is the bootstrap error
	// channel that records "could not resolve the mirror home" itself.
	const raw = process.env.MEMORY_DIR;
	if (raw) return raw.startsWith("~") ? join(homedir(), raw.slice(2)) : raw;
	const { home, user } = _effectiveMirrorEnv();
	if (home) return home.startsWith("~") ? join(homedir(), home.slice(2)) : home;
	if (user) {
		const newHome = join(homedir(), NEW_HOMES_DIR, user);
		const legacyHome = join(homedir(), LEGACY_HOMES_DIR, user);
		if (!_isDir(newHome) && _isDir(legacyHome)) return legacyHome;
		return newHome;
	}
	return join(homedir(), NEW_HOMES_DIR);
}

/** True when the path is an existing directory. */
function _isDir(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** True when a user home has an installed Pi external-skill catalog. */
function _hasPiCatalog(userHome: string): boolean {
	try {
		return existsSync(join(userHome, "runtime", "skills", "pi", "extensions.json"));
	} catch {
		return false;
	}
}

/** User homes under a homes root that carry an installed Pi external-skill catalog. */
function _piCatalogHomes(homesDirName: string): string[] {
	const root = join(homedir(), homesDirName);
	try {
		return readdirSync(root)
			.map((name) => join(root, name))
			.filter((path) => _isDir(path) && _hasPiCatalog(path));
	} catch {
		return [];
	}
}

// One KEY=VALUE file, as the core reads it (no quote stripping, comments
// skipped). Pi (Node) never loads .env on its own, so without this the
// extension cannot see the MIRROR_USER the core will resolve.
function _readEnvFile(path: string): Record<string, string> {
	try {
		if (!statSync(path).isFile()) return {};
		const out: Record<string, string> = {};
		for (const rawLine of readFileSync(path, "utf-8").split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith("#") || !line.includes("=")) continue;
			const eq = line.indexOf("=");
			const key = line.slice(0, eq).trim();
			if (key) out[key] = line.slice(eq + 1).trim();
		}
		return out;
	} catch {
		return {};
	}
}

/** The user's config file, where the core reads it: `${XDG_CONFIG_HOME:-~/.config}/mirror/env`. */
function _userConfigFile(): string {
	const xdg = process.env.XDG_CONFIG_HOME;
	return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".config"), "mirror", "env");
}

// Effective Mirror env, in the core's own order (CV22.DS10.US3 D3): the real
// shell env wins; then the TREE's `.env` -- a clone's, located from this file,
// never the cwd's; then the user's config file. The core resolves the database
// the same way, so the two cannot disagree about which mirror a session logs to.
function _effectiveMirrorEnv(): { home?: string; user?: string } {
	const fromFiles = { ..._readEnvFile(_userConfigFile()), ..._readEnvFile(join(TREE_ROOT, ".env")) };
	const rawHome = "MIRROR_HOME" in process.env ? process.env.MIRROR_HOME : fromFiles.MIRROR_HOME;
	const rawUser = "MIRROR_USER" in process.env ? process.env.MIRROR_USER : fromFiles.MIRROR_USER;
	return { home: rawHome?.trim() || undefined, user: rawUser?.trim() || undefined };
}

/**
 * Where `mirror` resolves on this PATH, or null. The skills say `mirror`
 * (CV22.DS10.US3 D7), so an agent in a session where it does not resolve
 * meets `command not found` and improvises -- which is why session start says
 * so once, naming the fix, instead of leaving the agent to guess.
 */
function _mirrorOnPath(): string | null {
	const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
	for (const dir of dirs) {
		const candidate = join(dir, process.platform === "win32" ? "mirror.cmd" : "mirror");
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			// keep looking
		}
	}
	return null;
}

/** True when `path` is the same file as this tree's AGENTS.md (symlinks resolved). */
function _isOurAgentsFile(path: string): boolean {
	try {
		return realpathSync(path) === realpathSync(AGENTS_FILE);
	} catch {
		return false;
	}
}

const MIRROR_DIR = _resolveMemoryDir();
const LOG_FILE = join(MIRROR_DIR, "mirror-logger.log");

// Content size limit for CLI arguments (~50KB, safe for macOS ARG_MAX)
const MAX_CONTENT_SIZE = 50_000;

type RuntimeCatalogEntry = {
	id?: string;
	command_name?: string;
	installed_skill_path?: string;
};

type RuntimeCatalog = {
	schema_version?: string;
	runtime?: string;
	target_root?: string;
	generated_at?: string;
	extensions?: RuntimeCatalogEntry[];
};

type MirrorStatusContext = {
	hasUI: boolean;
	sessionManager: {
		getSessionFile(): string | undefined;
	};
	ui: {
		setStatus(key: string, value: string | undefined): void;
	};
};

/**
 * One extension, reached twice. Pi can reach this file as the project's
 * `.pi/extensions/` inside the checkout AND as a personal package installed
 * from `npm root -g`, which `npm link` makes the same file under two paths:
 * two module instances in one process (CV22.DS10.US3 plateau 2). Which of
 * them Pi keeps is Pi's: 1.4.0 dedupes the two by their real path and keeps
 * the one it loaded second; an older Pi kept both. A "register once per
 * process" guard chose the first -- and on 1.4.0 that was the instance Pi
 * dropped, so the checkout's Pi had no handlers at all (found by CV9.DS8.US5's
 * live walk). So every instance registers, and the guard is on the EVENT: the
 * handled set is process-scoped, and the first instance to see an event
 * object handles it, the other returns. Pi hands every registration the same
 * event object (its documented in-place mutation of `systemPromptOptions`
 * depends on it), which is what makes the set a guard.
 */
const HANDLED_KEY = "__mirrorLoggerHandledEvents";

export default function (pi: ExtensionAPI) {
	const globals = globalThis as Record<string, unknown>;
	const handled = (globals[HANDLED_KEY] ??= new Map<string, WeakSet<object>>()) as Map<
		string,
		WeakSet<object>
	>;
	/**
	 * The handler, run by the first registration an event reaches. `slot` names
	 * the handler, not the event: this file registers two handlers on
	 * `before_agent_start`, and each must see the event once.
	 */
	function once<E, C, R>(slot: string, handler: (event: E, ctx: C) => R): (event: E, ctx: C) => R | undefined {
		let seen = handled.get(slot);
		if (!seen) {
			seen = new WeakSet<object>();
			handled.set(slot, seen);
		}
		const set = seen;
		return (event, ctx) => {
			if (event !== null && typeof event === "object") {
				if (set.has(event)) return undefined;
				set.add(event);
			}
			return handler(event, ctx);
		};
	}

	// --- Helpers ---

	/**
	 * Every Mirror command this extension runs enters the TypeScript front
	 * door through the `mirror` bin beside this file (`bin/mirror.js`), the
	 * same entry the skills reach through the PATH, so `routing.ts` decides
	 * the route and `front-door.log` records it. The bin, not `cli.ts`
	 * directly: under `npm root -g` Node will not strip types (D15), and the
	 * bin is the one entry that runs in a checkout and an install alike.
	 * It reads configuration and silences warnings itself (D3), so no flag
	 * and no `.env` path travels here. Nothing depends on the cwd.
	 */
	const FRONT_DOOR_ARGV = [MIRROR_BIN];

	function log(level: string, msg: string): void {
		try {
			const ts = new Date().toISOString();
			mkdirSync(MIRROR_DIR, { recursive: true });
			appendFileSync(LOG_FILE, `${ts} [${level}] ${msg}\n`);
		} catch {
			// Logging failure must never break anything
		}
	}

	function runMirrorBackground(args: string[], label: string): void {
		let logFd: number | undefined;
		try {
			mkdirSync(MIRROR_DIR, { recursive: true });
			logFd = openSync(LOG_FILE, "a");
			const child = spawn("node", [...FRONT_DOOR_ARGV, ...args], {
				cwd: process.cwd(),
				stdio: ["ignore", logFd, logFd],
				// Windows: a detached console child materializes as a visible
				// console (or a Windows Terminal tab, when WT is the default
				// terminal, which does not honor CREATE_NO_WINDOW for detached
				// sessions). Sharing Pi's console makes it truly invisible.
				// POSIX keeps detached so the write survives Pi exiting.
				detached: process.platform !== "win32",
				windowsHide: true,
			});
			child.unref();
			log("INFO", `${label} started in detached background process ${child.pid ?? "(unknown pid)"}`);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			log("ERROR", `${label} failed: ${message.slice(0, 500)}`);
		} finally {
			if (logFd !== undefined) {
				try {
					closeSync(logFd);
				} catch {
					// Ignore close failure.
				}
			}
		}
	}

	/**
	 * CV9.E2.S32 test knob: a delay before each awaited front-door exec, so the
	 * quit-mid-write and ordering cases can be driven deterministically.
	 * Honored ONLY under `MEMORY_ENV=test`; a production session never sleeps.
	 */
	function testFrontDoorDelayMs(): number {
		if (process.env.MEMORY_ENV !== "test") return 0;
		const raw = Number.parseInt(process.env.MIRROR_TEST_FRONT_DOOR_DELAY_MS ?? "", 10);
		return Number.isFinite(raw) && raw > 0 ? raw : 0;
	}

	async function runMirror(args: string[]): Promise<string> {
		try {
			const delay = testFrontDoorDelayMs();
			if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
			const result = await pi.exec("node", [...FRONT_DOOR_ARGV, ...args], {
				timeout: 30_000,
			});
			const stderr = (result?.stderr ?? "").trim();
			if (stderr) {
				log("WARN", `stderr from [${args.slice(0, 2).join(" ")}]: ${stderr.slice(0, 500)}`);
			}
			return (result?.stdout ?? "").trim();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			log("ERROR", `runMirror failed [${args.slice(0, 2).join(" ")}]: ${message.slice(0, 500)}`);
			return "";
		}
	}

	/**
	 * The `session-start --fast --welcome --format json` envelope (CV9.E2.S32).
	 * One process answers what used to take three: the unmute, the welcome
	 * card, and the status line. A parse failure is a WARN and the same empty
	 * result the three calls used to yield when one of them failed.
	 */
	interface SessionOpenEnvelope {
		sessionStart: string;
		welcome: string;
		statusLine: string;
	}

	function parseSessionOpenEnvelope(stdout: string): SessionOpenEnvelope | null {
		if (!stdout.trim()) return null;
		try {
			const parsed: unknown = JSON.parse(stdout);
			if (!parsed || typeof parsed !== "object") throw new Error("not an object");
			const record = parsed as Record<string, unknown>;
			const field = (name: string): string => (typeof record[name] === "string" ? (record[name] as string) : "");
			return { sessionStart: field("sessionStart"), welcome: field("welcome"), statusLine: field("statusLine") };
		} catch (err: unknown) {
			log("WARN", `session-open envelope unreadable: ${err instanceof Error ? err.message : String(err)}`);
			return null;
		}
	}

	/**
	 * CV9.E2.S32: the per-session chain of pending `log-user` writes.
	 *
	 * The invariant protected: the `log-user` process has EXITED before the
	 * `log-assistant` process for the same turn is SPAWNED, and before
	 * `session-end-pi` runs. Message reads are `ORDER BY created_at, id` and
	 * `created_at` is stamped by the writing process at insert time, so order
	 * in the database is wall-clock order of the inserts; the chain is what
	 * makes that order the prompt order. Consecutive prompts serialize on the
	 * same chain. A link that fails (or times out at `pi.exec`'s 30 s) settles
	 * the chain all the same: `runMirror` swallows, and the `.then(\u2026, \u2026)` is
	 * belt and braces so a rejection can never wedge it.
	 */
	const pendingUserLog = new Map<string, Promise<void>>();

	/**
	 * One front-door process on the session's chain: spawned when the link
	 * before it has exited, its stdout returned to the caller. A failure settles
	 * the chain all the same and reads as empty stdout (`runMirror` swallows).
	 */
	function runOnChain(sessionId: string, args: string[]): Promise<string> {
		const prior = pendingUserLog.get(sessionId) ?? Promise.resolve();
		const stdout = prior.then(() => runMirror(args));
		pendingUserLog.set(
			sessionId,
			stdout.then(
				() => undefined,
				() => undefined,
			),
		);
		return stdout.then(
			(out) => out,
			() => "",
		);
	}

	function enqueueUserLog(sessionId: string, args: string[]): void {
		void runOnChain(sessionId, args);
	}

	/**
	 * CV9.DS8.US5: the turn through the one doorman. `mirror doorman` decides
	 * nothing, the full folder, or a delta from the prompt and the session's
	 * state (`ts/src/mirror/doorman.ts`, DS8's policy); this extension decides
	 * nothing itself and carries the answer. Awaited: the turn cannot start
	 * before the block exists. Outside Mirror Mode the doorman reads and exits
	 * with nothing -- one process, no snapshot, no embedding, no context (0.21 s
	 * on a 61 MB home, measured 2026-10-25).
	 *
	 * On the chain AHEAD of the `user-prompt` logger: the logger's first-turn
	 * upsert rebuilds the whole `runtime_sessions` row from what it read, and
	 * overlapping the doorman's full load it would write back `mirror_active = 0`
	 * and a null persona. The doorman's process has exited before the logger's is
	 * spawned, so it does not race. The prompt is truncated as the payload is:
	 * the explicit form is at its start, routing and the embedding do not need
	 * the tail, and an untruncated paste would fail the exec on ARG_MAX --
	 * silently, and the skill would load twice.
	 */
	function deliverMirrorContext(sessionId: string, prompt: string): Promise<string> {
		return runOnChain(sessionId, [
			"mirror",
			"doorman",
			"--prompt",
			truncate(prompt),
			"--session-id",
			sessionId,
		]);
	}

	async function settleUserLog(sessionId: string): Promise<void> {
		await (pendingUserLog.get(sessionId) ?? Promise.resolve());
	}

	/**
	 * CR160: Pi's turns reach the core's prompt rule, the one the hooks use
	 * (`user-prompt`, `stop`): a skill invocation and its reply are not
	 * conversation, a Mirror question is (`commandTurn.ts`, `mirrorForm.ts`).
	 *
	 * The rule needs what the person typed, and Pi hands `before_agent_start` the
	 * prompt after it expanded a skill into its body. Its documented `input` event
	 * carries the text as sent, so that text is kept here for the run it starts --
	 * only when it starts one: a message queued while Pi streams joins a run
	 * already going. The payload travels as `--payload`: `pi.exec` cannot write
	 * stdin (`conversationLoggerRoute.ts`).
	 */
	const typedInput = new Map<string, string>();

	/** The prompt in flight and the assistant text its runs have produced so far. */
	interface PendingReply {
		turnId: string;
		texts: string[];
	}
	const pendingReply = new Map<string, PendingReply>();

	/**
	 * Pi's expansion of `/skill:<name> args`: `<skill name="<name>" location="…">`,
	 * `References are relative to ….`, the body, `</skill>`, then the arguments.
	 * With no typed text kept for a run, the wrapper is read back to the command
	 * it came from, so the rule still sees a command (CR160, A3).
	 */
	const PI_SKILL_WRAPPER =
		/^<skill name="([^"]+)" location="[^"]*">\nReferences are relative to [^\n]*\n\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]*))?$/;

	function typedFormOf(prompt: string): string {
		const match = PI_SKILL_WRAPPER.exec(prompt);
		if (!match) return prompt;
		const args = (match[2] ?? "").trim();
		return args ? `/skill:${match[1]} ${args}` : `/skill:${match[1]}`;
	}

	/** The `stop` argv for a prompt's reply, or null when it produced no text. */
	function takeStopArgs(sessionId: string): string[] | null {
		const reply = pendingReply.get(sessionId);
		pendingReply.delete(sessionId);
		if (!reply || reply.texts.length === 0) return null;
		const content = truncate(reply.texts.join("\n\n---\n\n"));
		log("INFO", `stop (turn ${reply.turnId}): ${reply.texts.length} block(s), ${content.length} chars`);
		return [
			"conversation-logger",
			"stop",
			"--interface",
			"pi",
			"--payload",
			JSON.stringify({ session_id: sessionId, turn_id: reply.turnId, last_assistant_message: content }),
		];
	}

	/** Extract readable text from a content blocks array or plain string. */
	function extractText(content: unknown): string {
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) return "";
		return content
			.filter((b: Record<string, unknown>) => b && b.type === "text" && typeof b.text === "string")
			.map((b: Record<string, unknown>) => b.text as string)
			.join("\n");
	}

	/** Truncate content to fit in CLI arguments. */
	function truncate(text: string): string {
		if (text.length <= MAX_CONTENT_SIZE) return text;
		return text.slice(0, MAX_CONTENT_SIZE) + "\n[… truncated]";
	}

	/** The status bar line: the front door's compact status, or `?`, plus the external-skill count. */
	function setMirrorStatus(ctx: MirrorStatusContext, compactStatus: string): void {
		if (!ctx.hasUI) return;
		const externalCatalog = loadInstalledPiExternalSkills();
		const externalSkills = externalCatalog?.extensions ?? [];
		const status = compactStatus || "◇ Mirror · ?";
		ctx.ui.setStatus(
			"mirror",
			externalSkills.length > 0 ? `${status} · ext ${externalSkills.length}` : status,
		);
	}

	async function refreshMirrorStatus(ctx: MirrorStatusContext): Promise<void> {
		if (!ctx.hasUI) return;
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		const statusArgs = ["welcome", "--status-line"];
		if (sessionId) {
			statusArgs.push("--session-id", sessionId);
		}
		setMirrorStatus(ctx, (await runMirror(statusArgs)).trim());
	}

	// Resolve the active Mirror home the same way the Python core does
	// (src/memory/config.py resolve_mirror_home), including the per-workspace
	// .env that Node would otherwise never see.
	function resolveMirrorHome(): string | null {
		const { home: explicitHome, user: mirrorUser } = _effectiveMirrorEnv();

		if (explicitHome) {
			return explicitHome.startsWith("~") ? join(homedir(), explicitHome.slice(2)) : explicitHome;
		}

		// Prefer the new ~/.mirror-minds/<user> location, and fall back to the
		// legacy ~/.mirror/<user> only when the new home does not exist.
		if (mirrorUser) {
			const newUserHome = join(homedir(), NEW_HOMES_DIR, mirrorUser);
			const legacyUserHome = join(homedir(), LEGACY_HOMES_DIR, mirrorUser);
			if (!_isDir(newUserHome) && _isDir(legacyUserHome)) {
				return legacyUserHome;
			}
			return newUserHome;
		}

		// No explicit home/user from shell or .env: infer the active Mirror home
		// from a single installed catalog. Prefer the new homes root; only fall
		// back to legacy when the new root has none. Ambiguity (more than one
		// candidate under a root) requires MIRROR_USER/MIRROR_HOME — never guess.
		for (const homesDir of [NEW_HOMES_DIR, LEGACY_HOMES_DIR]) {
			const candidates = _piCatalogHomes(homesDir);
			if (candidates.length === 1) return candidates[0];
			if (candidates.length > 1) {
				log(
					"WARN",
					`multiple Mirror homes with Pi external skill catalogs under ${homesDir}; set MIRROR_USER or MIRROR_HOME`,
				);
				return null;
			}
		}
		return null;
	}

	function loadInstalledPiExternalSkills(): RuntimeCatalog | null {
		try {
			const mirrorHome = resolveMirrorHome();
			if (!mirrorHome) return null;
			const catalogPath = join(mirrorHome, "runtime", "skills", "pi", "extensions.json");
			if (!existsSync(catalogPath)) return null;

			const raw = readFileSync(catalogPath, "utf-8");
			const data = JSON.parse(raw) as RuntimeCatalog;
			if (data.schema_version !== "1") {
				log("WARN", `unsupported Pi external skill catalog schema: ${String(data.schema_version ?? "(missing)")}`);
				return null;
			}
			if (data.runtime !== "pi") {
				log("WARN", `unexpected Pi external skill catalog runtime: ${String(data.runtime ?? "(missing)")}`);
				return null;
			}
			if (!Array.isArray(data.extensions)) {
				log("WARN", "invalid Pi external skill catalog: extensions must be an array");
				return null;
			}
			return data;
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			log("WARN", `failed to load Pi external skill catalog: ${message.slice(0, 500)}`);
			return null;
		}
	}

	function getInstalledPiSkillPaths(): string[] {
		const catalog = loadInstalledPiExternalSkills();
		const items = catalog?.extensions ?? [];
		const skillPaths = items
			.map((item) => item.installed_skill_path)
			.filter((path): path is string => typeof path === "string" && path.length > 0)
			.filter((path) => existsSync(path));
		return [...new Set(skillPaths)];
	}

	// --- dynamic resources → installed external Pi skills ---

	pi.on(
		"resources_discover",
		once("resources_discover", async () => {
			const skillPaths = getInstalledPiSkillPaths();
			if (skillPaths.length > 0) {
				log("INFO", `resources_discover: loaded ${skillPaths.length} installed Pi external skill(s)`);
			}
			return { skillPaths };
		}),
	);

	// --- 0. the Operating Instructions, for a session Pi did not open in the tree ---
	//
	// Pi loads one context file per directory from the cwd upward. Inside the
	// checkout that is this tree's AGENTS.md; from anywhere else -- an npm
	// user's project, /tmp -- it is not, and a session that answers /mm-mirror
	// without the modes, the persona signature, or the Builder boundary is not
	// a Mirror session (CV22.DS10.US3 D13). So the extension appends the file
	// it ships with, unless Pi already loaded that very file.

	pi.on("before_agent_start", once("operating_instructions", async (event) => {
		const files = event.systemPromptOptions.contextFiles;
		if (files.some((file) => _isOurAgentsFile(file.path))) return;
		let content: string;
		try {
			content = readFileSync(AGENTS_FILE, "utf-8");
		} catch (err: unknown) {
			log("WARN", `AGENTS.md not readable at ${AGENTS_FILE}: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}
		if (files.some((file) => file.content === content)) return;
		files.push({ path: AGENTS_FILE, content });
		log("INFO", `operating instructions appended from ${AGENTS_FILE}`);
	}));

	// --- 1. session_start → unmute + welcome + status line in one process ---
	//
	// CV9.E2.S32. `session-start --fast` WRITES the orientation that `welcome`
	// and `welcome --status-line` READ, so the three cannot run in parallel;
	// the composite runs them in one process, write first. Maintenance stays
	// detached. Fires on startup, reload, new, resume, and fork alike.

	pi.on("session_start", once("session_start", async (_event, ctx) => {
		log("INFO", "session_start fired");
		// The session's name, for the model's own `mirror` commands (CV9.DS8.US5;
		// see the header). Fires again on `/new`, `/resume`, and `/fork`, with the
		// new file; the shutdown before it cleared the old one.
		const namedSession = ctx.sessionManager.getSessionFile();
		if (namedSession) process.env.MIRROR_SESSION_ID = namedSession;
		else delete process.env.MIRROR_SESSION_ID;
		if (ctx.hasUI) {
			ctx.ui.setStatus("mirror", "◇ Mirror · starting… maintenance will continue in background");
		}
		// The skills say `mirror`. Say once, visibly, when that will not work.
		if (_mirrorOnPath() === null) {
			const fix = existsSync(join(TREE_ROOT, ".git"))
				? `run \`npm link\` once in ${TREE_ROOT}`
				: "add `$(npm prefix -g)/bin` to the PATH";
			const line = `Mirror: \`mirror\` is not on the PATH — ${fix}. Skills will fail until it is.`;
			log("WARN", line);
			if (ctx.hasUI) ctx.ui.notify(line, "warning");
		}
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		const openArgs = ["conversation-logger", "session-start", "--fast", "--welcome", "--format", "json"];
		if (sessionId) openArgs.push("--session-id", sessionId);
		const envelope = parseSessionOpenEnvelope(await runMirror(openArgs));
		const summary = envelope?.sessionStart ?? "";
		const externalCatalog = loadInstalledPiExternalSkills();
		const externalSkills = externalCatalog?.extensions ?? [];
		const externalSkillSummary = externalSkills.length
			? `External skills: ${externalSkills.map((item) => item.command_name ?? item.id ?? "(unknown)").join(", ")}`
			: "External skills: none";
		log("INFO", `session-start result: ${summary || "(empty)"}`);
		log("INFO", externalSkillSummary);

		const welcome = (envelope?.welcome ?? "").trim();
		if (welcome) {
			log("INFO", `welcome: ${welcome.split("\n")[0]}`);
		}

		if (ctx.hasUI) {
			if (welcome) {
				ctx.ui.notify(welcome, "info");
			}
			setMirrorStatus(ctx, (envelope?.statusLine ?? "").trim());
		}
		runMirrorBackground(["conversation-logger", "session-maintenance"], "session-maintenance");
	}));

	// --- 2. input → what the person typed, for the run it starts (CR160) ---

	pi.on("input", once("input", async (event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		if (!sessionId) return;
		// The fields are Pi's (`InputEvent`); the types this directory pins predate one.
		const { text, streamingBehavior } = event as { text: string; streamingBehavior?: string };
		// Queued while Pi streams: it joins a run already going and starts none.
		if (streamingBehavior) return;
		typedInput.set(sessionId, text);
	}));

	// --- 3. before_agent_start → the turn to the core's prompt rule ---

	pi.on("before_agent_start", once("prompt", async (event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		if (!sessionId) return;
		// A run a custom message started answers no prompt of the person's. Pi's
		// field (`messageType`); the types this directory pins predate it.
		const { messageType } = event as { messageType?: string };
		if (messageType !== undefined && messageType !== "user") return;

		const typed = typedInput.get(sessionId);
		typedInput.delete(sessionId);
		const prompt = typed ?? typedFormOf(event.prompt ?? "");

		// A reply still unsent belongs to the prompt before this one: a Pi without
		// `agent_settled` (before 0.80.4) never sent it. It goes first, on the chain.
		const earlier = takeStopArgs(sessionId);
		if (earlier) enqueueUserLog(sessionId, earlier);

		const turnId = randomUUID();
		pendingReply.set(sessionId, { turnId, texts: [] });
		if (!prompt) return;

		// The doorman first, awaited (CV9.DS8.US5): Mirror's context before the
		// model, on the turn that asks for it.
		const block = await deliverMirrorContext(sessionId, prompt);

		log("INFO", `user-prompt (turn ${turnId}): ${prompt.slice(0, 80)}...`);
		// Not awaited (CV9.E2.S32): the turn starts now; `agent_settled` and
		// `session_shutdown` settle the chain before anything that must follow.
		enqueueUserLog(sessionId, [
			"conversation-logger",
			"user-prompt",
			"--interface",
			"pi",
			"--payload",
			JSON.stringify({ session_id: sessionId, prompt: truncate(prompt), turn_id: turnId }),
		]);

		if (!block) return;
		log("INFO", `mirror-context (turn ${turnId}): ${block.length} chars delivered`);
		// Pi adds it to this run after the user message and hands it to the model
		// as a user-role message; its first line says the runtime, not the person,
		// is speaking, and the `mm-mirror` skill reads that line as delivery (TS3).
		// Not displayed: the person sees the mirror's reply, not the plumbing.
		return { message: { customType: "mirror-context", content: block, display: false } };
	}));

	// --- 4. agent_end → the run's assistant text, kept for the prompt's reply ---
	//
	// agent_end fires once per run, with ALL messages in it (assistant + tool
	// calls + tool results), and a prompt can take more than one run. The
	// assistant text is kept until the prompt settles: the hooks' `stop` takes
	// one answer per turn (CR160, A2).

	pi.on("agent_end", once("agent_end", async (event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		if (!sessionId) return;

		const messages = (event as unknown as Record<string, unknown>).messages;
		if (!Array.isArray(messages) || messages.length === 0) return;

		const assistantTexts: string[] = [];
		for (const msg of messages) {
			if (
				msg &&
				typeof msg === "object" &&
				"role" in msg &&
				(msg as Record<string, unknown>).role === "assistant"
			) {
				const text = extractText((msg as Record<string, unknown>).content);
				if (text.trim()) {
					assistantTexts.push(text);
				}
			}
		}

		if (assistantTexts.length === 0) return;

		// No prompt in flight: a run a custom message started, after the last
		// prompt settled. It answers nothing the person asked, and `stop` would
		// find nothing waiting, as on the other runtimes.
		pendingReply.get(sessionId)?.texts.push(...assistantTexts);
		await refreshMirrorStatus(ctx);
	}));

	// --- 5. agent_settled → the prompt's whole reply to `stop` ---

	// `agent_settled` arrived in Pi 0.80.4, after the Pi types this directory pins
	// (`.pi/package.json`), so it is registered by its name alone.
	const onEvent = pi.on.bind(pi) as unknown as (
		event: string,
		handler: (
			event: unknown,
			ctx: { sessionManager: { getSessionFile(): string | undefined } },
		) => Promise<void> | undefined,
	) => void;

	onEvent("agent_settled", once("agent_settled", async (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		if (!sessionId) return;
		const args = takeStopArgs(sessionId);
		if (!args) return;
		// The prompt's process has exited before this one is spawned; detached, so
		// the write survives Pi exiting right after the answer.
		await settleUserLog(sessionId);
		runMirrorBackground(args, "stop");
	}));

	// --- 5b. session_compact → the folder left the transcript (CV9.DS8.US5) ---
	//
	// A delta's premise is that the identity layers sit in the transcript. Pi
	// compacts on its own (threshold, overflow) and on `/compact`; after that
	// the folder is a summary. The core is told, on the chain and not awaited;
	// the next ordinary turn in Mirror Mode is full again, routed from its prompt.

	pi.on(
		"session_compact",
		once("session_compact", async (_event, ctx) => {
			const sessionId = ctx.sessionManager.getSessionFile() ?? null;
			if (!sessionId) return;
			log("INFO", "session_compact: the doorman forgets what the transcript held");
			enqueueUserLog(sessionId, ["mirror", "doorman", "--forget", "--session-id", sessionId]);
		}),
	);

	// --- 6. session_shutdown → close conversation + backup ---
	//
	// Uses extract=False because extraction calls the LLM and can take 30s+.
	// Extraction happens at the next session_start via extract_pending.

	pi.on("session_shutdown", once("session_shutdown", async (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		// Nothing inherits a stale name between sessions (CV9.DS8.US5).
		delete process.env.MIRROR_SESSION_ID;

		if (sessionId) {
			// A reply still unsent (a Pi without `agent_settled`) lands before the
			// conversation closes, after its prompt; so does a prompt in flight.
			const reply = takeStopArgs(sessionId);
			if (reply) enqueueUserLog(sessionId, reply);
			typedInput.delete(sessionId);
			await settleUserLog(sessionId);
			pendingUserLog.delete(sessionId);
			await runMirror(["conversation-logger", "session-end-pi", sessionId]);
			log("INFO", `session closed: ${sessionId}`);
		}

		// The dated zip backup answers from TypeScript (CV22.DS7.TS1).
		await runMirror(["backup", "--silent"]);
	}));
}
