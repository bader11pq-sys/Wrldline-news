import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const GOOGLE_NEWS = "https://news.google.com/rss/search?q=";
const LOCK_SECONDS = 240;
const SOURCES = [
  { publisher: "الجزيرة", domain: "aljazeera.net", category: "world", country: null, scope: "international" },
  { publisher: "العربية", domain: "alarabiya.net", category: "world", country: null, scope: "international" },
  { publisher: "سكاي نيوز عربية", domain: "skynewsarabia.com", category: "world", country: null, scope: "international" },
  { publisher: "BBC عربي", domain: "bbc.com/arabic", category: "world", country: null, scope: "international" },
  { publisher: "CNN عربية", domain: "arabic.cnn.com", category: "world", country: null, scope: "international" },
  { publisher: "DW عربية", domain: "dw.com/ar", category: "world", country: null, scope: "international" },
  { publisher: "آر تي عربي", domain: "arabic.rt.com", category: "world", country: null, scope: "international" },
  { publisher: "فرانس 24 عربي", domain: "france24.com/ar", category: "world", country: null, scope: "international" },
  { publisher: "الحرة", domain: "alhurra.com", category: "world", country: null, scope: "international" },
  { publisher: "وكالة الأناضول العربية", domain: "aa.com.tr/ar", category: "world", country: null, scope: "international" },
  { publisher: "عاجل", domain: "ajel.sa", category: "world", country: "السعودية", scope: "national" },
  { publisher: "وكالة الأنباء السعودية واس", domain: "spa.gov.sa", category: "world", country: "السعودية", scope: "national" },
  { publisher: "أرقام", domain: "argaam.com", category: "economy", country: "السعودية", scope: "national" },
  { publisher: "الاقتصادية", domain: "aleqt.com", category: "economy", country: "السعودية", scope: "national" },
  { publisher: "الشرق للأعمال", domain: "asharqbusiness.com", category: "economy", country: "السعودية", scope: "national" },
  { publisher: "CNBC عربية", domain: "cnbcarabia.com", category: "economy", country: "الإمارات", scope: "national" },
  { publisher: "وكالة أنباء الإمارات", domain: "wam.ae", category: "world", country: "الإمارات", scope: "national" },
  { publisher: "وفا الفلسطينية", domain: "wafa.ps", category: "world", country: "فلسطين", scope: "national" },
  { publisher: "سانا", domain: "sana.sy", category: "world", country: "سوريا", scope: "national" },
  { publisher: "عنب بلدي", domain: "enabbaladi.net", category: "world", country: "سوريا", scope: "national" },
  { publisher: "الشرق الأوسط", domain: "aawsat.com", category: "world", country: null, scope: "international" },
  { publisher: "كونا", domain: "kuna.net.kw", category: "world", country: "الكويت", scope: "national" },
  { publisher: "مدى مصر", domain: "madamasr.com", category: "politics", country: "مصر", scope: "national" },
  { publisher: "مال", domain: "maaal.com", category: "economy", country: "السعودية", scope: "national" }
];

const headers = () => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json"
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const responseJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

async function dbRequest(path: string, init: RequestInit = {}) {
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string> ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(20000)
  });
}

async function retryFetch(url: string, init: RequestInit) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
      const retryAfter = response.headers.get("retry-after");
      const retrySeconds = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)
        ? Number(retryAfter) * 1000
        : retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 0;
      await sleep(Math.min(8000, Math.max(retrySeconds, 1200 * (2 ** attempt)) + Math.floor(Math.random() * 250)));
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
      await sleep(1200 * (2 ** attempt) + Math.floor(Math.random() * 250));
    }
  }
  throw lastError ?? new Error("request_failed");
}

