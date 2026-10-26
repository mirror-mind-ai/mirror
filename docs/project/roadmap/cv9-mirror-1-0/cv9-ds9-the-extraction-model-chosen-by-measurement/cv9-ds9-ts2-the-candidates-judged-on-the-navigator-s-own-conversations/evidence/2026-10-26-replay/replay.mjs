// One arm of CV9.DS9.TS2's replay, in its own process.
//
//   node --import <TS1 shim> replay.mjs <arm>    (run_arm.sh sets the environment)
//   node replay.mjs --assert-arms                every traced call carries its arm's
//                                                model and reasoning setting
//
// Why one process per arm: extractMemories and extractTasks pass
// `model: resolveExtractionModel()`, which reads process.env; the title, summary,
// and tags functions pass no model, so the provider's environment decides, as it
// does for the reasoning setting. Only a process whose own environment names the
// arm's model sends every call to it.
//
// The product's functions run on the transcripts sample.mjs copied to scratch,
// with no ledger hook: nothing is written to either home. Title, summary, and tags
// return "" or [] when their call fails, so a recording wrapper tells a failed call
// from a correct empty answer.

import { existsSync, readFileSync } from "node:fs";
import { extractMemories, extractTasks } from "#extraction/conversation.ts";
import {
  generateConversationSummary,
  generateConversationTags,
  generateConversationTitle,
} from "#extraction/conversationMetadata.ts";
import { LiveLlmProvider } from "#providers/llm.ts";
import { ARM_NAMES, ARMS, readJson, scratch, surfacesFor, writeJson } from "./common.mjs";

class RecordingProvider {
  constructor(inner) {
    this.inner = inner;
    this.errors = 0;
    this.lastError = null;
  }
  async complete(request) {
    try {
      return await this.inner.complete(request);
    } catch (error) {
      this.errors += 1;
      this.lastError = error;
      throw error;
    }
  }
}

/** A failure described without content: its class, kind, and HTTP status. */
const describe = (error) =>
  [error?.name, error?.kind, error?.status].filter((part) => part !== undefined).join(" ") ||
  "error";

async function runSurface(provider, surface, t) {
  const before = provider.errors;
  try {
    let value;
    if (surface === "memories") {
      value = await extractMemories(provider, t.messages, {
        journey: t.journey,
        persona: t.persona,
        userName: t.userName,
      });
    } else if (surface === "tasks") {
      value = await extractTasks(provider, t.messages, {
        journey: t.journey,
        userName: t.userName,
      });
    } else if (surface === "title") {
      value = await generateConversationTitle(provider, t.messages, { userName: t.userName });
    } else if (surface === "summary") {
      value = await generateConversationSummary(provider, t.messages, { userName: t.userName });
    } else {
      value = await generateConversationTags(provider, t.messages, { userName: t.userName });
    }
    if (provider.errors > before) return { ok: false, error: describe(provider.lastError) };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function replay(arm) {
  const spec = ARMS[arm];
  if (!spec) throw new Error(`unknown arm ${arm}`);
  // The environment is the arm: refuse to run under any other.
  const model = process.env.MEMORY_EXTRACTION_MODEL;
  const reasoning = process.env.MEMORY_EXTRACTION_REASONING ?? null;
  if (model !== spec.model || reasoning !== spec.reasoning) {
    throw new Error(`arm ${arm} needs ${spec.model}/${spec.reasoning}, got ${model}/${reasoning}`);
  }
  const sample = readJson(scratch("sample.json"));
  const order = ["P01", ...sample.items.map((r) => r.item).filter((i) => i !== "P01")];
  const provider = new RecordingProvider(new LiveLlmProvider());
  const out = { arm, model, reasoning, started_at: new Date().toISOString(), items: {} };
  const save = () => writeJson(scratch("outputs", `${arm}.json`), out);

  for (const item of order) {
    const t = readJson(scratch("transcripts", `${item}.json`));
    const start = new Date().toISOString();
    const results = {};
    for (const surface of surfacesFor(t)) results[surface] = await runSurface(provider, surface, t);
    out.items[item] = { window: [start, new Date().toISOString()], results };
    save();
  }
  // D5: what still fails after the transport's own retries gets two later passes.
  for (let pass = 2; pass <= 3; pass++) {
    const failed = Object.entries(out.items).flatMap(([item, entry]) =>
      Object.entries(entry.results)
        .filter(([, r]) => !r.ok)
        .map(([surface]) => [item, surface]),
    );
    if (failed.length === 0) break;
    await sleep(30_000);
    for (const [item, surface] of failed) {
      const t = readJson(scratch("transcripts", `${item}.json`));
      const result = await runSurface(provider, surface, t);
      out.items[item].results[surface] = { ...result, pass };
    }
    save();
  }
  out.ended_at = new Date().toISOString();
  save();
  const failures = Object.values(out.items).flatMap((e) =>
    Object.values(e.results).filter((r) => !r.ok),
  ).length;
  console.log(`${arm}: ${order.length} conversations, ${failures} surface(s) still failed`);
}

function assertArms() {
  let ok = true;
  for (const arm of ARM_NAMES) {
    const path = scratch("traces", `${arm}.jsonl`);
    if (!existsSync(path)) {
      console.log(`${arm}: no trace`);
      ok = false;
      continue;
    }
    const calls = readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const wrong = calls.filter(
      (c) => c.model !== ARMS[arm].model || (c.reasoning ?? null) !== ARMS[arm].reasoning,
    );
    console.log(
      `${arm}: ${calls.length} traced calls, ${wrong.length} with another model or setting`,
    );
    if (wrong.length > 0 || calls.length === 0) ok = false;
  }
  process.exitCode = ok ? 0 : 1;
}

if (process.argv.includes("--assert-arms")) assertArms();
else await replay(process.argv[2]);
