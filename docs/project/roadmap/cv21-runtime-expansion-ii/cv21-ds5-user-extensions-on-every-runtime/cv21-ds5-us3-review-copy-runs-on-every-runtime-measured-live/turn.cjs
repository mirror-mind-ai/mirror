// CV21.DS5.US3 — classify one headless turn's tool calls (from TS1's turn.js).
//
// Usage: node turn.cjs <claude|codex|agy|grok> <transcript> [skill]
// Prints one line, the clauses joined by "; ":
//   no tool used: answered from context
//   read the path the runtime listed      a read of the skill file at a listed path
//   searched the disk                     find / rg --files / grep -r before the answer
//   ran mirror consult                    the review-copy skill's work
//   ran mirror ext hello ping             the hello skill's work
//   denied <action>                       agy's denied_actions
//
// agy's `--print --output-format json` carries no tool calls; its conversation's
// `brain/<id>/.system_generated/logs/transcript.jsonl` does (PLANNER_RESPONSE
// `tool_calls`), and that is the file the route hands this script for agy.
const fs = require("fs");
const [rt, file, skill = "ext-(review-copy|hello)"] = process.argv.slice(2);
const text = fs.readFileSync(file, "utf8");
const cmds = [];
// A tool call is judged by its command or its path, never by free text: a `write`
// whose content holds the word "find" is not a search (the Grok review-copy run).
const describe = (name, input) => {
  const i = input || {};
  if (/write|edit/i.test(name)) return `${name} ${i.file_path || i.path || i.target_file || ""}`;
  if (typeof i.command === "string") return `${name} ${i.command}`;
  // agy's run_command carries `CommandLine`, quoted (its brain transcript, 1.4.3).
  if (typeof i.CommandLine === "string") return `${name} ${i.CommandLine.replace(/^"|"$/g, "")}`;
  if (typeof i.pattern === "string") return `${name} "pattern":${i.pattern}`;
  const path = i.file_path || i.path || i.target_file;
  if (typeof path === "string") return `${name} ${path}`;
  return `${name} ${JSON.stringify(i)}`;
};
const walk = (m) => { if (m && m.type === "tool_use") cmds.push(describe(m.name, m.input)); };
for (const line of text.split("\n")) {
  let j; try { j = JSON.parse(line); } catch { continue; }
  if (rt === "codex" && j.type === "item.completed" && j.item && j.item.type === "command_execution") cmds.push(j.item.command || "");
  if ((rt === "grok" || rt === "claude") && j.type === "assistant" && j.message) for (const c of j.message.content || []) walk(c);
  if (rt === "claude" && Array.isArray(j)) for (const e of j) if (e.message) for (const c of e.message.content || []) walk(c);
  if (rt === "agy" && j.denied_actions) for (const d of j.denied_actions) cmds.push("denied " + d.display_name);
  if (rt === "agy" && Array.isArray(j.tool_calls)) for (const t of j.tool_calls) cmds.push(describe(t.name || "tool", t.input || t.args));
}
const skillRe = new RegExp("(cat|Read|read_file).*(skills|plugins|installed-plugins|cache)[^ ]*" + skill + "\\/SKILL\\.md");
// A search counts only when it looks for the skill itself (its name, SKILL.md, a
// skills root): `grep consult` to learn how `mirror consult` is called is the work,
// not a hunt for the invoked skill (the Grok review-copy run).
const searchTool = (c) => /(^|\s|'|")(find|rg --files|rg -l|rg|grep -r|grep -rn|grep|Glob|Grep|ls -R|locate)(\s|$)/.test(c) || /"pattern":/.test(c);
const aboutSkill = (c) => /SKILL\.md|skills?\b|ext-[a-z-]+/.test(c);
const isSearch = (c) => searchTool(c) && aboutSkill(c);
const isListedRead = (c) => skillRe.test(c);
const out = [];
let searched = false, listed = false;
for (const c of cmds) { if (isSearch(c)) searched = true; else if (isListedRead(c) && !searched) listed = true; }
if (cmds.length === 0) out.push("no tool used: answered from context");
if (listed) out.push("read the path the runtime listed");
if (searched) out.push("searched the disk");
// The work itself, read from the tool calls first and from the raw transcript second
// (agy's JSON does not carry tool calls the way the others do).
const all = cmds.join("\n") + "\n" + text;
if (/mirror consult\s+\S+/.test(all)) out.push("ran mirror consult");
if (/mirror ext hello ping/.test(all)) out.push("ran mirror ext hello ping");
const denied = cmds.filter((c) => c.startsWith("denied"));
if (denied.length) out.push(denied.join(", "));
console.log(out.join("; "));