function decode(value: string) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ").replace(/&(?:rlm|lrm);/gi, "")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}
function cleanText(value: string) {
  return decode(value).replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function tag(block: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i"));
  return match ? cleanText(match[1]) : "";
}
function sourceUrl(source: typeof SOURCES[number]) {
  const query = `site:${source.domain} (breaking OR "just in" OR عاجل) when:1h`;
  return GOOGLE_NEWS + encodeURIComponent(query) + "&hl=ar&gl=SA&ceid=SA:ar";
}
const urgentTitle = /\bBREAKING\b|\bJUST IN\b|\bLIVE\b|عاجل|الآن|قبل قليل|تطور عاجل|نبأ عاجل/i;

function parseRows(xml: string, source: typeof SOURCES[number], feedUrl: string) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const now = Date.now();
  const rows = blocks.slice(0, 20).map((block) => {
    const title = tag(block, "title");
    const link = tag(block, "link") || (block.match(/<link\b[^>]*href=["']([^"']+)["']/i) ?? [])[1] || "";
    const summary = tag(block, "description") || tag(block, "summary") || tag(block, "content");
    const published = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated");
    const date = published ? new Date(published) : null;
    if (!title || !/^https?:\/\//i.test(link) || !urgentTitle.test(title) || !date || Number.isNaN(date.getTime())) return null;
    const age = now - date.getTime();
    if (age > 2 * 60 * 60 * 1000 || age < -5 * 60 * 1000) return null;
    return {
      url: link,
      title: title.slice(0, 500),
      summary: summary.slice(0, 3000),
      source_name: source.publisher + " Breaking Desk",
      source_url: feedUrl,
      category: source.category,
      country: null,
      event_country: null,
      source_country: source.country,
      source_scope: source.scope,
      source_language: "ar",
      language_detection: "declared",
      lang: "ar",
      verification: "unconfirmed",
      published_at: date.toISOString(),
      editorial_status: "published",
      ai_classification_status: "pending",
      classification_reason: "breaking_desk_unclassified",
      taxonomy_version: "wrldline-taxonomy-v1",
      is_breaking: true
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));
  return { raw: blocks.length, rows: [...new Map(rows.map((row) => [row.url, row])).values()] };
}

async function collect(source: typeof SOURCES[number]) {
  const url = sourceUrl(source);
  try {
    const response = await retryFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WRLDLINE-Breaking/4.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*"
      }
    });
    if (!response.ok) return {
      source: source.publisher, ok: false, raw: 0, count: 0,
      error_code: `http_${response.status}`, error: `HTTP ${response.status}`
    };
    const parsed = parseRows(await response.text(), source, url);
    return { source: source.publisher, ok: true, raw: parsed.raw, count: parsed.rows.length, rows: parsed.rows };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { source: source.publisher, ok: false, raw: 0, count: 0, error_code: /timeout/i.test(message) ? "timeout" : "fetch_error", error: message.slice(0, 180) };
  }
}

async function claimLock() {
  const response = await dbRequest("rpc/claim_breaking_monitor", {
    method: "POST", body: JSON.stringify({ p_lease_seconds: LOCK_SECONDS })
  });
  if (!response.ok) throw new Error("Could not acquire breaking monitor lease");
  return await response.json() as string | null;
}
async function releaseLock(token: string) {
  const response = await dbRequest("rpc/release_breaking_monitor", {
    method: "POST", body: JSON.stringify({ p_owner_token: token })
  });
  if (!response.ok) console.error("BREAKING_LOCK_RELEASE_ERROR", response.status);
}
async function recordAttempts(results: Array<{ source: string; ok: boolean; count: number; error_code?: string }>) {
  const payload = results.map((item) => ({
    source_key: "breaking:" + item.source,
    ok: item.ok,
    had_new_news: item.ok && item.count > 0,
    error_code: item.error_code ?? null
  }));
  const response = await dbRequest("rpc/record_breaking_source_attempts", {
    method: "POST", body: JSON.stringify({ p_results: payload })
  });
  if (!response.ok) throw new Error("Could not persist breaking source monitoring state");
}

