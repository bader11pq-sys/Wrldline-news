/* WRLDLINE NEWSROOM ENGINE — shared live data, clustering, rendering helpers */
(() => {
  "use strict";

  const data = Object.assign({}, window.WL_NEWSROOM || {}, window.WL_NEWSROOM_EXTRA || {}, window.WL_NEWSROOM_IMPACT || {});
  window.WL_NEWSROOM = data;

  const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const CACHE_KEY = "wrldline:newsroom-cache:v1";
  const CACHE_TTL = 4 * 60 * 1000;

  const AR_STOP = new Set(("من في على إلى عن أن إن ما لا لم لن قد كان كانت يكون تكون هو هي هم هن هذا هذه ذلك تلك التي الذي الذين مع بعد قبل بين حتى أو ثم كل بعض غير حول ضد خلال عبر منذ لدى كما أي الا إلا لكن بل وقد وقال قالت أعلن أعلنت قالت قال مصر السعودية الولايات المتحدة اليوم أمس غدا الأنباء وكالة مصادر مصدر خبر أخبار عاجل تقرير خاص جديد جديدة أول مرة عدة نحو دون سوى بما مما فيما بينما حيث إذ إذا قد لقد وهو وهي وقالت وأضاف وأضافت").split(/\s+/));
  const FRAMING = [
    ["هجوم", "عملية"],
    ["مقتل", "استشهاد"],
    ["انقلاب", "تغيير"],
    ["احتلال", "سيطرة"],
    ["غارات", "ضربات"],
    ["حصار", "قيود"],
    ["مسلحون", "مقاومة"],
    ["أزمة", "توتر"],
    ["رفض", "تحفظ"],
    ["اتهام", "انتقاد"]
  ];

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function normalize(value = "") {
    return String(value)
      .normalize("NFKC")
      .replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\u0600-\u06FF0-9a-zA-Z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }
  function tokens(value = "") {
    return normalize(value).split(" ").filter(w => w.length >= 3 && !AR_STOP.has(w));
  }
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    a.forEach(x => { if (b.has(x)) inter++; });
    return inter / (a.size + b.size - inter);
  }
  function timeAgo(value) {
    const t = Date.parse(value || "");
    if (!Number.isFinite(t)) return "";
    const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (mins < 1) return "الآن";
    if (mins < 60) return "قبل " + mins + " د";
    const h = Math.floor(mins / 60);
    if (h < 24) return "قبل " + h + " س";
    const d = Math.floor(h / 24);
    return "قبل " + d + " ي";
  }
  function formatDate(value) {
    const t = Date.parse(value || "");
    if (!Number.isFinite(t)) return "";
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", calendar: "gregory" }).format(new Date(t));
  }
  function sourceName(a) {
    return String(a.source_name || a.src || a.source || "مصدر إخباري").trim();
  }
  function articleURL(a) {
    return a.url || a.source_url || "";
  }
  function safeURL(u) {
    try { const url = new URL(u); if (!["http:", "https:"].includes(url.protocol)) return ""; return url.href; } catch { return ""; }
  }

  async function fetchArticles(limit = 400) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.at < CACHE_TTL && Array.isArray(cached.rows)) return cached.rows;
    } catch {}
    const select = "select=id,title,summary,category,country,source_name,url,source_url,published_at,image_url,ai_risk_level,ai_country_code,is_breaking,content_type,editorial_status";
    const url = SUPABASE_URL + "/rest/v1/articles?" + select + "&editorial_status=eq.published&order=published_at.desc&limit=" + Math.min(1000, limit);
    try {
      const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const rows = await res.json();
      const clean = (Array.isArray(rows) ? rows : []).filter(a => a && a.title && a.title.length > 12);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows: clean })); } catch {}
      return clean;
    } catch (error) {
      console.warn("WRLDLINE newsroom fetch:", error);
      try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
        if (cached && Array.isArray(cached.rows)) return cached.rows;
      } catch {}
      return [];
    }
  }

  function clusterArticles(articles, options = {}) {
    const minSources = options.minSources || 2;
    const maxAgeH = options.maxAgeH || 72;
    const cutoff = Date.now() - maxAgeH * 3600 * 1000;
    const rows = (articles || []).filter(a => {
      const t = Date.parse(a.published_at || "");
      return Number.isFinite(t) && t >= cutoff && a.title && a.title.length >= 24;
    }).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));

    const clusters = [];
    rows.forEach(a => {
      const tk = new Set(tokens(a.title));
      if (tk.size < 2) return;
      let best = null, bestScore = 0;
      for (const c of clusters) {
        const score = jaccard(tk, c.tokens);
        const shared = [...tk].filter(x => c.tokens.has(x)).length;
        if (score >= 0.34 || shared >= 3) {
          if (score > bestScore) { bestScore = score; best = c; }
        }
      }
      if (best) {
        best.articles.push(a);
        tk.forEach(x => best.tokens.add(x));
        best.sources.add(sourceName(a));
        best.timeMin = Math.min(best.timeMin, Date.parse(a.published_at));
        best.timeMax = Math.max(best.timeMax, Date.parse(a.published_at));
      } else {
        clusters.push({
          tokens: new Set(tk),
          articles: [a],
          sources: new Set([sourceName(a)]),
          timeMin: Date.parse(a.published_at),
          timeMax: Date.parse(a.published_at)
        });
      }
    });

    return clusters
      .filter(c => c.sources.size >= minSources)
      .map(c => {
        const articles = c.articles.slice().sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
        const labelTokens = [...c.tokens].filter(t => !/^\d+$/.test(t)).slice(0, 5);
        const framing = articles.map(a => {
          const found = [];
          FRAMING.forEach(pair => {
            pair.forEach(term => {
              if (a.title.includes(term)) found.push(term);
            });
          });
          return { article: a, terms: [...new Set(found)] };
        });
        return {
          tokens: labelTokens,
          articles,
          sources: [...c.sources],
          sourceCount: c.sources.size,
          timeGapH: Math.max(0, Math.round((c.timeMax - c.timeMin) / 3600000)),
          framing,
          balance: Math.min(100, c.sources.size * 22 + Math.min(30, articles.length * 4))
        };
      })
      .sort((a, b) => b.sourceCount - a.sourceCount || b.articles.length - a.articles.length);
  }

  function riskScore(articles) {
    const levels = { critical: 100, high: 78, elevated: 58, guarded: 34, low: 16, unknown: 0 };
    const rows = (articles || []).filter(a => a.ai_risk_level && a.ai_risk_level !== "unknown");
    if (!rows.length) return null;
    const total = rows.reduce((s, a) => s + (levels[a.ai_risk_level] ?? 0), 0);
    return Math.round(total / rows.length);
  }

  function categoryCounts(articles) {
    const map = new Map();
    (articles || []).forEach(a => { const k = a.category || a.cat || "uncategorized"; map.set(k, (map.get(k) || 0) + 1); });
    return map;
  }

  function statusMeta(status) {
    return {
      done: ["منجز", "wl-status--done"],
      partial: ["جزئي", "wl-status--partial"],
      stalled: ["متعثر", "wl-status--stalled"],
      pending: ["قيد التنفيذ", "wl-status--pending"]
    }[status] || ["غير محدد", "wl-status--pending"];
  }

  function sourceLink(a, cls = "") {
    const u = safeURL(articleURL(a));
    const name = escapeHTML(sourceName(a));
    return u ? '<a class="' + cls + '" href="' + escapeHTML(u) + '" target="_blank" rel="noopener noreferrer">' + name + " ↗</a>" : "<span>" + name + "</span>";
  }

  function articleCard(a, opts = {}) {
    const img = a.image_url ? '<img src="' + escapeHTML(a.image_url) + '" alt="' + escapeHTML(a.title) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">' : "";
    const cls = opts.compact ? "wl-live-story" : "news-card";
    return '<article class="' + cls + '">' + (opts.compact ? "" : '<div class="card-open">' + img) +
      '<div class="' + (opts.compact ? "wl-live-copy" : "card-content") + '">' +
      '<div class="story-meta"><span class="category-label">' + escapeHTML(opts.category || "") + "</span><span>" + escapeHTML(sourceName(a)) + "</span><span class=\"read-time\">" + timeAgo(a.published_at) + "</span></div>" +
      "<h3>" + escapeHTML(a.title) + "</h3>" +
      (a.summary && !opts.compact ? "<p>" + escapeHTML(a.summary) + "</p>" : "") +
      '<div class="source-line">' + sourceLink(a) + "</div></div>" + (opts.compact ? "" : "</div>") + "</article>";
  }

  function renderInto(selector, html) {
    const el = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (el) el.innerHTML = html;
  }

  window.WLNR = {
    data,
    fetchArticles,
    clusterArticles,
    riskScore,
    categoryCounts,
    escapeHTML,
    normalize,
    tokens,
    timeAgo,
    formatDate,
    sourceName,
    articleURL,
    safeURL,
    sourceLink,
    articleCard,
    renderInto,
    statusMeta
  };
})();
