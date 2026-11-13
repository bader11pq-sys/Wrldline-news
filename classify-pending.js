// Trigger a small production classification/translation verification after AI provider updates.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_PENDING_PER_RUN = 1;
const MAX_FAILED_PER_RUN = 1;
const REQUEST_GAP_MS = 10000;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log("AI classification skipped: configure Supabase URL and service role key.");
  process.exit(0);
}
const headers = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function loadByStatus(status, limit) {
  const query = new URLSearchParams({
    select: "id,url,source_url,source_name,ai_classification_status,editorial_status",
    editorial_status: "eq.published",
    ai_classification_status: "eq." + status,
    order: "published_at.asc",
    limit: String(limit)
  });
  const response = await fetch(SUPABASE_URL + "/rest/v1/articles?" + query, { headers });
  if (!response.ok) throw new Error("Could not read " + status + " articles: HTTP " + response.status + " " + (await response.text()).slice(0, 300));
  return response.json();
}
const eligible = article => !/t\.me|telegram\.me|telegram/i.test([article.url, article.source_url, article.source_name].filter(Boolean).join(" "));

async function main() {
  const fresh = (await loadByStatus("pending", MAX_PENDING_PER_RUN)).filter(eligible);
  const retries = (await loadByStatus("failed", MAX_FAILED_PER_RUN)).filter(eligible);
  const articles = fresh.concat(retries).slice(0, MAX_PENDING_PER_RUN + MAX_FAILED_PER_RUN);
  if (!articles.length) { console.log("No published stories waiting for classification."); return; }
  let classified = 0, review = 0, failed = 0, deferred = false;
  const providers = { gemini: 0, groq: 0, openrouter: 0 };
  for (let i = 0; i < articles.length; i++) {
    if (i) await sleep(REQUEST_GAP_MS);
    const response = await fetch(SUPABASE_URL + "/functions/v1/classify-news", {
      method: "POST", headers, body: JSON.stringify({ article_ids: [articles[i].id] })
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 429 || response.status === 503 || body.rate_limited) {
      console.warn("An AI provider is rate-limited; stopping this run to protect quota. HTTP " + response.status);
      deferred = true; break;
    }
    if (!response.ok) throw new Error("Classifier failed: HTTP " + response.status + " " + JSON.stringify(body).slice(0, 400));
    for (const item of body.results || []) {
      if (item.provider && Object.prototype.hasOwnProperty.call(providers, item.provider)) providers[item.provider]++;
      if (item.status === "classified") classified++;
      else if (item.status === "needs_review") review++;
      else if (item.status === "failed") { failed++; console.error("Classification failed for " + item.id + ": " + (item.error || "unknown")); }
      else if (item.status === "deferred") { deferred = true; console.warn("Classification deferred; next scheduled run will retry after cooldown: " + (item.error || "")); }
    }
    if (deferred) break;
  }
  console.log(JSON.stringify({ processed: classified + review + failed, classified, needs_review: review, failed, deferred, providers }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });