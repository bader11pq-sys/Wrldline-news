/* WRLDLINE product pages: shared helpers (language, DOM building, public data access).
 * No innerHTML: every node is built with textContent so API data cannot inject markup. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WLProduct = factory();
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";

  function currentLang(doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    return d && d.documentElement && d.documentElement.lang === "en" ? "en" : "ar";
  }

  /** h("div", {class:"x", onclick:fn, "data-id":1}, "text", childNode) */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === false || value === null || value === undefined) continue;
      if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
      else if (key === "class") el.className = value;
      else if (key === "text") el.textContent = String(value);
      else if (key === "href" || key === "src") el.setAttribute(key, safeUrl(value));
      else el.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  /** Only http(s), same-site relative and mailto links survive. */
  function safeUrl(value) {
    const text = String(value ?? "").trim();
    if (/^(?:\/|\.\/|\.\.\/|#|\?)/.test(text) || /^[\w-]+(?:\.html)?(?:[?#].*)?$/.test(text)) return text;
    try {
      const url = new URL(text);
      return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "#";
    } catch { return "#"; }
  }

  function pick(dict, lang) { return (key) => (dict[lang] && dict[lang][key]) ?? (dict.ar && dict.ar[key]) ?? key; }

  function numberFormat(value, lang, options) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", options).format(value);
  }
  /** 1_276_942_933_333 -> "1.28 T" style compact value in the reader's language. */
  function compact(value, lang) {
    if (!Number.isFinite(value)) return "—";
    return numberFormat(value, lang, { notation: "compact", maximumFractionDigits: 2 });
  }
  function dateFormat(value, lang, options) {
    const t = typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(t)) return "";
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn-ca-gregory", options || { dateStyle: "medium" }).format(new Date(t));
  }

  async function rpc(name, body, options = {}) {
    const fetcher = options.fetch || fetch;
    const response = await fetcher(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body || {}), credentials: "omit", cache: "no-store",
      signal: AbortSignal.timeout(options.timeout || 12000)
    });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  }

  /** Latest public rows from the publication-gated RPC. Never returns drafts. */
  function publicNews(limit, options) {
    return rpc("public_home_news_recent_v4", { p_limit: Math.min(1000, limit || 300), p_lane: "all" }, options);
  }

  function getClient() {
    if (typeof window === "undefined" || !window.supabase || !window.supabase.createClient) return null;
    if (window.WRLDLINE_AUTH && window.WRLDLINE_AUTH.client) return window.WRLDLINE_AUTH.client;
    if (!window.__wlProductClient) {
      window.__wlProductClient = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    }
    return window.__wlProductClient;
  }

  function safeStorage() {
    try { const s = window.localStorage; s.getItem("wl:probe"); return s; } catch { return null; }
  }

  return Object.freeze({ SUPABASE_URL, PUBLISHABLE_KEY, currentLang, h, safeUrl, pick, numberFormat, compact, dateFormat, rpc, publicNews, getClient, safeStorage });
});
