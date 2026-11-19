/* WRLDLINE — editorial review queue (internal, noindex) */
(() => {
  const host = document.getElementById("reviewList");
  const dataEl = document.getElementById("reviewDossiers");
  if (!host || !dataEl) return;
  const API = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const dossiers = JSON.parse(dataEl.textContent || "[]");
  const status = document.getElementById("reviewStatus");
  const empty = document.getElementById("reviewEmpty");
  const dossierSelect = document.getElementById("reviewDossier");
  const minSelect = document.getElementById("reviewMin");
  const refresh = document.getElementById("reviewRefresh");
  let rows = [];

  const esc = (v = "") => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cleanTitle = (title, source) => {
    let value = String(title || "").trim();
    const name = String(source || "").trim();
    if (!name) return value;
    const parts = value.split(/\s+[-–—]\s+/);
    const suffix = parts.length > 1 ? parts[parts.length - 1] : "";
    if (suffix && suffix.length <= 60 && suffix.includes(name)) {
      value = parts.slice(0, -1).join(" - ").trim();
    }
    return value || String(title || "").trim();
  };
  const safeURL = (value) => { try { const u = new URL(value, location.origin); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  const when = (value) => {
    const t = Date.parse(value || "");
    if (!Number.isFinite(t)) return "";
    const days = Math.round((Date.now() - t) / 86400000);
    if (days <= 0) return "اليوم";
    if (days === 1) return "أمس";
    if (days < 30) return `قبل ${days} يوماً`;
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium" }).format(new Date(t));
  };

  function render() {
    const min = Number(minSelect?.value || 2);
    const only = dossierSelect?.value || "all";
    const candidates = [];
    for (const article of rows) {
      if (!article || !article.title) continue;
      const hay = `${article.title} ${article.summary || ""}`.toLowerCase();
      const matches = dossiers
        .map((d) => ({ dossier: d, hits: (d.keywords || []).filter((k) => hay.includes(String(k).toLowerCase())).length }))
        .filter((m) => m.hits > 0 && (only === "all" || m.dossier.slug === only))
        .sort((a, b) => b.hits - a.hits);
      if (matches.length && matches[0].hits >= min) candidates.push({ article, matches });
    }
    candidates.sort((a, b) => (b.matches[0].hits - a.matches[0].hits) || (Date.parse(b.article.published_at || 0) - Date.parse(a.article.published_at || 0)));
    host.innerHTML = candidates.map(({ article, matches }) => {
      const id = String(article.id || "");
      const href = /^[0-9a-f-]{36}$/i.test(id) ? `/news/${encodeURIComponent(id)}` : safeURL(article.url || article.source_url || "");
      if (!href) return "";
      const tags = matches.slice(0, 3).map((m) => `<a href="/dossier/${encodeURIComponent(m.dossier.slug)}.html#watch">${esc(m.dossier.shortTitle)} · ${m.hits}</a>`).join("");
      return `<article class="card review-card">
        <div class="card-top"><span class="review-hits">${matches[0].hits} كلمات مطابقة</span><span class="muted">${esc(article.source_name || article.source || "المصدر غير متاح")} · ${esc(when(article.published_at))}</span></div>
        <h2><a href="${esc(href)}"${href.startsWith("/") ? "" : ' target="_blank" rel="noopener noreferrer"'}>${esc(cleanTitle(article.title, article.source_name || article.source))}</a></h2>
        <p>${esc(String(article.summary || "").slice(0, 240))}${String(article.summary || "").length > 240 ? "…" : ""}</p>
        <div class="card-foot"><span class="review-tags">${tags}</span><a href="/dossier/${encodeURIComponent(matches[0].dossier.slug)}.html#watch">راجع الملف ←</a></div>
      </article>`;
    }).join("");
    if (status) status.textContent = `${candidates.length} مرشحاً من ${rows.length} خبراً منشوراً`;
    if (empty) empty.hidden = candidates.length !== 0;
  }

  async function load() {
    if (status) status.textContent = "جارٍ تحميل الأخبار…";
    host.innerHTML = "";
    if (empty) empty.hidden = true;
    try {
      const response = await fetch(`${API}/rest/v1/rpc/public_home_news_recent_v2`, {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ p_limit: 80, p_before: new Date().toISOString(), p_since: null, p_offset: 0 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      rows = Array.isArray(data) ? data : [];
      render();
    } catch {
      if (status) status.textContent = "تعذر تحميل الأخبار الآن. أعد المحاولة عند توفر الاتصال.";
      host.innerHTML = "";
      if (empty) { empty.hidden = false; empty.textContent = "لم نتمكن من تحميل الأخبار. هذه الأداة لا تعمل دون اتصال."; }
    }
  }

  dossierSelect?.addEventListener("change", render);
  minSelect?.addEventListener("change", render);
  refresh?.addEventListener("click", load);
  load();
})();
