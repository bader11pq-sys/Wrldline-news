const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_PER_RUN = 30;
const BATCH_SIZE = 10;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log("AI background classification skipped: configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in GitHub Actions secrets.");
  process.exit(0);
}
const headers = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };
async function main() {
  const query = new URLSearchParams({ select: "id,url,source_url,source_name,ai_classification_status,editorial_status", editorial_status: "eq.published", order: "published_at.desc", limit: "300" });
  const response = await fetch(SUPABASE_URL + "/rest/v1/articles?" + query, { headers });
  if (!response.ok) throw new Error("Could not read pending articles: HTTP " + response.status + " " + (await response.text()).slice(0, 300));
  const rows = await response.json();
  const pending = rows.filter(article => (!article.ai_classification_status || article.ai_classification_status === "pending") && !/t\.me|telegram\.me|telegram/i.test([article.url, article.source_url, article.source_name].filter(Boolean).join(" "))).slice(0, MAX_PER_RUN);
  if (!pending.length) { console.log("No newly published stories are waiting for AI classification."); return; }
  let completed = 0;
  for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
    const ids = pending.slice(offset, offset + BATCH_SIZE).map(article => article.id);
    const result = await fetch(SUPABASE_URL + "/functions/v1/classify-news", { method: "POST", headers, body: JSON.stringify({ article_ids: ids }) });
    const body = await result.json().catch(() => ({}));
    if (result.status === 503 && body.error) { console.error("AI classifier is not configured: " + body.error); return; }
    if (!result.ok) throw new Error("Classifier failed: HTTP " + result.status + " " + JSON.stringify(body).slice(0, 400));
    const results = body.results || [];
    const classified = results.filter(item => item.status === "classified").length;
    const review = results.filter(item => item.status === "needs_review").length;
    const failed = results.filter(item => item.status === "failed").length;
    completed += body.processed || 0;
    console.log("Batch " + (Math.floor(offset / BATCH_SIZE) + 1) + ": " + classified + " classified, " + review + " need review, " + failed + " failed.");
  }
  console.log("Background AI classification processed " + completed + " stories.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });