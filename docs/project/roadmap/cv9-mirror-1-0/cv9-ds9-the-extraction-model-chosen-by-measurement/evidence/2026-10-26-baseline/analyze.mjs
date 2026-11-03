// Compare eval runs across models: quality (per probe) and operations (per call).
//
//   node analyze.mjs <runs-dir> [-v]
//
// Inputs per model slug under <runs-dir>/<slug>/:
//   vinicius-dev/eval-history/<module>.jsonl  one record per module per run
//   trace.run<N>.jsonl                        one line per HTTP attempt (shim.mjs)
// A (run, module) is CONTAMINATED when, inside its time window, a logical request
// ended without a 200 (retries exhausted) or a completion hit finish=length.
// Writes <runs-dir>/report.json and prints the summary.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "/tmp/mm-model-eval";
const VERBOSE = process.argv.includes("-v");
const MODELS = ["flash-lite", "luna", "haiku"];
const FAMILIES = [
  ["reception", "You are the reception classifier"],
  ["extract", "Extract me"],
  ["curation", "You are the memory curation system"],
  ["summary", "Write a 3-"],
  ["title", "Write one concise, useful title"],
  ["tags", "You create durable search tags"],
  ["descriptor", "You are generating a routing descriptor"],
  ["journal", "Analyze th"],
  ["shadow", "You are reviewing shadow-layer"],
  ["consolidate", "You are reviewing a cluster"],
];

const family = (head = "") => {
  const flat = head.replaceAll("\n", " ");
  for (const [name, needle] of FAMILIES) if (flat.includes(needle)) return name;
  return "other";
};

