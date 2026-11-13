const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_PER_RUN = 3;
if (!SUPABASE_URL || !SERVICE_KEY) { console.log("Translation worker skipped: configure Supabase URL and service role key."); process.exit(0); }
const headers = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };
const languageOf = article => {
  const title = String(article.title || "");
  if (/[\\u0600-\\u06FF]/.test(title)) return "ar";
  const declared = String(article.lang || "").toLowerCase();
  if (declared.startsWith("ar")) return "ar";
  return "en";
};

async function main() {
  const pending = [];
  const pageSize = 500;
  for (let offset = 0; offset < 20000 && pending.length < MAX_PER_RUN; offset += pageSize) {
    const q = new URLSearchParams({
      select: "id,title,summary,ai_summary,lang,url,source_url,source_name,article_translations(lang,ai_summary,title,summary)",
      editorial_status: "eq.published", order: "published_at.desc", limit: String(pageSize), offset: String(offset)
    });
    const res = await fetch(SUPABASE_URL + "/rest/v1/articles?" + q, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error("Could not load articles page " + offset + ": " + res.status + " " + (await res.text()).slice(0, 200));
    const rows = await res.json();
    for (const a of rows) {
      if (!a.title) continue;
      const sourceLang = languageOf(a);
      const target = sourceLang === "ar" ? "en" : "ar";
      const translation = (a.article_translations || []).find(t => t.lang === target);
      if (!translation || !translation.title || !translation.summary || (!!a.ai_summary && !translation.ai_summary)) {
        pending.push({ id: a.id, target, sourceLang, title: String(a.title).slice(0, 100) });
      }
      if (pending.length >= MAX_PER_RUN) break;
    }
    if (rows.length < pageSize) break;
  }
  if (!pending.length) { console.log("TRANSLATION_SUMMARY " + JSON.stringify({ scanned: true, pending: 0, translated: 0 })); return; }
  const response = await fetch(SUPABASE_URL + "/functions/v1/translate-articles", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ article_ids: pending.map(item => item.id) }),
    signal: AbortSignal.timeout(180000)
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 429 || response.status === 503 || body.rate_limited) {
    console.warn("Translation provider unavailable or rate-limited. " + JSON.stringify(body).slice(0, 600));
    console.log("TRANSLATION_SUMMARY " + JSON.stringify({ pending: pending.length, translated: 0, deferred: true }));
    return;
  }
  if (!response.ok) throw new Error("Translator failed HTTP " + response.status + ": " + JSON.stringify(body).slice(0, 600));
  const results = body.results || [];
  const translated = results.filter(item => item.status === "translated").length;
  const already = results.filter(item => item.status === "already_translated").length;
  const deferred = results.some(item => item.status === "deferred");
  const failed = results.filter(item => item.status === "failed");
  for (const item of results) {
    if (item.status === "failed") console.error("TRANSLATION_FAILED " + item.id + ": " + (item.error || "unknown"));
    if (item.status === "deferred") console.warn("TRANSLATION_DEFERRED " + item.id + ": " + (item.error || "provider unavailable"));
  }
  console.log("TRANSLATION_SUMMARY " + JSON.stringify({
    selected: pending.length,
    translated,
    already_translated: already,
    failed: failed.length,
    deferred,
    providers: results.reduce((counts, item) => { if (item.provider) counts[item.provider] = (counts[item.provider] || 0) + 1; return counts; }, {}),
    targets: pending.map(item => item.target)
  }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
