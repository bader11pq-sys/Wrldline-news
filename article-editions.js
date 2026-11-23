/* A language edition is stored editorial text, never a request to translate text. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WLArticleEditions = api;
})(globalThis, function () {
  "use strict";
  const languages = { ar: { name: "العربية", dir: "rtl" }, en: { name: "English", dir: "ltr" } };
  const preference = "wrldline:language";
  const origin = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const apiKey = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  const copy = {
    ar: { group: "لغة المقال", original: "النص الأصلي", reviewed: "نسخة تحريرية مراجعة", loading: "جارٍ تحميل النسخة المنشورة…", missing: "لا توجد نسخة تحريرية منشورة بهذه اللغة. نعرض النص الأصلي.", failed: "تعذّر تحميل النسخة. اضغط على اللغة مرة أخرى للمحاولة.", retry: "أعد تحميل النص الكامل" },
    en: { group: "Article language", original: "Original text", reviewed: "Reviewed editorial edition", loading: "Loading the published edition…", missing: "No editorial edition is published in this language. The original is shown.", failed: "The edition could not load. Select the language again to retry.", retry: "Retry full article" }
  };
  const locale = value => {
    const code = String(value || "").toLowerCase().split("-")[0];
    return Object.hasOwn(languages, code) ? code : "";
  };
  const originalLanguage = (value, title) => {
    const code = String(value || "").trim().toLowerCase();
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) && !["und", "mul", "unknown"].includes(code)
      ? code : (/\p{Script=Arabic}/u.test(title || "") ? "ar" : "en");
  };
  const direction = lang => /^(ar|fa|he|ur|ps|sd)(-|$)/i.test(lang) ? "rtl" : "ltr";
  // The public trust RPC only projects published translations with a human reviewer and note.
  const reviewed = row => row?.translation_source === "editorial"
    && typeof row.reviewed_at === "string" && Number.isFinite(Date.parse(row.reviewed_at)) && Date.parse(row.reviewed_at) <= Date.now()
    && !!row.title?.trim() && !!row.summary?.trim();
  function stored() { try { return locale(localStorage.getItem(preference)); } catch { return ""; } }
  function remember(lang) { try { localStorage.setItem(preference, lang); } catch {} }
  function link(value, lang) {
    const url = new URL(value);
    if (locale(lang)) url.hash = "lang=" + locale(lang);
    return url.href;
  }
  function requested(value) {
    const url = new URL(value);
    return locale(url.searchParams.get("lang")) || locale(new URLSearchParams(url.hash.slice(1)).get("lang"));
  }
  async function load(id, lang, signal, fetcher = globalThis.fetch) {
    if (!uuid.test(id) || !locale(lang) || locale(lang) !== lang) throw new Error("Invalid edition");
    const url = new URL("/rest/v1/rpc/get_public_article_trust", origin);
    const response = await fetcher(url, {
      method: "POST", headers: { apikey: apiKey, "Content-Type": "application/json" }, cache: "no-store", signal,
      body: JSON.stringify({ p_article_id: id, p_lang: lang })
    });
    if (!response.ok) throw new Error("Edition unavailable");
    const article = await response.json();
    if (article && article.id !== id) throw new Error("Invalid edition response");
    const row = article?.reviewed_translation;
    if (!row || row.lang !== lang || !reviewed(row)) return null;
    if (row.summary.length > 1000000) throw new Error("Edition exceeds the reading limit");
    return { lang, title: row.title, body: row.summary, complete: true, editorialEdition: true };
  }
  function mount({ host, lead, tools, heading, id, title, body, lang, uiLang, preferred, editorial, published = true,
    clip = false, onView, onSelect, signal: parentSignal }) {
    const doc = host.ownerDocument, source = { lang: originalLanguage(lang, title), title, body, complete: false };
    const sourceKey = locale(source.lang) || "original";
    const tasks = new Map(), ready = new Map(), abort = new AbortController();
    if (parentSignal?.aborted) abort.abort();
    else parentSignal?.addEventListener("abort", () => abort.abort(), { once: true });
    let current = source, chosen = sourceKey, ui = locale(uiLang) || "ar", paintedBody;
    let sourceComplete = false;
    const group = doc.createElement("div"), status = doc.createElement("p");
    group.className = "article-editions";
    group.dataset.languageManaged = "";
    group.setAttribute("role", "group");
    status.className = "article-edition-status";
    status.setAttribute("role", "status");
    status.dataset.languageManaged = "";
    const buttons = new Map();
    for (const key of [...Object.keys(languages), ...(sourceKey === "original" ? ["original"] : [])]) {
      const button = doc.createElement("button");
      button.type = "button";
      if (languages[key]) button.lang = key;
      button.addEventListener("click", () => {
        if (languages[key]) onSelect?.(key);
        void show(key);
      });
      buttons.set(key, button);
      group.append(button);
    }
    tools.append(group, status);
    function pending(key) {
      if (tasks.has(key)) return tasks.get(key);
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]);
      const request = (key === sourceKey
        ? Promise.resolve(globalThis.WLPublicArticleBody?.load(id, null, signal)).then(result => {
          if (result && result.body?.trim()) {
            source.body = result.body;
            source.complete = result.complete;
            sourceComplete = result.complete;
          }
          return source;
        })
        : load(id, key, signal)).then(result => { ready.set(key, result); return result; });
      tasks.set(key, request);
      void request.catch(() => { if (tasks.get(key) === request) tasks.delete(key); });
      return request;
    }
    function labels() {
      group.setAttribute("aria-label", copy[ui].group);
      for (const [key, button] of buttons) {
        button.textContent = languages[key]?.name || copy[ui].original;
        button.setAttribute("aria-pressed", String((locale(current.lang) || "original") === key));
      }
    }
    function draw(version) {
      if (current === version && paintedBody === version.body) return;
      current = version;
      paintedBody = version.body;
      heading.textContent = version.title;
      heading.lang = host.lang = version.lang;
      heading.dir = host.dir = direction(version.lang);
      heading.dataset.languageManaged = "";
      host.dataset.languageManaged = "";
      if (globalThis.WLReaderProse) {
        const prose = globalThis.WLReaderProse;
        const copy = lead ? prose.splitLead(version.body) : { details: version.body };
        const options = { lang: version.lang, editorial, contents: true, english: ui === "en", headingLevel: lead ? 3 : 2 };
        if (lead) {
          lead.lang = version.lang;
          lead.dir = host.dir;
          prose.renderInto(lead, copy.lead, { ...options, contents: false });
        }
        prose.renderInto(host, copy.details, options);
        host.classList.add("is-formatted");
      } else (lead || host).textContent = version.body;
      labels();
      onView?.(version, ui);
    }
    async function show(key) {
      if (!buttons.has(key) || abort.signal.aborted) return;
      chosen = key;
      status.replaceChildren();
      if (key === sourceKey) draw(source);
      if (!published || !uuid.test(id)) return;
      if (key !== sourceKey) {
        status.textContent = copy[ui].loading;
      } else if (clip && !sourceComplete) status.textContent = copy[ui].loading;
      try {
        const result = ready.has(key) ? ready.get(key) : await pending(key);
        if (abort.signal.aborted || !host.isConnected || chosen !== key) return;
        if (result) {
          draw(result);
          status.textContent = result.editorialEdition ? copy[ui].reviewed : (clip && !sourceComplete ? copy[ui].original : "");
        } else {
          draw(source);
          status.textContent = copy[ui].missing;
          void pending(sourceKey).then(() => {
            if (!abort.signal.aborted && host.isConnected && chosen === key) draw(source);
          }).catch(() => {});
        }
      } catch {
        if (abort.signal.aborted || !host.isConnected || chosen !== key) return;
        if (key !== sourceKey) status.textContent = copy[ui].failed;
        else if (clip) {
          status.textContent = copy[ui].original + " ";
          const retry = doc.createElement("button");
          retry.type = "button";
          retry.textContent = copy[ui].retry;
          retry.addEventListener("click", () => void show(sourceKey), { once: true });
          status.append(retry);
        }
      }
    }
    draw(source);
    if (published && uuid.test(id)) {
      for (const key of buttons.keys()) void pending(key).catch(() => {});
      void show(buttons.has(preferred) ? preferred : sourceKey);
    }
    return {
      stop: () => abort.abort(),
      setUI: lang => { ui = locale(lang) || "ar"; labels(); },
      show
    };
  }
  return { languages, locale, originalLanguage, direction, reviewed, stored, remember, requested, link, load, mount };
});
