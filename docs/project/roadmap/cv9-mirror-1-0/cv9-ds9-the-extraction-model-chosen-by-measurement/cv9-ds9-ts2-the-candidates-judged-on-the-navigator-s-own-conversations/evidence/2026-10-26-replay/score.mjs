// CV9.DS9.TS2's scoring: unblind the verdicts, apply the rule the plan fixed, and
// write the committed evidence from numbers and fixed labels only.
//
//   node score.mjs                   report.json + results.md here; review.md in scratch
//   node score.mjs --check-content   no 40-char run of a transcript and no output,
//                                    judge quote, or reason of 12+ chars appears in
//                                    any file of this kit (prints counts, never text)
//   node score.mjs --check-no-rows   no llm_calls row since the run began, in either
//                                    home, names a candidate or the judge
//
// The rule (plan §6): on a surface X beats Y when X is ranked above Y at least twice
// as often as below it; a candidate beats Flash Lite when it beats it on memories and
// on two of the other four surfaces, with no more invented-fact flags; between two
// that do, more surfaces won head to head, then reception latency (TS1), then cost.
// The verdict stands only with self-consistency >= 70% and the Navigator's agreement
// > 60%.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabaseReadOnly } from "#db/database.ts";
import {
  ARM_NAMES,
  ARMS,
  DEVELOPMENT_HOME,
  JUDGE_MODEL,
  KIT,
  PRICES,
  PRODUCTION_HOME,
  PROMPT_HEADS,
  readJson,
  scratch,
} from "./common.mjs";
import { judgedSurfaces, render } from "./judge.mjs";

const SURFACES = ["memories", "tasks", "title", "summary", "tags"];
const PAIRS = [
  ["luna", "flash"],
  ["haiku", "flash"],
  ["haiku", "luna"],
];
const CRITERIA = {
  memories: ["fidelity", "coverage", "classification", "restraint"],
  tasks: ["fidelity", "coverage", "restraint"],
  title: ["topic", "concision"],
  summary: ["accuracy", "coverage", "standalone"],
  tags: ["relevance", "durability"],
};
const FLAG_KINDS = [
  "invented_fact",
  "missed_key_item",
  "wrong_classification",
  "trivial_or_duplicate",
  "not_standalone",
  "noise",
];
// TS1's measured reception p95 at reasoning none (pooled, 14 runs): the tie-break.
const TS1_RECEPTION_P95_MS = { flash: 814, luna: 3213, haiku: 1299 };

const sampleItems = () =>
  readJson(scratch("sample.json"))
    .items.map((r) => r.item)
    .filter((i) => i !== "P01");

const readJsonl = (path) =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

/** Per item and surface, each arm's rank (0 best) from one pass's verdict. */
function ranksOf(record, surface) {
  const ranking = record.verdict[surface].ranking;
  return Object.fromEntries(ranking.map((label, i) => [record.labels[surface][label], i]));
}

function pairwiseOrderings(ranks) {
  return PAIRS.map(([x, y]) => ranks[x] < ranks[y]);
}

