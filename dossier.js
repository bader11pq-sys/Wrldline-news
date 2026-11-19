/* WRLDLINE Live Event Dossier — progressive enhancement only.
   The page is fully readable without this file. */
(() => {
  "use strict";
  const API = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const FOLLOW_KEY = "wl_dossiers_followed_v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v = "") => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Theme */
  const root = document.documentElement;
  const storedTheme = (() => { try { return localStorage.getItem("wl_theme"); } catch { return ""; } })();
  if (storedTheme === "dark" || storedTheme === "light") root.dataset.theme = storedTheme;
  else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) root.dataset.theme = "dark";
  const themeButton = $("[data-dossier-theme]");
  function syncTheme() {
    if (!themeButton) return;
    const dark = root.dataset.theme === "dark";
    themeButton.textContent = dark ? "فاتح" : "داكن";
    themeButton.setAttribute("aria-label", dark ? "التبديل إلى المظهر الفاتح" : "التبديل إلى المظهر الداكن");
  }
  syncTheme();
  themeButton?.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("wl_theme", root.dataset.theme); } catch {}
    syncTheme();
  });

  /* Followed dossiers */
  function followed() {
    try { const v = JSON.parse(localStorage.getItem(FOLLOW_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
  }
  function saveFollowed(list) {
    try { localStorage.setItem(FOLLOW_KEY, JSON.stringify([...new Set(list)])); } catch {}
  }
  function syncFollowButtons() {
    const list = followed();
    $$("[data-follow]").forEach((btn) => {
      const on = list.includes(btn.dataset.follow);
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = on ? "متابَع ✓" : "متابعة الملف";
    });
    const followFilter = $("[data-filter-followed]");
    if (followFilter) {
      followFilter.hidden = list.length === 0;
      followFilter.textContent = `ملفاتي (${list.length})`;
    }
    $$("[data-dossier-card]").forEach((card) => {
      card.classList.toggle("is-followed", list.includes(card.dataset.dossierCard));
    });
  }
  $$("[data-follow]").forEach((btn) => btn.addEventListener("click", () => {
    const slug = btn.dataset.follow;
    const list = followed();
    const next = list.includes(slug) ? list.filter((x) => x !== slug) : [...list, slug];
    saveFollowed(next);
    syncFollowButtons();
    btn.setAttribute("aria-live", "polite");
  }));
  syncFollowButtons();

  /* Print + share */
  $$("[data-print]").forEach((btn) => btn.addEventListener("click", () => window.print()));
  $$("[data-share-dossier]").forEach((btn) => btn.addEventListener("click", async () => {
    const url = location.href.split("#")[0];
    const title = document.title.replace(/\s*\|\s*WRLDLINE\s*$/, "");
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      btn.textContent = "تم نسخ الرابط ✓";
      setTimeout(() => { btn.textContent = "مشاركة"; }, 2200);
    } catch {}
  }));

  /* Index filters */
  const cardsHost = $("#dossierCards");
  if (cardsHost) {
    const cards = $$("[data-dossier-card]", cardsHost);
    const status = { value: "all" };
    const sector = { value: "" };
    const followedOnly = { value: false };
    const empty = $("#dossierEmpty");
    const counter = $("#filterStatus");
    function apply() {
      let shown = 0;
      cards.forEach((card) => {
        const okStatus = status.value === "all" || card.dataset.status === status.value;
        const okSector = !sector.value || (card.dataset.sectors || "").split("|").includes(sector.value);
        const okFollow = !followedOnly.value || followed().includes(card.dataset.dossierCard);
        const ok = okStatus && okSector && okFollow;
        card.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
      if (counter) counter.textContent = `${shown} ${shown === 1 ? "ملف" : "ملفات"}`;
    }
    $$("[data-filter-status]").forEach((chip) => chip.addEventListener("click", () => {
      status.value = chip.dataset.filterStatus;
      $$("[data-filter-status]").forEach((c) => { c.classList.toggle("is-on", c === chip); c.setAttribute("aria-pressed", String(c === chip)); });
      apply();
    }));
    $$("[data-filter-sector]").forEach((chip) => chip.addEventListener("click", () => {
      sector.value = sector.value === chip.dataset.filterSector ? "" : chip.dataset.filterSector;
      $$("[data-filter-sector]").forEach((c) => { c.classList.toggle("is-on", c.dataset.filterSector === sector.value); c.setAttribute("aria-pressed", String(c.dataset.filterSector === sector.value)); });
      apply();
    }));
    const followChip = $("[data-filter-followed]");
    followChip?.addEventListener("click", () => {
      followedOnly.value = !followedOnly.value;
      followChip.classList.toggle("is-on", followedOnly.value);
      followChip.setAttribute("aria-pressed", String(followedOnly.value));
      apply();
    });
    apply();
  }

  /* Related live articles: conservative keyword match, never invented relevance */
  const relatedHost = $("#relatedGrid");
  if (relatedHost) {
    const keywords = ($("#related")?.dataset.keywords || "").split("|").map((k) => k.trim()).filter(Boolean);
    const statusEl = $("#relatedStatus");
    const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };
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
    (async () => {
      if (!keywords.length) { setStatus("لا كلمات ربط محددة لهذا الملف."); return; }
      try {
        const res = await fetch(`${API}/rest/v1/rpc/public_home_news_recent_v2`, {
          method: "POST",
          headers: { apikey: KEY, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ p_limit: 80, p_before: new Date().toISOString(), p_since: null, p_offset: 0 }),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const rows = await res.json();
        const list = (Array.isArray(rows) ? rows : []).filter((a) => {
          if (!a || !a.title) return false;
          const hay = `${a.title} ${a.summary || ""}`.toLowerCase();
          return keywords.some((k) => hay.includes(k.toLowerCase()));
        }).slice(0, 6);
        if (!list.length) {
          setStatus("لا توجد أخبار منشورة تطابق كلمات هذا الملف الآن.");
          relatedHost.innerHTML = '<p class="related-empty">سيظهر هنا أي خبر منشور يطابق كلمات الملف. لا نعرض خبراً غير مرتبط لمجرد ملء المكان.</p>';
          return;
        }
        setStatus(`${list.length} ${list.length === 1 ? "خبر مرتبط" : "أخبار مرتبطة"} من آخر 80 خبراً منشوراً`);
        relatedHost.innerHTML = list.map((a) => {
          const id = String(a.id || "");
          const href = /^[0-9a-f-]{36}$/i.test(id) ? `/news/${encodeURIComponent(id)}` : safeURL(a.url || a.source_url || "");
          if (!href) return "";
          const source = esc(a.source_name || a.source || "المصدر غير متاح");
          const title = esc(a.title);
          return `<article class="related-card"><small>${source}</small><a href="${esc(href)}"${href.startsWith("/") ? "" : ' target="_blank" rel="noopener noreferrer"'}>${title}</a><time>${esc(when(a.published_at))}</time></article>`;
        }).join("") || '<p class="related-empty">لم نجد روابط صالحة.</p>';
      } catch {
        setStatus("تعذر تحميل الأخبار المرتبطة الآن.");
        relatedHost.innerHTML = '<p class="related-empty">الملف مقروء بالكامل دون هذا القسم. أعد المحاولة عند توفر الاتصال.</p>';
      }
    })();
  }
})();
