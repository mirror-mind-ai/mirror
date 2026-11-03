// Sends the exact body shape LiveLlmProvider.complete() sends, nothing more.
const key = process.env.OPENROUTER_API_KEY;
const models = process.argv.slice(2);
const prompt = `You extract memories from a conversation. Return ONLY a JSON array; each item has "title", "content", "memory_type" (decision|insight|commitment|tension|learning), "layer" (self|ego|shadow). Return [] if nothing is worth remembering.

Conversation:
USER: I've decided to stop taking on consulting work in Q4 so I can finish the course launch. It's scary because consulting pays the bills.
ASSISTANT: That's a real trade-off. What makes it the right call now?
USER: Every time I split focus the launch slips. I keep saying yes to clients to avoid the fear of the launch flopping.`;
for (const model of models) {
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now();
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 4096 }),
    });
    const ms = Date.now() - t0;
    const body = await res.json().catch(() => null);
    const c = body?.choices?.[0];
    let json = "n/a";
    try { JSON.parse((c?.message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "")); json = "valid"; } catch { json = "INVALID"; }
    console.log(JSON.stringify({ model, run: i + 1, status: res.status, ms, provider: body?.provider, finish: c?.finish_reason, native_finish: c?.native_finish_reason, usage: body?.usage, json, fenced: /^```/.test(c?.message?.content ?? ""), error: body?.error?.message, preview: (c?.message?.content ?? "").slice(0, 160) }));
  }
}
