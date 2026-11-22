/* Full text is requested by UUID only on an open article, never for feed cards. */
(() => {
  "use strict";
  const url = "https://vmaxbnogmmfyrcucapnq.supabase.co/rest/v1/rpc/public_article_reading";
  const key = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const limit = 12000;
  function mayBeClipped(text, webPreview = false) {
    // Postgres counts Unicode characters; the Worker also bounds UTF-16 units.
    return typeof text === "string" && (webPreview ? text.length >= limit - 40 : Array.from(text).length >= limit);
  }
  async function load(id, lang, signal) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) throw new Error("Invalid article ID");
    const response = await fetch(url, {
      method: "POST", cache: "no-store", signal: signal || AbortSignal.timeout(15000),
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: id, p_lang: ["ar","en"].includes(lang) ? lang : null })
    });
    if (!response.ok) throw new Error("Article text unavailable");
    const [result] = await response.json();
    if (!result || result.id !== id || typeof result.body !== "string") throw new Error("Article text unavailable");
    return result;
  }
  function enhance(host, { id, excerpt, translation, options, english }) {
    const prose = globalThis.WLReaderProse;
    if (!prose) return;
    function draw(value, lang) {
      const language = lang || options.lang;
      if (language) host.lang = language;
      prose.renderInto(host, value, { ...options, lang: language, contents: true, english });
      host.classList.add("is-formatted");
    }
    draw(excerpt);
    const likelyClipped = mayBeClipped(excerpt, translation === undefined);
    const status = host.ownerDocument.createElement("div");
    status.className = "long-article-status";
    status.setAttribute("role","status");
    if (likelyClipped) host.before(status);
    async function readMore() {
      status.textContent = english ? "Loading the full article…" : "جارٍ تحميل النص الكامل…";
      try {
        const data = await load(id, translation);
        if (!host.isConnected) return;
        if (data.body.trim() !== excerpt.trim()) draw(data.body, data.lang);
        if (data.complete) status.remove();
        else {
          if (!status.isConnected) host.before(status);
          status.textContent = english ? "This article exceeds the current reading limit." : "يتجاوز هذا المقال الحد المتاح للعرض حاليًا.";
        }
      } catch {
        if (!host.isConnected || !likelyClipped) return;
        status.textContent = english ? "Showing the excerpt. " : "نعرض المقتطف الآن. ";
        const retry = host.ownerDocument.createElement("button");
        retry.type = "button";
        retry.textContent = english ? "Retry full article" : "أعد تحميل النص الكامل";
        retry.addEventListener("click", readMore, { once: true });
        status.append(retry);
      }
    }
    void readMore();
  }
  globalThis.WLPublicArticleBody = { load, enhance, mayBeClipped };
})();