function spearman(xs, ys) {
  const rank = (v) => {
    const sorted = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length);
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j++;
      for (let k = i; k <= j; k++) r[sorted[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

const pct = (values, q) => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const k = (s.length - 1) * q;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (k - lo);
};
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const round = (x, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

function quality(items) {
  const out = { complete: {}, pairwise: {}, scores: {}, flags: {}, length_spearman: {} };
  const allLen = [];
  const allScore = [];
  for (const surface of SURFACES) {
    const pair = Object.fromEntries(PAIRS.map(([x, y]) => [`${x}_vs_${y}`, { wins: 0, losses: 0 }]));
    const scores = Object.fromEntries(
      ARM_NAMES.map((a) => [a, Object.fromEntries(CRITERIA[surface].map((c) => [c, []]))]),
    );
    const flags = Object.fromEntries(
      ARM_NAMES.map((a) => [a, Object.fromEntries(FLAG_KINDS.map((k) => [k, 0]))]),
    );
    const lengths = [];
    const means = [];
    let complete = 0;
    for (const item of items) {
      const path = scratch("verdicts", "pass1", `${item}.json`);
      if (!existsSync(path)) continue;
      const record = readJson(path);
      if (!record.valid || !record.surfaces.includes(surface)) continue;
      complete += 1;
      const ranks = ranksOf(record, surface);
      for (const [x, y] of PAIRS) {
        const p = pair[`${x}_vs_${y}`];
        if (ranks[x] < ranks[y]) p.wins += 1;
        else p.losses += 1;
      }
      const { outputs } = judgedSurfaces(item);
      for (const [label, arm] of Object.entries(record.labels[surface])) {
        const v = record.verdict[surface][label];
        for (const c of CRITERIA[surface]) scores[arm][c].push(v.scores[c]);
        for (const f of v.flags) if (f.kind in flags[arm]) flags[arm][f.kind] += 1;
        const length = render(surface, outputs[arm].results[surface].value).length;
        const m = mean(CRITERIA[surface].map((c) => v.scores[c]));
        lengths.push(length);
        means.push(m);
        allLen.push(length);
        allScore.push(m);
      }
    }
    for (const p of Object.values(pair)) {
      p.verdict =
        p.wins > 0 && p.wins >= 2 * p.losses
          ? "beats"
          : p.losses > 0 && p.losses >= 2 * p.wins
            ? "loses"
            : "tie";
    }
    out.complete[surface] = complete;
    out.pairwise[surface] = pair;
    out.scores[surface] = Object.fromEntries(
      ARM_NAMES.map((a) => [
        a,
        Object.fromEntries(CRITERIA[surface].map((c) => [c, round(mean(scores[a][c]))])),
      ]),
    );
    out.flags[surface] = flags;
    out.length_spearman[surface] = round(spearman(lengths, means));
  }
  out.length_spearman.all = round(spearman(allLen, allScore));
  return out;
}

function selfConsistency() {
  const { items } = readJson(scratch("rejudge.json"));
  let agree = 0;
  let total = 0;
  for (const item of items) {
    const a = readJson(scratch("verdicts", "pass1", `${item}.json`));
    const b = readJson(scratch("verdicts", "pass2", `${item}.json`));
    if (!a.valid || !b.valid) continue;
    for (const surface of a.surfaces.filter((s) => b.surfaces.includes(s))) {
      const pa = pairwiseOrderings(ranksOf(a, surface));
      const pb = pairwiseOrderings(ranksOf(b, surface));
      for (let i = 0; i < pa.length; i++) {
        total += 1;
        if (pa[i] === pb[i]) agree += 1;
      }
    }
  }
  return { items: items.length, orderings: total, agree, rate: round(total ? agree / total : null) };
}

function calibration() {
  const path = scratch("calibration-answers.json");
  if (!existsSync(path)) return null;
  const answers = readJson(path);
  let agree = 0;
  let total = 0;
  let topAgree = 0;
  let surfaces = 0;
  for (const [item, bySurface] of Object.entries(answers)) {
    const record = readJson(scratch("verdicts", "pass1", `${item}.json`));
    for (const [surface, ranking] of Object.entries(bySurface)) {
      const navigator = Object.fromEntries(
        ranking.map((label, i) => [record.labels[surface][label], i]),
      );
      const judge = ranksOf(record, surface);
      const pn = pairwiseOrderings(navigator);
      const pj = pairwiseOrderings(judge);
      for (let i = 0; i < pn.length; i++) {
        total += 1;
        if (pn[i] === pj[i]) agree += 1;
      }
      surfaces += 1;
      if (ranking[0] === record.verdict[surface].ranking[0]) topAgree += 1;
    }
  }
  return {
    items: Object.keys(answers).length,
    surfaces,
    orderings: total,
    agree,
    rate: round(total ? agree / total : null),
    best_pick_agree: topAgree,
  };
}

function operations() {
  const out = {};
  for (const arm of ARM_NAMES) {
    const outputs = readJson(scratch("outputs", `${arm}.json`));
    const pilot = outputs.items.P01?.window ?? null;
    const calls = readJsonl(scratch("traces", `${arm}.jsonl`)).filter(
      (c) => !(pilot && c.at >= pilot[0] && c.at <= pilot[1]),
    );
    const failedSurfaces = Object.entries(outputs.items)
      .filter(([item]) => item !== "P01")
      .flatMap(([, e]) => Object.values(e.results))
      .filter((r) => !r.ok).length;
    const retriedOk = Object.entries(outputs.items)
      .filter(([item]) => item !== "P01")
      .flatMap(([, e]) => Object.values(e.results))
      .filter((r) => r.ok && r.pass).length;
    const bySurface = {};
    for (const [surface, head] of PROMPT_HEADS) {
      const rows = calls.filter((c) => (c.head ?? "").replaceAll("\n", " ").includes(head));
      const ok = rows.filter((c) => c.status === 200);
      const timed = ok.filter((c) => "ms_total" in c).map((c) => c.ms_total);
      bySurface[surface] = {
        calls: rows.length,
        ok: ok.length,
        non200: rows.length - ok.length,
        p50_ms: round(pct(timed, 0.5), 0),
        p95_ms: round(pct(timed, 0.95), 0),
        prompt_tokens: round(mean(ok.map((c) => c.prompt_tokens ?? 0)), 0),
        completion_tokens: round(mean(ok.map((c) => c.completion_tokens ?? 0)), 0),
        reasoning_tokens: round(mean(ok.map((c) => c.reasoning_tokens ?? 0)), 1),
        cut_off: ok.filter((c) => c.finish === "length").length,
        cost: round(
          rows.reduce((s, c) => s + (c.cost ?? 0), 0),
          4,
        ),
      };
    }
    out[arm] = {
      model: ARMS[arm].model,
      reasoning: ARMS[arm].reasoning,
      calls: calls.length,
      non200: calls.filter((c) => c.status !== 200).length,
      surfaces_failed_after_retries: failedSurfaces,
      surfaces_recovered_by_retry: retriedOk,
      cost: round(
        calls.reduce((s, c) => s + (c.cost ?? 0), 0),
        4,
      ),
      by_surface: bySurface,
    };
  }
  return out;
}

const ROLE_SURFACE = {
  extraction: "memories",
  task_extraction: "tasks",
  conversation_title: "title",
  conversation_summary: "summary",
  conversation_tags: "tags",
};

function projection(ops) {
  const db = openDatabaseReadOnly(join(PRODUCTION_HOME, "memory.db"));
  let rows;
  try {
    rows = db
      .prepare(
        "SELECT role AS role, COUNT(*) AS n, AVG(prompt_tokens) AS pin, " +
          "AVG(completion_tokens) AS pout, SUM(cost_usd) AS cost FROM llm_calls " +
          "WHERE called_at > datetime('now','-30 day') AND role != 'embedding' GROUP BY role",
      )
      .all();
  } finally {
    db.close();
  }
  const total = Object.fromEntries(ARM_NAMES.map((a) => [a, 0]));
  for (const row of rows) {
    const surface = ROLE_SURFACE[row.role];
    if (!surface) {
      // Not replayed (reception): every arm keeps Flash Lite's actual cost.
      for (const a of ARM_NAMES) total[a] += row.cost ?? 0;
      continue;
    }
    total.flash += row.cost ?? 0;
    const f = ops.flash.by_surface[surface];
    for (const arm of ["luna", "haiku"]) {
      const d = ops[arm].by_surface[surface];
      const rin = d.prompt_tokens / f.prompt_tokens;
      const rout = d.completion_tokens / Math.max(f.completion_tokens, 1);
      const [pin, pout] = PRICES[arm];
      total[arm] += (row.n * (row.pin * rin * pin + row.pout * rout * pout)) / 1e6;
    }
  }
  return Object.fromEntries(ARM_NAMES.map((a) => [a, round(total[a], 2)]));
}

function rule(q, sc, cal, ops) {
  const others = ["tasks", "title", "summary", "tags"];
  const invented = (arm) =>
    SURFACES.reduce((s, surface) => s + q.flags[surface][arm].invented_fact, 0);
  const beatsFlash = (arm) => {
    const key = `${arm}_vs_flash`;
    const memories = q.pairwise.memories[key].verdict === "beats";
    const won = others.filter((s) => q.pairwise[s][key].verdict === "beats").length;
    return {
      memories,
      other_surfaces_won: won,
      invented_fact: invented(arm),
      flash_invented_fact: invented("flash"),
      beats: memories && won >= 2 && invented(arm) <= invented("flash"),
    };
  };
  const luna = beatsFlash("luna");
  const haiku = beatsFlash("haiku");
  let recommendation;
  let reason;
  if (luna.beats && haiku.beats) {
    const h = SURFACES.filter((s) => q.pairwise[s].haiku_vs_luna.verdict === "beats").length;
    const l = SURFACES.filter((s) => q.pairwise[s].haiku_vs_luna.verdict === "loses").length;
    if (h !== l) {
      recommendation = h > l ? "haiku" : "luna";
      reason = `both beat Flash Lite; head to head ${h > l ? "Haiku" : "Luna"} wins ${Math.max(h, l)} surfaces to ${Math.min(h, l)}`;
    } else {
      recommendation =
        TS1_RECEPTION_P95_MS.haiku <= TS1_RECEPTION_P95_MS.luna ? "haiku" : "luna";
      reason = "both beat Flash Lite and are even head to head; reception latency (TS1) decides";
    }
  } else if (luna.beats || haiku.beats) {
    recommendation = luna.beats ? "luna" : "haiku";
    reason = `only ${luna.beats ? "Luna" : "Haiku"} beats Flash Lite`;
  } else {
    recommendation = "flash";
    reason = "neither candidate beats Flash Lite: keep it";
  }
  const judgeStands =
    sc.rate !== null && sc.rate >= 0.7 && (cal === null ? null : cal.rate !== null && cal.rate > 0.6);
  return {
    luna_vs_flash: luna,
    haiku_vs_flash: haiku,
    recommendation,
    reason,
    judge_stands: judgeStands,
    spend_replay: round(ARM_NAMES.reduce((s, a) => s + ops[a].cost, 0), 4),
  };
}

function writeReview(items) {
  const lines = ["# CV9.DS9.TS2 — every verdict, models revealed (local only)", ""];
  for (const item of items) {
    const path = scratch("verdicts", "pass1", `${item}.json`);
    if (!existsSync(path)) continue;
    const record = readJson(path);
    const { outputs } = judgedSurfaces(item);
    const t = readJson(scratch("transcripts", `${item}.json`));
    lines.push(`## ${item}${t.journey ? ` — ${t.journey}` : " — no journey"}`, "");
    for (const surface of record.surfaces) {
      const v = record.verdict?.[surface];
      const order = (v?.ranking ?? []).map((l) => record.labels[surface][l]).join(" > ");
      lines.push(`### ${surface} — judge: ${order}`, "", `> ${v?.reason ?? ""}`, "");
      for (const [label, arm] of Object.entries(record.labels[surface])) {
        const s = v?.[label];
        const scores = CRITERIA[surface].map((c) => `${c} ${s?.scores?.[c]}`).join(", ");
        lines.push(`**${arm}** (${label}; ${scores})`, "", render(surface, outputs[arm].results[surface].value), "");
        for (const f of s?.flags ?? []) {
          lines.push(`- ⚑ ${f.kind}: “${f.quote}” — ${f.evidence}`);
        }
        lines.push("");
      }
    }
  }
  writeFileSync(scratch("review.md"), lines.join("\n"), { mode: 0o600 });
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

function writeResults(report) {
  const q = report.quality;
  const o = report.operations;
  const md = [
    "# CV9.DS9.TS2 — results (generated by score.mjs from report.json)",
    "",
    "## Head to head, per surface (ranked above / below; the rule needs 2:1)",
    "",
    table(
      ["Surface", "complete", "Luna vs Flash Lite", "Haiku vs Flash Lite", "Haiku vs Luna"],
      SURFACES.map((s) => [
        s,
        String(q.complete[s]),
        ...PAIRS.map(([x, y]) => {
          const p = q.pairwise[s][`${x}_vs_${y}`];
          return `${p.wins}–${p.losses} ${p.verdict}`;
        }),
      ]),
    ),
    "",
    "## Mean criterion scores (1–5)",
    "",
    table(
      ["Surface", "criterion", "Flash Lite", "Luna", "Haiku"],
      SURFACES.flatMap((s) =>
        CRITERIA[s].map((c) => [s, c, ...ARM_NAMES.map((a) => String(q.scores[s][a][c]))]),
      ),
    ),
    "",
    "## Error flags (count)",
    "",
    table(
      ["Surface", "flag", "Flash Lite", "Luna", "Haiku"],
      SURFACES.flatMap((s) =>
        FLAG_KINDS.filter((k) => ARM_NAMES.some((a) => q.flags[s][a][k] > 0)).map((k) => [
          s,
          k,
          ...ARM_NAMES.map((a) => String(q.flags[s][a][k])),
        ]),
      ),
    ),
    "",
    `Length–score Spearman correlation: ${SURFACES.map((s) => `${s} ${q.length_spearman[s]}`).join(", ")}; all ${q.length_spearman.all}.`,
    "",
    "## Operations (sample only, pilot excluded)",
    "",
    table(
      ["Surface", "arm", "p50 ms", "p95 ms", "in tok", "out tok", "reasoning", "cut off", "non-200", "cost $"],
      SURFACES.flatMap((s) =>
        ARM_NAMES.map((a) => {
          const d = o[a].by_surface[s];
          return [s, a, d.p50_ms, d.p95_ms, d.prompt_tokens, d.completion_tokens, d.reasoning_tokens, d.cut_off, d.non200, d.cost].map(String);
        }),
      ),
    ),
    "",
    table(
      ["Arm", "calls", "non-200", "failed after retries", "recovered by retry", "cost $", "30-day projection $"],
      ARM_NAMES.map((a) => [
        a,
        String(o[a].calls),
        String(o[a].non200),
        String(o[a].surfaces_failed_after_retries),
        String(o[a].surfaces_recovered_by_retry),
        String(o[a].cost),
        String(report.projection_30d[a]),
      ]),
    ),
    "",
    "## The judge",
    "",
    `- Self-consistency: ${report.self_consistency.agree}/${report.self_consistency.orderings} pairwise orderings (${report.self_consistency.rate}) over ${report.self_consistency.items} re-judged conversations.`,
    report.calibration
      ? `- The Navigator's calibration: ${report.calibration.agree}/${report.calibration.orderings} pairwise orderings (${report.calibration.rate}); best pick agreed on ${report.calibration.best_pick_agree} of ${report.calibration.surfaces} surfaces.`
      : "- The Navigator's calibration: pending.",
    `- Judge spend: $${report.judge.spend}; prompt SHA-256 ${report.judge.prompt_sha256}.`,
    "",
    "## The rule",
    "",
    `- Luna vs Flash Lite: memories ${report.rule.luna_vs_flash.memories ? "won" : "not won"}, other surfaces won ${report.rule.luna_vs_flash.other_surfaces_won}/4, invented facts ${report.rule.luna_vs_flash.invented_fact} vs ${report.rule.luna_vs_flash.flash_invented_fact}: ${report.rule.luna_vs_flash.beats ? "beats" : "does not beat"} Flash Lite.`,
    `- Haiku vs Flash Lite: memories ${report.rule.haiku_vs_flash.memories ? "won" : "not won"}, other surfaces won ${report.rule.haiku_vs_flash.other_surfaces_won}/4, invented facts ${report.rule.haiku_vs_flash.invented_fact} vs ${report.rule.haiku_vs_flash.flash_invented_fact}: ${report.rule.haiku_vs_flash.beats ? "beats" : "does not beat"} Flash Lite.`,
    `- Recommendation: **${report.rule.recommendation}** (${report.rule.reason}).`,
    `- The judge's verdict stands: ${report.rule.judge_stands === null ? "pending the calibration" : report.rule.judge_stands}.`,
    "",
  ].join("\n");
  writeFileSync(join(KIT, "results.md"), md);
}

function checkContent() {
  const files = readdirSync(KIT).filter((f) => /\.(md|json|mjs|sh)$/.test(f));
  const evidence = files.map((f) => readFileSync(join(KIT, f), "utf8")).join("\n\u0000\n");
  // A window counts only when it is mostly text: runs of indentation or alignment
  // spaces are shared by every code file and every pasted snippet, and say nothing.
  const meaningful = (w) => w.replace(/\s/g, "").length >= 24;
  const windows = new Set();
  for (let i = 0; i + 40 <= evidence.length; i++) {
    const w = evidence.slice(i, i + 40);
    if (meaningful(w)) windows.add(w);
  }
  let transcriptHits = 0;
  const hitWindows = new Set();
  const items = readJson(scratch("sample.json")).items.map((r) => r.item);
  for (const item of items) {
    const t = readJson(scratch("transcripts", `${item}.json`));
    for (const m of t.messages) {
      for (let i = 0; i + 40 <= m.content.length; i++) {
        const w = m.content.slice(i, i + 40);
        if (windows.has(w)) {
          transcriptHits++;
          hitWindows.add(w);
        }
      }
    }
  }
  const strings = new Set();
  const collect = (value) => {
    if (typeof value === "string") {
      const s = value.trim();
      if (s.length >= 12) strings.add(s);
    } else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  for (const arm of ARM_NAMES) {
    const outputs = readJson(scratch("outputs", `${arm}.json`));
    for (const entry of Object.values(outputs.items)) {
      for (const r of Object.values(entry.results)) if (r.ok) collect(r.value);
    }
  }
  for (const pass of ["pass1", "pass2", "pilot"]) {
    const dir = scratch("verdicts", pass);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const record = readJson(join(dir, file));
      for (const surface of Object.values(record.verdict ?? {})) {
        collect(surface?.reason);
        for (const label of ["A", "B", "C"]) {
          for (const f of surface?.[label]?.flags ?? []) {
            collect(f.quote);
            collect(f.evidence);
          }
        }
      }
    }
  }
  // The rubric's own vocabulary is not content, and neither is one common word: a
  // string counts when it is a phrase, or a single word of 20 characters or more.
  const allowed = new Set([
    ...ARM_NAMES,
    ...SURFACES,
    ...FLAG_KINDS,
    ...Object.values(CRITERIA).flat(),
    "no support in the transcript",
  ]);
  const identifying = (s) => /\s/.test(s) || s.length >= 20;
  const stringHits = [...strings].filter(
    (s) => !allowed.has(s) && identifying(s) && evidence.includes(s),
  );
  console.log(
    `content check over ${files.length} files: ${transcriptHits} transcript run(s), ` +
      `${stringHits.length} output or verdict string(s) found (of ${strings.size} checked)`,
  );
  // Whatever matched is, by construction, text of these files: safe to show.
  for (const w of hitWindows) console.log(`  window: ${JSON.stringify(w)}`);
  for (const s of stringHits) console.log(`  string: ${JSON.stringify(s)}`);
  process.exitCode = transcriptHits === 0 && stringHits.length === 0 ? 0 : 1;
}

function checkNoRows() {
  const starts = ARM_NAMES.map((a) => readJson(scratch("outputs", `${a}.json`)).started_at).sort();
  const since = starts[0];
  const models = [...ARM_NAMES.filter((a) => a !== "flash").map((a) => ARMS[a].model), JUDGE_MODEL];
  const result = {};
  for (const [name, home] of [
    ["production", PRODUCTION_HOME],
    ["development", DEVELOPMENT_HOME],
  ]) {
    const db = openDatabaseReadOnly(join(home, "memory.db"));
    try {
      result[name] = db
        .prepare(
          `SELECT COUNT(*) AS n FROM llm_calls WHERE called_at >= ? AND model IN (${models.map(() => "?").join(",")})`,
        )
        .get(since, ...models).n;
    } finally {
      db.close();
    }
  }
  console.log(
    `llm_calls rows since ${since} naming ${models.join(", ")}: production ${result.production}, development ${result.development}`,
  );
  process.exitCode = result.production === 0 && result.development === 0 ? 0 : 1;
  return { since, models, ...result };
}

if (process.argv.includes("--check-content")) checkContent();
else if (process.argv.includes("--check-no-rows")) checkNoRows();
else {
  const items = sampleItems();
  const q = quality(items);
  const sc = selfConsistency();
  const cal = calibration();
  const ops = operations();
  const usage = readJsonl(scratch("judge-usage.jsonl"));
  const judgeSpend = round(
    usage.reduce((s, u) => s + (u.cost ?? 0), 0),
    4,
  );
  const report = {
    product_commit: execFileSync("git", ["-C", KIT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sample: (() => {
      const s = readJson(scratch("sample.json"));
      return {
        seed: s.seed,
        cutoff: s.cutoff,
        eligible: s.eligible,
        eligible_with_journey: s.eligible_with_journey,
        drawn: items.length,
        with_journey: s.items.filter((r) => r.item !== "P01" && r.journey).length,
      };
    })(),
    judge: {
      model: JUDGE_MODEL,
      reasoning: "high",
      prompt_sha256: readJson(scratch("judge-prompt.json")).sha256,
      calls: usage.length,
      formats: [...new Set(usage.map((u) => u.format))],
      providers: [...new Set(usage.map((u) => u.provider).filter(Boolean))],
      spend: judgeSpend,
    },
    quality: q,
    self_consistency: sc,
    calibration: cal,
    operations: ops,
    projection_30d: projection(ops),
  };
  report.rule = rule(q, sc, cal, ops);
  writeFileSync(join(KIT, "report.json"), `${JSON.stringify(report, null, 1)}\n`);
  writeResults(report);
  writeReview(items);
  console.log(`report.json and results.md written; review.md in scratch. Recommendation: ${report.rule.recommendation}`);
}
