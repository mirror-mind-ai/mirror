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
 * All heavy logic lives in the Python CLI. This extension is a thin dispatcher.
 * Failures are swallowed to never block Pi — but logged to $MEMORY_DIR/mirror-logger.log.
 *
 * External skill prep note:
 * Pi reads installed external skills from
 *   ~/.mirror-minds/<user>/runtime/skills/pi/extensions.json
 * rather than from source manifests under ~/.mirror-minds/<user>/extensions/.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

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
	const raw = process.env.MEMORY_DIR;
	if (!raw) return join(homedir(), NEW_HOMES_DIR);
	return raw.startsWith("~") ? join(homedir(), raw.slice(2)) : raw;
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

// Read the nearest .env by walking upward from startDir, mirroring the Python
// core's dotenv loading in src/memory/config.py (first file wins, no quote
// stripping, only KEY=VALUE lines that are not comments). Pi (Node) never loads
// .env on its own, so without this the extension cannot see the per-workspace
// MIRROR_USER that Python reads.
function _readDotenv(startDir: string): Record<string, string> {
	let dir = startDir;
	for (;;) {
		const candidate = join(dir, ".env");
		try {
			if (statSync(candidate).isFile()) {
				const out: Record<string, string> = {};
				for (const rawLine of readFileSync(candidate, "utf-8").split(/\r?\n/)) {
					const line = rawLine.trim();
					if (!line || line.startsWith("#") || !line.includes("=")) continue;
					const eq = line.indexOf("=");
					const key = line.slice(0, eq).trim();
					if (key) out[key] = line.slice(eq + 1).trim();
				}
				return out;
			}
		} catch {
			// Not a readable file — keep walking upward.
		}
		const parent = dirname(dir);
		if (parent === dir) return {};
		dir = parent;
	}
}

// Effective Mirror env: real shell env wins over .env, matching Python's
// os.environ.setdefault semantics (shell present → keep it; else fill from .env).
function _effectiveMirrorEnv(): { home?: string; user?: string } {
	const dotenv = _readDotenv(process.cwd());
	const rawHome = "MIRROR_HOME" in process.env ? process.env.MIRROR_HOME : dotenv.MIRROR_HOME;
	const rawUser = "MIRROR_USER" in process.env ? process.env.MIRROR_USER : dotenv.MIRROR_USER;
	return { home: rawHome?.trim() || undefined, user: rawUser?.trim() || undefined };
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

	function log(level: string, msg: string): void {
		try {
			const ts = new Date().toISOString();
			mkdirSync(MIRROR_DIR, { recursive: true });
			appendFileSync(LOG_FILE, `${ts} [${level}] ${msg}\n`);
		} catch {
			// Logging failure must never break anything
		}
	}

	function runPyBackground(args: string[], label: string): void {
		let logFd: number | undefined;
		try {
			mkdirSync(MIRROR_DIR, { recursive: true });
			logFd = openSync(LOG_FILE, "a");
			const child = spawn("uv", ["run", "python", ...args], {
				cwd: process.cwd(),
				stdio: ["ignore", logFd, logFd],
				detached: true,
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

	async function runPy(args: string[]): Promise<string> {
		try {
			// Use `uv run python` so the project's venv (which has the `memory`
			// package installed) is used. Plain `python3` resolves to whatever PATH
			// finds first (often a pyenv shim without project deps), causing
			// `ModuleNotFoundError: No module named 'memory'`. See conversa
			// 2026-05-10 for full diagnosis.
			const result = await pi.exec("uv", ["run", "python", ...args], {
				timeout: 30_000,
			});
			const stderr = (result?.stderr ?? "").trim();
			if (stderr) {
				log("WARN", `stderr from [${args.slice(0, 3).join(" ")}]: ${stderr.slice(0, 500)}`);
			}
			return (result?.stdout ?? "").trim();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			log("ERROR", `runPy failed [${args.slice(0, 3).join(" ")}]: ${message.slice(0, 500)}`);
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
		const statusArgs = ["-m", "memory", "welcome", "--status-line"];
		if (sessionId) {
			statusArgs.push("--session-id", sessionId);
		}
		const compactStatus = (await runPy(statusArgs)).trim();
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

	// --- 1. session_start → unmute + close stale orphans + extract pending ---

	pi.on("session_start", async (_event, ctx) => {
		log("INFO", "session_start fired");
		if (ctx.hasUI) {
			ctx.ui.setStatus("mirror", "◇ Mirror · starting… maintenance will continue in background");
		}
		const summary = await runPy(["-m", "memory", "conversation-logger", "session-start", "--fast"]);
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

		const welcome = (await runPy(["-m", "memory", "welcome"])).trim();
		if (welcome) {
			log("INFO", `welcome: ${welcome.split("\n")[0]}`);
		}

		if (ctx.hasUI) {
			if (welcome) {
				ctx.ui.notify(welcome, "info");
			}
			await refreshMirrorStatus(ctx);
			runPyBackground(["-m", "memory", "conversation-logger", "session-maintenance"], "session-maintenance");
		} else {
			runPyBackground(["-m", "memory", "conversation-logger", "session-maintenance"], "session-maintenance");
		}
	});

	// --- 2. before_agent_start → log user prompt with explicit session id ---

	pi.on("before_agent_start", async (event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;
		if (!sessionId) return;

		const prompt = event.prompt ?? "";
		if (!prompt || prompt.startsWith("/")) return;

		log("INFO", `log-user: ${prompt.slice(0, 80)}...`);
		await runPy([
			"-m",
			"memory",
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

		runPyBackground(
			[
				"-m",
				"memory",
				"conversation-logger",
				"log-assistant",
				sessionId,
				content,
				"--interface",
				"pi",
			],
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
			await runPy(["-m", "memory", "conversation-logger", "session-end-pi", sessionId]);
			log("INFO", `session closed: ${sessionId}`);
		}

		await runPy(["-m", "memory", "backup", "--silent"]);
	});
}
