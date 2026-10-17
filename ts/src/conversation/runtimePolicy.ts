// What a runtime's session lifecycle lets Mirror do at its edges, by the label
// US8 stamps on the session row (`claude_code`, `codex`, `grok_build`). One home
// for the two policies the close path reads (CV21.DS4.TS2, US4).

/**
 * Whether a runtime's SessionEnd hook has the time to run the LLM tail at exit
 * (CV21.DS4.TS2). Measured bounds, with the evidence:
 *
 *   claude_code  the plugin registers the hook `async`; Claude Code runs it in
 *                the background after exit, unbounded by the user's wait.
 *   codex        synchronous ("running async SessionEnd hook synchronously",
 *                DS12.TS2 L2), 1 s for a handler with no `timeout` (DS2's live
 *                `/hooks` table, 2026-10-13, Codex 0.162.1).
 *   grok_build   1.5 s for a handler with no `timeout` (DS12.TS4, Grok 1.0.52).
 *                DS10 re-measures it and may flip this entry.
 *
 * Any other label, and no label, keeps today's behavior: the tail runs.
 */
export function sessionEndRunsLlmTail(interfaceName: string | null | undefined): boolean {
  switch (interfaceName) {
    case "codex":
    case "grok_build":
      return false;
    default:
      return true;
  }
}

/**
 * Whether a runtime's session outlives its TUI, so that `active = 1` on the
 * session row means RESUMABLE rather than attended (CV21.DS4.US4).
 *
 *   codex        0.163.0: `/quit` and Ctrl-D print "Disconnected from this task.
 *                Any running work continues. To reconnect, run: codex resume
 *                <id>". The thread persists in the shared app-server daemon, and
 *                SessionEnd does not fire at TUI exit: Codex's own log shows no
 *                hook started after the last turn, and a probe hook pair recorded
 *                nothing on either quit path (US4's probe, 2026-10-17). On 0.162.1,
 *                four days earlier, `/quit` ended the session and SessionEnd fired
 *                (DS2). The session is still re-measured by the next story that
 *                depends on it.
 *
 * For such a runtime, an open conversation idle past the orphan threshold is an
 * orphan even while its session is active, and the close deactivates the session
 * (`closeStaleOrphans`). Every other runtime's session ends with its TUI, and an
 * active session there means a person who may still be typing.
 */
export function sessionOutlivesTui(interfaceName: string | null | undefined): boolean {
  return interfaceName === "codex";
}
