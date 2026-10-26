// Preload (--import): records every chat-completions call the eval harness makes.
//
// A read-only observer: the request is forwarded untouched, and the response is
// read from a clone. It records NO request headers, ever. The `authorization`
// header carries the OpenRouter key, and this trace becomes committed evidence.
//
// `ms` is the time to response headers, which OpenRouter sends before the
// completion exists; `ms_total` is the time until the body has arrived, the
// latency a caller waits. `reasoning` is the effort the product's own transport
// put in the body (CV9.DS9.TS1), so the trace proves what was sent.
import { appendFileSync } from "node:fs";

const tracePath = process.env.MM_TRACE;
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (!tracePath || !url.endsWith("/chat/completions")) return realFetch(input, init);
  let req = {};
  try {
    req = JSON.parse(init.body);
  } catch {}
  const first = req.messages?.[0]?.content ?? "";
  const t0 = Date.now();
  const rec = {
    at: new Date(t0).toISOString(),
    model: req.model,
    reasoning: req.reasoning?.effort ?? null,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    prompt_chars: req.messages?.reduce((n, m) => n + (m.content?.length ?? 0), 0),
    head: first.slice(0, 120),
  };
  try {
    const res = await realFetch(input, init);
    rec.ms = Date.now() - t0;
    rec.status = res.status;
    try {
      const b = await res.clone().json();
      rec.ms_total = Date.now() - t0;
      const c = b.choices?.[0];
      Object.assign(rec, {
        provider: b.provider,
        finish: c?.finish_reason,
        native_finish: c?.native_finish_reason,
        prompt_tokens: b.usage?.prompt_tokens,
        completion_tokens: b.usage?.completion_tokens,
        reasoning_tokens: b.usage?.completion_tokens_details?.reasoning_tokens,
        cached_tokens: b.usage?.prompt_tokens_details?.cached_tokens,
        cost: b.usage?.cost,
        error: b.error ? `${b.error.code} ${b.error.message}` : undefined,
        content: c?.message?.content?.slice(0, 4000),
      });
    } catch (e) {
      rec.parse_error = String(e);
    }
    appendFileSync(tracePath, `${JSON.stringify(rec)}\n`);
    return res;
  } catch (e) {
    rec.ms = Date.now() - t0;
    rec.fetch_error = e?.name ?? String(e);
    appendFileSync(tracePath, `${JSON.stringify(rec)}\n`);
    throw e;
  }
};
