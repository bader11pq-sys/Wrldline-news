/* WRLDLINE editorial publications: safe DOM rendering only */
(() => {
  "use strict";
  const API = "https://vmaxbnogmmfyrcucapnq.supabase.co/rest/v1/editorial_publications";
  const KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const $ = (s, root = document) => root.querySelector(s);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = String(text); if (cls) n.className = cls; return n; };
  const safeUrl = (value) => { try { const u = new URL(String(value || ""), location.origin); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  async function fetchRows(section, limit) {
    const q = new URLSearchParams({ select:"section,slug,title,content,sources,published_at,updated_at", section:"eq."+section, status:"eq.published", order:"published_at.desc", limit:String(limit) });
    const r = await fetch(API + "?" + q.toString(), { headers:{ apikey:KEY, Accept:"application/json" }, cache:"no-store", signal:AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error("Editorial feed HTTP " + r.status);
    return await r.json();
  }
  function sourcesList(items) {
    const out = [];
    (Array.isArray(items) ? items : []).forEach(s => {
      const title = Array.isArray(s) ? s[0] : (s.title || s.publisher || "مصدر");
      const url = safeUrl(Array.isArray(s) ? s[1] : (s.url || s.source_url));
      if (url) out.push({ title, url });
    });
    return out;
  }
  function addSources(parent, rows) {
    const sources = sourcesList(rows);
    if (!sources.length) return;
    const box = el("section", null, "editorial-sources");
    box.appendChild(el("h4", "المصادر والمراجع"));
    const ul = el("ul");
    sources.forEach(s => { const li = el("li"); const a = el("a", s.title); a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer"; li.appendChild(a); ul.appendChild(li); });
    box.appendChild(ul); parent.appendChild(box);
  }
  function addList(parent, title, items, value) {
    if (!Array.isArray(items) || !items.length) return;
    const section = el("section"); section.appendChild(el("h4", title));
    const ul = el("ul");
    items.forEach(x => { const li = el("li", value(x)); ul.appendChild(li); });
    section.appendChild(ul); parent.appendChild(section);
  }
  function detailBody(content, sourceRows) {
    const body = el("div", null, "editorial-dossier-body");
    addList(body, "حقائق أساسية", content.facts, x => (x.label ? x.label + ": " : "") + (x.value || ""));
    if (Array.isArray(content.parties) && content.parties.length) {
      const section = el("section"); section.appendChild(el("h4", "الأطراف ومصالحها"));
      content.parties.forEach(x => {
        section.appendChild(el("h5", x.name || "طرف"));
        section.appendChild(el("p", x.role || ""));
      });
      body.appendChild(section);
    }
    if (Array.isArray(content.timeline) && content.timeline.length) {
      const section = el("section"); section.appendChild(el("h4", "الخط الزمني"));
      const ol = el("ol");
      content.timeline.forEach(x => {
        const li = el("li");
        const time = el("strong", x.at || x.dateLabel || "وقت غير محدد"); li.appendChild(time);
        li.appendChild(document.createTextNode(" " + (x.text || "")));
        if (x.reportedAt) li.appendChild(el("small", " · وقت نشر المعلومة: " + x.reportedAt));
        if (x.verification) li.appendChild(el("small", " · " + x.verification));
        ol.appendChild(li);
      });
      section.appendChild(ol); body.appendChild(section);
    }
    const narratives = content.narratives || {};
    addList(body, "ما تتفق عليه المصادر", narratives.agreements, x => x.text || x);
    addList(body, "مواضع الاختلاف", narratives.differences, x => x.text || x);
    addList(body, "ما لم يتحقق", narratives.unverified, x => x.text || x);
    if (Array.isArray(content.context) && content.context.length) {
      const section = el("section"); section.appendChild(el("h4", "السياق"));
      content.context.forEach(x => { section.appendChild(el("h5", x.heading || "")); addList(section, "", x.paragraphs, y => y); });
      body.appendChild(section);
    }
    addList(body, "الأثر الفعلي", content.impact?.actual, x => x.text || x);
    addList(body, "الأثر المحتمل المشروط", content.impact?.potential, x => x.text || x);
    if (Array.isArray(content.scenarios) && content.scenarios.length) {
      const section = el("section", null, "editorial-scenarios");
      section.appendChild(el("h4", "السيناريوهات المحتملة"));
      content.scenarios.forEach(x => {
        const card = el("article", null, "editorial-scenario");
        card.appendChild(el("h5", x.title || "مسار محتمل"));
        if (x.conditions) { card.appendChild(el("strong", "شروط تحقق المسار")); card.appendChild(el("p", x.conditions)); }
        if (x.consequences) { card.appendChild(el("strong", "النتائج المحتملة")); card.appendChild(el("p", x.consequences)); }
        section.appendChild(card);
      });
      body.appendChild(section);
    }
    if (Array.isArray(content.watchNext) && content.watchNext.length) {
      const section = el("section"); section.appendChild(el("h4", "ماذا نراقب تالياً؟"));
      const ul = el("ul");
      content.watchNext.forEach(x => {
        const li = el("li"); li.appendChild(el("strong", x.what || ""));
        li.appendChild(document.createTextNode(" — " + (x.why || "")));
        if (x.when) li.appendChild(el("small", " · " + x.when));
        ul.appendChild(li);
      });
      section.appendChild(ul); body.appendChild(section);
    }
    addList(body, "سجل التحديثات", content.updates, x => (x.at ? x.at + " — " : "") + (x.text || x));
    addSources(body, sourceRows || content.sources);
    return body;
  }
  function cardStatus(content) {
    const status = content.status || "monitoring";
    return status === "active" ? "نشط" : status === "closed" ? "مغلق" : "قيد المراقبة";
  }
  function mountDossiers(rows) {
    const grid = $(".index-body .cards");
    const homeGrid = $("#dossierStripGrid");
    rows.forEach(row => {
      const content = row.content || {}, key = row.slug;
      if (!key) return;
      const existing = Array.from(document.querySelectorAll("[data-dossier-card]")).find(n => n.dataset.dossierCard === key);
      const details = el("details", null, "editorial-live-update");
      const linkedSources = row.sources || content.sources;
      details.appendChild(el("summary", "آخر تحديث تحريري موثق · " + new Date(row.updated_at || row.published_at).toLocaleDateString("ar-SA-u-ca-gregory")));
      details.appendChild(detailBody(content, linkedSources));
      if (existing) {
        const old = $(".editorial-live-update", existing); if (old) old.remove();
        existing.appendChild(details);
        const p = $("p", existing); if (p && content.summary) p.textContent = content.summary;
        return;
      }
      if (grid) {
        const card = el("article", null, "card editorial-dynamic-card");
        card.dataset.dossierCard = key; card.dataset.status = content.status || "active";
        card.dataset.sourceCount = String(Array.isArray(linkedSources) ? linkedSources.length : 0);
        card.dataset.sectors = Array.isArray(content.sectors) ? content.sectors.join("|") : "";
        card.dataset.search = [row.title, content.summary, (content.keywords || []).join(" ")].join(" ");
        card.appendChild(el("div", cardStatus(content) + " · " + new Date(row.updated_at || row.published_at).toLocaleDateString("ar-SA-u-ca-gregory"), "card-top"));
        card.appendChild(el("h2", row.title)); card.appendChild(el("p", content.summary || ""));
        card.appendChild(details); grid.prepend(card);
      }
      if (homeGrid && !Array.from(homeGrid.querySelectorAll("a")).some(a => a.href.includes(key))) {
        const a = el("a", null, "dossier-strip-card"); a.href = "/dossier/";
        a.appendChild(el("strong", row.title)); a.appendChild(el("span", content.summary || "ملف حدث محدث بمصادر موثقة")); homeGrid.prepend(a);
      }
    });
    if (grid && rows.length) document.dispatchEvent(new Event("wrldline:dossiers-updated"));
  }
  function mountWatchlist(rows) {
    const row = rows[0], content = row && row.content;
    const intro = $(".index-body .suite-intro");
    if (!content || !Array.isArray(content.items) || !intro || $(".editorial-weekly-panel")) return;
    const panel = el("section", null, "editorial-weekly-panel");
    panel.appendChild(el("p", "WRLDLINE WEEKLY WATCH", "kicker"));
    panel.appendChild(el("h2", row.title || "ما نراقبه هذا الأسبوع"));
    panel.appendChild(el("p", content.executive_summary || "", "lead"));
    panel.appendChild(el("p", "الفترة: " + (content.period || "") + " · تحديث " + new Date(row.updated_at || row.published_at).toLocaleString("ar-SA-u-ca-gregory"), "muted"));
    const cards = el("div", null, "cards editorial-watch-cards");
    content.items.forEach(item => {
      const card = el("article", null, "card");
      card.appendChild(el("div", (item.sector || "متابعة") + " · " + (item.when || item.timing || ""), "card-top"));
      card.appendChild(el("h3", item.what || "")); card.appendChild(el("p", item.why || ""));
      if (item.signal) card.appendChild(el("p", "الإشارة التي نراقبها: " + item.signal));
      if (item.dossierSlug) { const a = el("a", "الملف المرتبط ←"); a.href = "/dossier/"; card.appendChild(a); }
      cards.appendChild(card);
    });
    panel.appendChild(cards);
    if (content.regional_outlook) { panel.appendChild(el("h3", "قراءة إقليمية")); panel.appendChild(el("p", content.regional_outlook)); }
    if (content.risks) panel.appendChild(el("p", content.risks));
    addSources(panel, row.sources || content.sources);
    intro.after(panel);
  }
  async function init() {
    const path = location.pathname;
    try {
      if (path.endsWith("/watchlist.html")) mountWatchlist(await fetchRows("watchlist", 1));
      else if (path === "/dossier/" || path === "/dossier/index.html") mountDossiers(await fetchRows("dossier", 12));
      else if ($("#dossierStripGrid")) mountDossiers(await fetchRows("dossier", 8));
    } catch (e) { console.warn("WRLDLINE editorial publications:", e); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
