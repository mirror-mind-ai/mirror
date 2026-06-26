/**
 * Mirror Logger Extension — Windows Adapter
 *
 * Drop-in replacement for .pi/extensions/mirror-logger.ts that fixes
 * Windows-specific issues:
 *   1. spawn() detached with stdio: "ignore" (Windows requires this)
 *   2. Path resolution uses node:path throughout (already true upstream)
 *   3. .mirror-minds as default dir (matches upstream config.py)
 *
 * Install: configure Pi to load this file instead of the upstream extension
 * via ~/.pi/agent/settings.json extension overrides.
 *
 * This file mirrors the upstream structure 1:1 — changes are marked with
 * "// WIN:" comments for easy diffing.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

function _resolveMemoryDir(): string {
	const raw = process.env.MEMORY_DIR;
	if (!raw) return join(homedir(), ".mirror");
	return raw.startsWith("~") ? join(homedir(), raw.slice(2)) : raw;
}

const MIRROR_DIR = _resolveMemoryDir();
const LOG_FILE = join(MIRROR_DIR, "mirror-logger.log");

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

// WIN: Resolve uv executable — on Windows, uv may be in a non-PATH location
function _resolveUvCommand(): string {
	const uvPath = join(homedir(), ".cargo", "bin", "uv.exe");
	if (existsSync(uvPath)) return uvPath;
	return "uv"; // fallback to PATH
}

const UV_CMD = _resolveUvCommand();

export default function (pi: ExtensionAPI) {

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
			// WIN: On Windows, detached spawn requires stdio: "ignore" or file descriptors.
			// Using file descriptors for stdout/stderr, "ignore" for stdin.
			const child = spawn(UV_CMD, ["run", "python", ...args], {
				cwd: process.cwd(),
				stdio: ["ignore", logFd, logFd],
				detached: true,
				// WIN: windowsHide prevents a console window from flashing
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

	async function runPy(args: string[]): Promise<string> {
		try {
			// WIN: Use resolved UV_CMD instead of bare "uv"
			const result = await pi.exec(UV_CMD, ["run", "python", ...args], {
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

	function extractText(content: unknown): string {
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) return "";
		return content
			.filter((b: Record<string, unknown>) => b && b.type === "text" && typeof b.text === "string")
			.map((b: Record<string, unknown>) => b.text as string)
			.join("\n");
	}

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

	function resolveMirrorHome(): string | null {
		const explicitHome = process.env.MIRROR_HOME?.trim();
		if (explicitHome) {
			return explicitHome.startsWith("~") ? join(homedir(), explicitHome.slice(2)) : explicitHome;
		}
		const mirrorUser = process.env.MIRROR_USER?.trim();
		if (mirrorUser) {
			return join(homedir(), ".mirror", mirrorUser);
		}

		const root = join(homedir(), ".mirror");
		try {
			const candidates = readdirSync(root)
				.map((name) => join(root, name))
				.filter((path) => {
					try {
						return statSync(path).isDirectory() && existsSync(join(path, "runtime", "skills", "pi", "extensions.json"));
					} catch {
						return false;
					}
				});
			if (candidates.length === 1) return candidates[0];
			if (candidates.length > 1) {
				log("WARN", `multiple Mirror homes with Pi external skill catalogs; set MIRROR_USER or MIRROR_HOME`);
			}
		} catch {
			// No Mirror home to infer from.
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

	pi.on("session_shutdown", async (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionFile() ?? null;

		if (sessionId) {
			await runPy(["-m", "memory", "conversation-logger", "session-end-pi", sessionId]);
			log("INFO", `session closed: ${sessionId}`);
		}

		await runPy(["-m", "memory", "backup", "--silent"]);
	});
}
