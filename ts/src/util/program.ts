// The name the product gives itself in every command it tells a user to run
// (CV22.DS10.TS5, decisions D2 and D12).
//
// `mirror` is not yet a command on anyone's PATH: the npm `bin` is
// CV22.DS10.US3's to name. Until TS5 the usage lines and hints named the Python
// program instead -- `python -m memory ...`, `uv run python -m memory ...` --
// which no longer exists. Every one of them reads this constant now, so when
// US3 names the `bin`, this is the one place that changes.
export const PROGRAM = "mirror";
