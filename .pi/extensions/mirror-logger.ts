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
 * Pi should eventually read installed external skills from
 *   ~/.mirror/<user>/runtime/skills/pi/extensions.json
 * rather than from source manifests under ~/.mirror/<user>/extensions/.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Respect MEMORY_DIR so Pi session files land in the same directory Python reads.
// Fallback to ~/.mirror if unset.
function _resolveMemoryDir(): string {
	const raw = process.env.MEMORY_DIR;
	if (!raw) return join(homedir(), ".mirror");
	return raw.startsWith("~") ? join(homedir(), raw.slice(2)) : raw;
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

	function resolveMirrorHome(): string | null {
		const explicitHome = process.env.MIRROR_HOME?.trim();
		if (explicitHome) {
			return explicitHome.startsWith("~") ? join(homedir(), explicitHome.slice(2)) : explicitHome;
		}
		const mirrorUser = process.env.MIRROR_USER?.trim();
		if (mirrorUser) {
			return join(homedir(), ".mirror", mirrorUser);
		}

		// Pi may be started without Mirror-specific environment variables.
		// In that case, infer the active Mirror home when exactly one user home
		// has an installed Pi external-skill catalog.
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
		const summary = await runPy(["-m", "memory", "conversation-logger", "session-start"]);
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
			const compactStatus = (await runPy(["-m", "memory", "welcome", "--status-line"])).trim();
			const status = compactStatus || summary || "◇ Mirror · ?";
			ctx.ui.setStatus(
				"mirror",
				externalSkills.length > 0 ? `${status} · ext ${externalSkills.length}` : status,
			);
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

		await runPy([
			"-m",
			"memory",
			"conversation-logger",
			"log-assistant",
			sessionId,
			content,
			"--interface",
			"pi",
		]);
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
