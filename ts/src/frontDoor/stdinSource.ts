// Where a stdin-reading route gets its payload (CV21.DS2.US8).
//
// Two of the conversation logger's subcommands read a hook payload from
// stdin: `user-prompt` and `stop`. Until US8 the Claude hook entries did not
// touch fd 0 and let the route read it. Now an entry reads the payload first,
// to detect the runtime it is in (`runtimeDetection.ts`), and fd 0 cannot be
// read twice. So the entry hands the payload over here, and the route takes
// it before falling back to fd 0.
//
// A one-shot handoff rather than an argument because the hooks run the front
// door in-process (`runFrontDoor`), through the same `main(argv)` every other
// caller uses, and a payload does not belong in argv: argv is what `ps`
// shows, and what the Gemini hooks already put a prompt into is the exception
// this seam avoids repeating.

import { readFileSync } from "node:fs";

let provided: string | null = null;

/** Hand a payload to the next stdin-reading route in this process. */
export function provideStdin(text: string): void {
  provided = text;
}

/** The provided payload, once; else fd 0 to its end; "" when there is none. */
export function takeStdin(): string {
  if (provided !== null) {
    const text = provided;
    provided = null;
    return text;
  }
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}