/** Linear-interpolated percentile, as the Python original computed it. */
function pct(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const k = (sorted.length - 1) * q;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const readJsonl = (path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
const counter = (items) => {
  const out = {};
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
};

function load(slug) {
  const hist = {};
  const histDir = join(BASE, slug, "vinicius-dev", "eval-history");
  if (existsSync(histDir)) {
    for (const file of readdirSync(histDir).sort()) {
      if (file.endsWith(".jsonl")) hist[file.slice(0, -6)] = readJsonl(join(histDir, file));
    }
  }
  const calls = [];
  for (const file of readdirSync(join(BASE, slug)).sort()) {
    const match = /^trace\.run(\d+)\.jsonl$/.exec(file);
    if (!match) continue;
    for (const row of readJsonl(join(BASE, slug, file))) {
      calls.push({ ...row, run: Number(match[1]), family: family(row.head) });
    }
  }
  return { hist, calls };
}

/** Group consecutive retry attempts of the same request. */
function* logicalRequests(calls) {
  let group = [];
  let key = null;
  for (const call of calls) {
    const next = JSON.stringify([call.run, call.head, call.prompt_chars]);
    if (group.length && next === key) {
      group.push(call);
    } else {
      if (group.length) yield group;
      group = [call];
      key = next;
    }
  }
  if (group.length) yield group;
}

function analyze(slug) {
  const { hist, calls } = load(slug);
  calls.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const problems = [];
  for (const group of logicalRequests(calls)) {
    const last = group.at(-1);
    if (last.status !== 200) problems.push([last.at, "transport", last.family]);
    if (last.finish === "length") problems.push([last.at, "truncated", last.family]);
  }
  const probeStats = {};
  const moduleRuns = {};
  for (const [module, records] of Object.entries(hist)) {
    for (const rec of records) {
      const dirty = problems.some(([at]) => rec.started_at <= at && at <= rec.ended_at);
      moduleRuns[module] ??= { clean: 0, dirty: 0 };
      moduleRuns[module][dirty ? "dirty" : "clean"] += 1;
      for (const probe of rec.probes) {
        const id = `${module}/${probe.probe_id ?? probe.id}`;
        const stats = (probeStats[id] ??= {
          pass: 0,
          clean_runs: 0,
          dirty_runs: 0,
          dirty_pass: 0,
          notes: [],
        });
        if (dirty) {
          stats.dirty_runs += 1;
          stats.dirty_pass += probe.passed ? 1 : 0;
        } else {
          stats.clean_runs += 1;
          stats.pass += probe.passed ? 1 : 0;
        }
        if (!probe.passed) stats.notes.push((dirty ? "dirty " : "") + (probe.notes ?? "").slice(0, 110));
        stats.blocking = probe.blocking ?? false;
      }
    }
  }
  const ok = calls.filter((c) => c.status === 200);
  const byFamily = {};
  for (const c of ok) (byFamily[c.family] ??= []).push(c);
  const runs = [...new Set(calls.map((c) => c.run))].sort((a, b) => a - b);
  const familyStats = {};
  for (const name of Object.keys(byFamily).sort()) {
    const rows = byFamily[name];
    // Real latency only: ms_total exists from the corrected shim on.
    const timed = rows.filter((r) => "ms_total" in r).map((r) => r.ms_total);
    familyStats[name] = {
      n: rows.length,
      n_lat: timed.length,
      p50_ms: pct(timed, 0.5) ?? 0,
      p95_ms: pct(timed, 0.95) ?? 0,
      max_ms: timed.length ? Math.max(...timed) : 0,
      truncated: rows.filter((r) => r.finish === "length").length,
      prompt_tok: mean(rows.map((r) => r.prompt_tokens ?? 0)),
      completion_tok: mean(rows.map((r) => r.completion_tokens ?? 0)),
      reasoning_tok: mean(rows.map((r) => r.reasoning_tokens ?? 0)),
      with_reasoning: rows.filter((r) => (r.reasoning_tokens ?? 0) > 0).length,
      max_completion_vs_cap: Math.max(
        ...rows.map((r) => (r.completion_tokens ?? 0) / (r.max_tokens ?? 4096)),
      ),
    };
  }
  return {
    runs,
    suite_runs: runs.length,
    module_runs: moduleRuns,
    probe_stats: probeStats,
    problems: counter(problems.map(([, kind, fam]) => `${kind}:${fam}`)),
    attempts: calls.length,
    non200: counter(calls.filter((c) => c.status !== 200).map((c) => String(c.status))),
    fetch_errors: calls.filter((c) => c.fetch_error).length,
    truncated: ok.filter((c) => c.finish === "length").length,
    cost_per_suite: calls.reduce((sum, c) => sum + (c.cost ?? 0), 0) / Math.max(runs.length, 1),
    family: familyStats,
  };
}

const report = Object.fromEntries(MODELS.map((slug) => [slug, analyze(slug)]));
writeFileSync(join(BASE, "report.json"), JSON.stringify(report, null, 1));

const f0 = (x, w) => x.toFixed(0).padStart(w);
const out = [];
out.push("== SUITE / OPERATIONS ==");
for (const [slug, r] of Object.entries(report)) {
  out.push(
    `${slug.padEnd(10)} suite_runs=${r.suite_runs} attempts=${r.attempts} non200=${JSON.stringify(r.non200)} ` +
      `fetch_errors=${r.fetch_errors} truncated=${r.truncated} cost/suite=$${r.cost_per_suite.toFixed(4)} ` +
      `terminal_problems=${JSON.stringify(r.problems)}`,
  );
}
out.push("", "== MODULE RUNS clean/dirty ==");
const modules = [...new Set(MODELS.flatMap((s) => Object.keys(report[s].module_runs)))].sort();
for (const m of modules) {
  const cells = MODELS.map((s) => {
    const mr = report[s].module_runs[m] ?? { clean: 0, dirty: 0 };
    return `${s}=${mr.clean}/${mr.dirty}  `;
  });
  out.push(m.padEnd(22) + cells.join(""));
}
out.push("", "== PROBES with any failure (clean pass/clean runs | dirty pass/dirty runs) ==");
const keys = [...new Set(MODELS.flatMap((s) => Object.keys(report[s].probe_stats)))].sort();
for (const k of keys) {
  let interesting = false;
  const cells = MODELS.map((s) => {
    const st = report[s].probe_stats[k];
    if (!st) return `${s}=  -  `;
    if (st.pass < st.clean_runs || st.dirty_pass < st.dirty_runs) interesting = true;
    return `${s}=${st.pass}/${st.clean_runs}${st.dirty_runs ? ` (d ${st.dirty_pass}/${st.dirty_runs})` : ""}`;
  });
  if (interesting) {
    const blocking = MODELS.some((s) => report[s].probe_stats[k]?.blocking);
    out.push(`${k.padEnd(55)}${blocking ? " [B]" : "    "} ${cells.join("  ")}`);
  }
}
out.push("", "== LATENCY / TOKENS by family (successful calls) ==");
const fams = [...new Set(MODELS.flatMap((s) => Object.keys(report[s].family)))].sort();
for (const fam of fams) {
  for (const s of MODELS) {
    const d = report[s].family[fam];
    if (!d) continue;
    out.push(
      `${fam.padEnd(12)} ${s.padEnd(10)} n=${String(d.n).padStart(3)} lat(n=${String(d.n_lat).padStart(3)}) ` +
        `p50=${f0(d.p50_ms, 6)}ms p95=${f0(d.p95_ms, 6)}ms max=${f0(d.max_ms, 6)}ms trunc=${d.truncated} ` +
        `in=${f0(d.prompt_tok, 7)} out=${f0(d.completion_tok, 6)} reason=${f0(d.reasoning_tok, 5)} ` +
        `reasoning_calls=${d.with_reasoning}/${d.n} max_out/cap=${d.max_completion_vs_cap.toFixed(2)}`,
    );
  }
}
if (VERBOSE) {
  out.push("", "== FAILURE NOTES ==");
  for (const k of keys) {
    for (const s of MODELS) {
      const st = report[s].probe_stats[k];
      if (!st?.notes.length) continue;
      out.push(`${k} [${s}]`);
      const counts = Object.entries(counter(st.notes)).sort((a, b) => b[1] - a[1]);
      for (const [note, n] of counts.slice(0, 4)) out.push(`    ${n}x ${note}`);
    }
  }
}
console.log(out.join("\n"));
