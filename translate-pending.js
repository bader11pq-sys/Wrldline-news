const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_PER_RUN = 1;
const REQUEST_GAP_MS = 10000;
if (!SUPABASE_URL || !SERVICE_KEY) { console.log("Translation worker skipped: configure Supabase URL and service role key."); process.exit(0); }
const headers = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const pending = [];
  const pageSize = 500;
  for (let offset = 0; offset < 20000 && pending.length < MAX_PER_RUN; offset += pageSize) {
    const q = new URLSearchParams({
      select: "id,title,summary,ai_summary,lang,url,source_url,source_name,article_translations(lang,ai_summary,title,summary)",
      editorial_status: "eq.published", order: "published_at.asc", limit: String(pageSize), offset: String(offset)
    });
    const res = await fetch(SUPABASE_URL + "/rest/v1/articles?" + q, { headers });
    if (!res.ok) throw new Error("Could not load articles page " + offset + ": " + res.status + " " + (await res.text()).slice(0, 200));
    const rows = await res.json();
    for (const a of rows) {
      if (/t\.me|telegram\.me|telegram/i.test([a.url,a.source_url,a.source_name].filter(Boolean).join(" "))) continue;
      const target = /^en$/i.test(a.lang || "") || (!/[\u0600-\u06FF]/.test(a.title || "") && /[A-Za-z]/.test(a.title || "")) ? "ar" : "en";
      const translation = (a.article_translations || []).find(t => t.lang === target);
      if (!translation || !translation.title || !translation.summary || (!!a.ai_summary && !translation.ai_summary)) pending.push(a);
      if (pending.length >= MAX_PER_RUN) break;
    }
    if (rows.length < pageSize) break;
  }
  if (!pending.length) { console.log("No untranslated stories found in the current scan."); return; }
  let total = 0, deferred = false;
  const providers = { gemini: 0, groq: 0, openrouter: 0 };
  for (let i = 0; i < pending.length; i++) {
    if (i) await sleep(REQUEST_GAP_MS);
    const response = await fetch(SUPABASE_URL + "/functions/v1/translate-articles", {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ article_ids: [pending[i].id] })
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 429 || response.status === 503 || body.rate_limited) { console.warn("An AI provider is rate-limited; stopping this run."); deferred = true; break; }
    if (!response.ok) throw new Error("Translator failed HTTP " + response.status + ": " + JSON.stringify(body).slice(0, 400));
    for (const item of body.results || []) {
      if (item.provider && Object.prototype.hasOwnProperty.call(providers, item.provider)) providers[item.provider]++;
      if (item.status === "translated" || item.status === "already_translated") total++;
      else if (item.status === "deferred") { deferred = true; console.warn("Translation deferred for quota cooldown: " + (item.error || "")); }
      else if (item.status === "failed") console.error("Translation failed for " + item.id + ": " + (item.error || "unknown"));
    }
    if (deferred) break;
    console.log("Translation item " + (i + 1) + ": " + total + " ready so far.");
  }
  console.log(JSON.stringify({ translated: total, deferred, providers }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });