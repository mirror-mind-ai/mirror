// CV9.DS9.US3's gate summary: one suite run of `eval --all`, read from the
// development home's eval history, as a table of modules with the probes that
// failed. Numbers and probe ids only; no probe notes, since those can quote
// model output.
//
//   node summarize.mjs <eval-history-dir> <suite_run_id>

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, suite] = process.argv.slice(2);
if (!dir || !suite) {
  console.error("usage: node summarize.mjs <eval-history-dir> <suite_run_id>");
  process.exit(2);
}

const records = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
  for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.suite_run_id === suite) records.push(r);
  }
}
records.sort((a, b) => a.eval_name.localeCompare(b.eval_name));

const first = records[0];
console.log(`suite_run_id: ${suite}`);
console.log(`model: ${first.model}  reasoning: ${first.reasoning ?? "—"}  schema: ${first.schema_version}`);
console.log(`started: ${records.map((r) => r.started_at).sort()[0]}`);
console.log("");
console.log("| Module | prompt_hash | Probes passed | Score / threshold | Result | Failed probes |");
console.log("|---|---|---|---|---|---|");
let suitePass = true;
for (const r of records) {
  const probes = r.probes ?? [];
  const passed = probes.filter((p) => p.passed).length;
  const failed = probes.filter((p) => !p.passed).map((p) => p.id + (p.blocking ? " [blocking]" : ""));
  if (!r.passed) suitePass = false;
  console.log(
    `| ${r.eval_name} | ${r.prompt_hash ?? "—"} | ${passed}/${probes.length} | ${r.score.toFixed(2)} / ${r.threshold} | ${r.passed ? "pass" : "FAIL"} | ${failed.join(", ") || "—"} |`,
  );
}
console.log("");
console.log(`suite: ${records.filter((r) => r.passed).length}/${records.length} modules passed — ${suitePass ? "PASS" : "FAIL"}`);
