// Kept as the US1 call site's name; the rules live in payload.ts (US2 D8).
//
// US1 shipped this module with its own copy of the separator logic. US2 needed
// the same semantics with `indent=2` and a float rule, so the two were folded
// into one encoder rather than maintained twice. This re-export keeps US1's
// imports and tests unmoved.

export { encodeJsonLine } from "./payload.ts";
