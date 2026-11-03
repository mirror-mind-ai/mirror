// CV9.DS8.TS1 — the Pi probe. Loaded only by the route's explicit `--extension`;
// never from `.pi/`. One mechanism per run, named by DS8_PROBE_MODE:
//
//   p2  at session_start, set MIRROR_SESSION_ID in the process environment to the
//       session file, which the bash tool inherits and the front door reads as its
//       environment session id. Rewrites nothing.
//   p1  at tool_call, when the model's bash command is `mirror mirror load …` or
//       `mirror load …` with no --session-id, append --session-id with the session
//       file shell-quoted. The narrowest match; every rewrite is logged.
//
// Every bash tool call is logged in both modes (DS8_PROBE_LOG), so the load the model
// runs by itself is seen as the event, not inferred from the front-door log.
import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const MODE = process.env.DS8_PROBE_MODE ?? "p2";
const LOG = process.env.DS8_PROBE_LOG ?? "/tmp/ds8-ts1-probe.log";
const log = (line: string) => appendFileSync(LOG, `${new Date().toISOString()}\t${MODE}\t${line}\n`);
const LOAD = /\bmirror (mirror )?load\b/;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const file = ctx.sessionManager.getSessionFile();
    if (MODE === "p2" && file) {
      process.env.MIRROR_SESSION_ID = file;
      log(`session_start: MIRROR_SESSION_ID set to ${file}`);
    } else {
      log(`session_start: ${file ?? "(no session file)"}; environment untouched`);
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const input = event.input as { command: string };
    log(`tool_call bash: ${input.command}`);
    if (MODE !== "p1") return;
    if (!LOAD.test(input.command) || /--session-id/.test(input.command)) return;
    const file = ctx.sessionManager.getSessionFile();
    if (!file) return;
    const quoted = `'${file.replace(/'/g, `'\\''`)}'`;
    input.command = `${input.command} --session-id ${quoted}`;
    log(`rewrote: ${input.command}`);
  });
}