async function sendSms() {
  try {
    const healthResponse = await fetch(`${SUPABASE_URL}/functions/v1/telnyx-gateway`, {
      method: "POST",
      headers: { ...headers() },
      body: JSON.stringify({ action: "health" }),
      signal: AbortSignal.timeout(12000)
    });
    if (!healthResponse.ok) return { status: "health_check_failed", http: healthResponse.status };
    const health = await healthResponse.json();
    const missing = [
      !health.telnyx_key_configured ? "TELNYX_API_KEY" : null,
      !health.messaging_profile_configured ? "TELNYX_MESSAGING_PROFILE_ID" : null,
      !health.from_number_configured ? "TELNYX_FROM_NUMBER" : null
    ].filter(Boolean);
    if (missing.length) return { status: "not_configured", missing };
    const dispatch = await fetch(`${SUPABASE_URL}/functions/v1/telnyx-gateway`, {
      method: "POST",
      headers: { ...headers() },
      body: JSON.stringify({ action: "dispatch_breaking" }),
      signal: AbortSignal.timeout(30000)
    });
    const body = await dispatch.json().catch(() => ({}));
    if (!dispatch.ok || body.ok === false) return { status: "failed", http: dispatch.status };
    return { status: "sent", sent: body.sent ?? 0, failed: body.failed ?? 0, articles: body.articles ?? 0 };
  } catch (error) {
    return { status: "failed", error: (error instanceof Error ? error.message : String(error)).slice(0, 160) };
  }
}

async function runMonitor() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing Supabase service credentials");
  const token = await claimLock();
  if (!token) return { ok: true, skipped: "another_breaking_run_holds_the_lease" };
  try {
    const results: Awaited<ReturnType<typeof collect>>[] = new Array(SOURCES.length);
    let next = 0;
    async function lane() {
      while (next < SOURCES.length) {
        const index = next++;
        results[index] = await collect(SOURCES[index]);
      }
    }
    await Promise.all(Array.from({ length: 4 }, () => lane()));

    const allRows = results.flatMap((result) => result.rows ?? []);
    if (allRows.length) {
      const save = await dbRequest("articles?on_conflict=url", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(allRows)
      });
      if (!save.ok) {
        const errorText = (await save.text()).slice(0, 160);
        for (const result of results) {
          if (result.ok && result.count > 0) {
            result.ok = false; result.error_code = "database_write_failed"; result.error = errorText;
          }
        }
      }
    }

    await recordAttempts(results);
    const counts = {
      configured_sources: SOURCES.length,
      successful: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      raw_items: results.reduce((sum, result) => sum + result.raw, 0),
      urgent_matches: results.reduce((sum, result) => sum + result.count, 0),
      sources_with_matches: results.filter((result) => result.ok && result.count > 0).length
    };
    const sms = await sendSms();
    console.log("BREAKING_MONITOR_SUMMARY", JSON.stringify({ ...counts, sms }));
    return { ok: counts.successful > 0, ...counts, sms, sources: results.map(({ source, ok, raw, count, error_code }) => ({ source, ok, raw, count, error_code: error_code ?? null })) };
  } finally {
    await releaseLock(token);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-wrldline-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" }
  });
  if (request.method !== "POST") return responseJson({ error: "POST required" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return responseJson({ error: "Monitor credentials missing" }, 503);
  const secret = request.headers.get("x-wrldline-cron-secret") ?? "";
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  let authorized = false;
  if (secret && secret.length <= 512) {
    try {
      const auth = await dbRequest("rpc/verify_wrldline_cron_secret", {
        method: "POST", body: JSON.stringify({ p_secret: secret })
      });
      authorized = auth.ok && await auth.json() === true;
    } catch {
      authorized = false;
    }
  }
  // CI/manual runs may use the already-provisioned service role credential only.
  if (!authorized && bearer && bearer === SERVICE_KEY) authorized = true;
  if (!authorized) return responseJson({ error: "Unauthorized" }, 401);
  try {
    const result = await runMonitor();
    return responseJson(result, result.ok || result.skipped ? 200 : 503);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("BREAKING_MONITOR_ERROR", message.slice(0, 300));
    return responseJson({ ok: false, error: "Breaking monitor failed" }, 503);
  }
});
