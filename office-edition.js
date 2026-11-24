/* First-party reader for the separate, CEO-gated AI Office publication feed. */
(() => {
  "use strict";
  const base = typeof window !== "undefined" && window.WRLDLINE_OFFICE_BASE || "/ai-office";
  const API = `${base}/api/public/articles`;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const topics = new Set(["سياسة", "اقتصاد", "متنوع"]);
  function https(value) {
    try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; }
    catch { return null; }
  }
  function parseArticle(article) {
    if (!article || article.demo !== false || article.status !== "published" || typeof article.id !== "string" || !UUID.test(article.id) ||
      !topics.has(article.topic) || typeof article.title !== "string" || !article.title.trim() ||
      typeof article.summary !== "string" || !Number.isFinite(Date.parse(article.publishedAt)) ||
      typeof article.eventDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(article.eventDate)) return null;
    const strings = v => Array.isArray(v) ? v.filter(x => typeof x === "string" && x.trim()).slice(0, 25) : [];
    const sources = Array.isArray(article.sources) ? article.sources.slice(0, 35)
      .filter(s => s && https(s.url) && typeof s.publisher === "string" && s.publisher.trim())
      .map(s => ({ url: https(s.url), title: String(s.title || "").slice(0, 300), publisher: s.publisher.slice(0, 110), publishedAt: s.publishedAt })) : [];
    const facts = strings(article.facts), body = strings(article.body);
    if (!facts.length || !body.length || new Set(sources.map(s => new URL(s.url).hostname)).size < 2) return null;
    const expectedCover = `/public/articles/${article.id}/cover`;
    return { id: article.id, title: article.title.slice(0, 200), summary: article.summary.slice(0, 1000),
      topic: article.topic, publishedAt: article.publishedAt, eventDate: article.eventDate, sources, facts, body,
      developing: strings(article.developing), author: String(article.author || "فريق التحرير").slice(0, 80),
      factChecker: String(article.factChecker || "غرفة التحرير").slice(0, 80), image: article.image === expectedCover ? `${base}/api${expectedCover}` : null };
  }
  const dateLabel = (value, timed) => Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", dateStyle: "medium", ...(timed ? { timeStyle: "short" } : {}) }).format(new Date(value)) : "";
  function element(tag, text, attrs = {}) {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value);
    return n;
  }
  const articlePath = id => `office-edition.html?id=${encodeURIComponent(id)}`;
  function card(a) {
    const item = element("li", "", { class: "oe-card" });
    const title = element("h2"); title.append(element("a", a.title, { href: articlePath(a.id) }));
    item.append(element("span", a.topic, { class: "oe-kicker" }), title, element("p", a.summary), element("time", dateLabel(a.publishedAt, true), { class: "oe-time", datetime: a.publishedAt }));
    return item;
  }
  function listSection(parent, heading, values, fallback) {
    parent.append(element("h2", heading));
    if (!values.length) { parent.append(element("p", fallback)); return; }
    const list = element("ul"); values.forEach(value => list.append(element("li", value))); parent.append(list);
  }
  function detail(a) {
    const article = element("article", "", { class: "oe-article" });
    document.title = `${a.title} | WRLDLINE NEWS`;
    article.append(element("span", a.topic, { class: "oe-kicker" }), element("h1", a.title),
      element("p", `تحرير: ${a.author} · تحقق: ${a.factChecker}`),
      element("time", `نُشر ${dateLabel(a.publishedAt, true)} بتوقيت الرياض`, { datetime: a.publishedAt, class: "oe-time" }),
      element("p", `تاريخ الحدث: ${dateLabel(a.eventDate)}`), element("hr"));
    if (a.image) {
      const figure = element("figure");
      figure.append(element("img", "", { src: a.image, alt: "رسم تحريري توضيحي", loading: "lazy" }), element("figcaption", "رسم تحريري توضيحي"));
      article.append(figure);
    }
    article.append(element("p", a.summary));
    listSection(article, "ما تأكد", a.facts, "");
    article.append(element("h2", "التفاصيل"), ...a.body.map(p => element("p", p)));
    listSection(article, "ما لا يزال قيد المتابعة", a.developing, "لا تفاصيل إضافية مؤكدة حتى الآن.");
    const sources = element("ul");
    a.sources.forEach(s => {
      const line = element("li"); const published = dateLabel(s.publishedAt);
      line.append(element("a", `${s.publisher}${s.title ? `: ${s.title}` : ""}`, { href: s.url, target: "_blank", rel: "noopener noreferrer" }));
      if (published) line.append(document.createTextNode(` · ${published}`));
      sources.append(line);
    });
    article.append(element("h2", "المصادر"), sources);
    return article;
  }
  async function get(path) {
    const res = await fetch(path, { credentials: "omit", headers: { accept: "application/json" }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) { const e = new Error("Feed unavailable"); e.status = res.status; throw e; }
    if (!res.headers.get("content-type")?.includes("application/json")) throw new Error("Unexpected feed response");
    return res.json();
  }
  function notice(node, message, retry) {
    const p = element("div", "", { class: "oe-notice", role: "status" }); p.append(element("p", message));
    if (retry) { const b = element("button", "إعادة المحاولة", { type: "button" }); b.addEventListener("click", retry); p.append(b); }
    node.replaceChildren(p);
  }
  async function load(node) {
    node.setAttribute("aria-busy", "true");
    const id = new URLSearchParams(location.search).get("id")?.toLowerCase() ?? null;
    try {
      if (id !== null && !UUID.test(id)) { notice(node, "رابط المادة غير صالح."); return; }
      const payload = await get(id ? `${API}/${id}` : API);
      if (!payload || payload.demo !== false) { notice(node, "نشرة المكتب غير مفعّلة على الموقع بعد."); return; }
      if (id) {
        const article = parseArticle(payload.article);
        if (!article || article.id !== id) { notice(node, "هذه المادة غير متاحة للنشر."); return; }
        node.replaceChildren(detail(article));
        if (base.startsWith("/") && !document.documentElement.dataset.officeArticleView) {
          document.documentElement.dataset.officeArticleView = id;
          void fetch(`${API}/${id}/view`, { method: "POST", credentials: "omit", keepalive: true }).catch(() => {});
        }
      } else {
        if (!Array.isArray(payload.articles)) throw new Error("Invalid feed");
        const articles = payload.articles.slice(0, 100).map(parseArticle).filter(Boolean);
        if (!articles.length) { notice(node, "لا توجد مواد معتمدة للنشر بعد."); return; }
        const list = element("ul", "", { class: "oe-list" }); articles.forEach(a => list.append(card(a))); node.replaceChildren(list);
      }
    } catch (e) {
      notice(node, id && e.status === 404 ? "المادة غير موجودة أو لم تُنشر." : e.status === 404 ? "نشرة المكتب غير مفعّلة على الموقع بعد." : "تعذّر تحميل النشرة الآن. يمكنك متابعة أخبار الموقع الرئيسية.", id && e.status === 404 ? undefined : () => load(node));
    } finally { node.setAttribute("aria-busy", "false"); }
  }
  if (typeof module !== "undefined") module.exports = { parseArticle, articlePath, https };
  if (typeof document !== "undefined") {
    const node = document.getElementById("office-edition-content");
    if (node) load(node);
  }
})();
