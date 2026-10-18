// What a runtime's session lifecycle lets Mirror do at its edges, by the label
// US8 stamps on the session row (`claude_code`, `codex`, `grok_build`). One home
// for the policies the hooks read: the two the close path reads (CV21.DS4.TS2,
// US4) and the one the inject hook reads (CV21.DS10.TS4, CR143).

/**
 * Whether a runtime's SessionEnd hook has the time to run the LLM tail at exit
 * (CV21.DS4.TS2). Measured bounds, with the evidence:
 *
 *   claude_code  the plugin registers the hook `async`; Claude Code runs it in
 *                the background after exit, unbounded by the user's wait.
 *   codex        synchronous ("running async SessionEnd hook synchronously",
 *                DS12.TS2 L2), 1 s for a handler with no `timeout` (DS2's live
 *                `/hooks` table, 2026-10-13, Codex 0.162.1).
 *   grok_build   1.5 s for a handler with no `timeout` (DS12.TS4, Grok 1.0.52);
 *                re-measured on 1.0.62 (CV21.DS10.US3): the guide says a
 *                plugin's SessionEnd hook gets at most that default whatever
 *                its own `timeout`, and the close landed 213–259 ms after it.
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
 *   antigravity  1.4.2: agy exposes no SessionEnd hook at all (its contracts
 *                are SessionStart, PreTool, PostTool, PreInvocation,
 *                PostInvocation, Stop; CV21.DS7.TS2 probe). Stop fires at each
 *                turn's end, never at session end, so nothing closes the
 *                conversation at TUI exit — the same situation as Codex, reached
 *                by a different absence. The agy Stop handler logs each turn and
 *                leaves the conversation open (CV21.DS7.TS3); the orphan close
 *                is what ends it, and the next SessionStart sweeps it.
 *
 * For such a runtime, an open conversation idle past the orphan threshold is an
 * orphan even while its session is active, and the close deactivates the session
 * (`closeStaleOrphans`). Every other runtime's session ends with its TUI, and an
 * active session there means a person who may still be typing.
 */
export function sessionOutlivesTui(interfaceName: string | null | undefined): boolean {
  return interfaceName === "codex" || interfaceName === "antigravity";
}

/**
 * Whether a runtime gives the model what a `UserPromptSubmit` hook returns as
 * `additionalContext` — the channel the inject hook uses (CV21.DS10.TS4, CR143).
 *
 *   grok_build   no. Grok shows a SessionStart hook's `systemMessage` on
 *                screen and discards both events' `additionalContext`
 *                (DS12.TS4 L2/L3 on 1.0.52; CV21.DS10.US3 on 1.0.62, with a
 *                random canary the probe hook emitted on every turn and the
 *                model never quoted). The loads the hook made there held a
 *                turn 2.3–2.6 s for a context nobody read; the hook returns
 *                before any of them when this is false.
 *
 * Any other label, and no label, reads it: an unlabelled payload is a Claude
 * Code payload by detection's own rule (`detectHookRuntime`), and a predicate
 * that failed closed would silence injection on the runtime that needs it.
 */
export function runtimeReadsPromptContext(interfaceName: string | null | undefined): boolean {
  return interfaceName !== "grok_build";
}
