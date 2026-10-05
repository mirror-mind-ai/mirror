/**
 * Mirror Logger Extension
 *
 * Integrates Pi with the Mirror Mind memory system.
 *
 * Events handled:
 * - session_start      → unmute + close stale orphans + extract pending memories
 * - before_agent_start → log user prompt with explicit session id
 * - agent_end          → log assistant response (all messages in the turn)
 * - session_shutdown   → close conversation + backup database
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

export default function (pi: ExtensionAPI) {
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

	async function runMirror(args: string[]): Promise<string> {
		try {
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

	async function refreshMirrorStatus(ctx: MirrorStatusContext): Promise<void> {
		if (!ctx.hasUI) return;
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		const statusArgs = ["welcome", "--status-line"];
		if (sessionId) {
			statusArgs.push("--session-id", sessionId);
		}
		const compactStatus = (await runMirror(statusArgs)).trim();
		const externalCatalog = loadInstalledPiExternalSkills();
		const externalSkills = externalCatalog?.extensions ?? [];
		const status = compactStatus || "◇ Mirror · ?";
		ctx.ui.setStatus(
			"mirror",
			externalSkills.length > 0 ? `${status} · ext ${externalSkills.length}` : status,
		);
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

	pi.on("resources_discover", async () => {
		const skillPaths = getInstalledPiSkillPaths();
		if (skillPaths.length > 0) {
			log("INFO", `resources_discover: loaded ${skillPaths.length} installed Pi external skill(s)`);
		}
		return { skillPaths };
	});

	// --- 0. the Operating Instructions, for a session Pi did not open in the tree ---
	//
	// Pi loads one context file per directory from the cwd upward. Inside the
	// checkout that is this tree's AGENTS.md; from anywhere else -- an npm
	// user's project, /tmp -- it is not, and a session that answers /mm-mirror
	// without the modes, the persona signature, or the Builder boundary is not
	// a Mirror session (CV22.DS10.US3 D13). So the extension appends the file
	// it ships with, unless Pi already loaded that very file.

	pi.on("before_agent_start", async (event) => {
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
	});

	// --- 1. session_start → unmute + close stale orphans + extract pending ---

	pi.on("session_start", async (_event, ctx) => {
		log("INFO", "session_start fired");
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
		const summary = await runMirror(["conversation-logger", "session-start", "--fast"]);
		if (ctx.hasUI) {
			ctx.ui.setStatus("mirror", "◇ Mirror · checking release status…");
		}
		const externalCatalog = loadInstalledPiExternalSkills();
		const externalSkills = externalCatalog?.extensions ?? [];
		const externalSkillSummary = externalSkills.length
			? `External skills: ${externalSkills.map((item) => item.command_name ?? item.id ?? "(unknown)").join(", ")}`
			: "External skills: none";
		log("INFO", `session-start result: ${summary || "(empty)"}`);
		log("INFO", externalSkillSummary);

		const welcome = (await runMirror(["welcome"])).trim();
		if (welcome) {
			log("INFO", `welcome: ${welcome.split("\n")[0]}`);
		}

		if (ctx.hasUI) {
			if (welcome) {
				ctx.ui.notify(welcome, "info");
			}
			await refreshMirrorStatus(ctx);
			runMirrorBackground(["conversation-logger", "session-maintenance"], "session-maintenance");
		} else {
			runMirrorBackground(["conversation-logger", "session-maintenance"], "session-maintenance");
		}
	});

	// --- 2. before_agent_start → log user prompt with explicit session id ---

	pi.on("before_agent_start", async (event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		if (!sessionId) return;

		const prompt = event.prompt ?? "";
		if (!prompt || prompt.startsWith("/")) return;

		log("INFO", `log-user: ${prompt.slice(0, 80)}...`);
		await runMirror([
			"conversation-logger",
			"log-user",
			sessionId,
			truncate(prompt),
			"--interface",
			"pi",
		]);
	});

	// --- 3. agent_end → log assistant response ---
	//
	// agent_end fires once per user prompt, with ALL messages in the cycle
	// (assistant + tool calls + tool results). Extract only assistant text
	// and log as a single consolidated message.

	pi.on("agent_end", async (event, ctx) => {
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

		log("INFO", `log-assistant: ${assistantTexts.length} block(s), ${assistantTexts.join("").length} chars`);

		const combined = assistantTexts.join("\n\n---\n\n");
		const content = truncate(combined);

		runMirrorBackground(
			["conversation-logger", "log-assistant", sessionId, content, "--interface", "pi"],
			"log-assistant",
		);
		await refreshMirrorStatus(ctx);
	});

	// --- 4. session_shutdown → close conversation + backup ---
	//
	// Uses extract=False because extraction calls the LLM and can take 30s+.
	// Extraction happens at the next session_start via extract_pending.

	pi.on("session_shutdown", async (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;

		if (sessionId) {
			await runMirror(["conversation-logger", "session-end-pi", sessionId]);
			log("INFO", `session closed: ${sessionId}`);
		}

		// The dated zip backup answers from TypeScript (CV22.DS7.TS1).
		await runMirror(["backup", "--silent"]);
	});
}
