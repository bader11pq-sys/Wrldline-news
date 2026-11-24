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
    const status = { value: "all" };
    const sector = { value: "" };
    const followedOnly = { value: false };
    const query = { value: "" };
    const search = $("#dossierSearch");
    const searchStatus = $("#searchStatus");
    const empty = $("#dossierEmpty");
    const counter = $("#filterStatus");
    function apply() {
      let shown = 0;
      $("[data-dossier-card]", cardsHost).forEach((card) => {
        const okStatus = status.value === "all" || card.dataset.status === status.value;
        const okSector = !sector.value || (card.dataset.sectors || "").split("|").includes(sector.value);
        const okFollow = !followedOnly.value || followed().includes(card.dataset.dossierCard);
        const hay = (card.dataset.search || "").toLowerCase();
        const okQuery = !query.value || hay.includes(query.value);
        const ok = okStatus && okSector && okFollow && okQuery;
        card.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
      if (counter) counter.textContent = `${shown} ${shown === 1 ? "ملف" : "ملفات"}`;
      if (searchStatus) searchStatus.textContent = query.value ? `${shown} نتيجة` : "";
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
    search?.addEventListener("input", () => {
      query.value = search.value.trim().toLowerCase();
      apply();
    });
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
  const schedule = $("[data-dossier-schedule]");
  if (schedule && new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Riyadh" }).format(new Date()) > schedule.dateTime) {
    $("[data-schedule-label]").textContent = "مرّ تاريخ الموعد المعلن؛ ليس تأكيداً للنتيجة: ";
  }

  const relatedHost = $("#relatedGrid");
  if (relatedHost) {
    const slug = $("#related")?.dataset.dossierSlug;
    const desk = window.WLEventDesk;
    const catalog = desk?.fromPage(document) || [];
    const statusEl = $("#relatedStatus");
    const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };
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
      if (!catalog.some(d => d.slug === slug)) return;
      setStatus("جارٍ البحث عن تغطية حديثة لهذا الحدث…");
      try {
        const res = await fetch(`${API}/rest/v1/rpc/public_home_news_recent_v3`, {
          method: "POST",
          headers: { apikey: KEY, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ p_limit: 48, p_before: new Date().toISOString(), p_since: null, p_offset: 0, p_newsdata_only: false }),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const rows = await res.json();
        const titles = new Set();
        const list = (Array.isArray(rows) ? rows : []).filter(a => {
          const title = desk.normalize(a?.title);
          if (!title || titles.has(title) || !/^[0-9a-f-]{36}$/i.test(a?.id) || desk.match(a,catalog)?.slug !== slug) return false;
          titles.add(title);
          return true;
        }).slice(0, 6);
        if (!list.length) {
          setStatus("لا توجد تغطية حديثة مطابقة لهذا الحدث في آخر الأخبار. المصادر الموثقة أعلاه متاحة دائماً.");
          return;
        }
        setStatus("أحدث الأخبار المرتبطة بهذا الحدث");
        relatedHost.innerHTML = list.map((a) => {
          const href = `/news/${encodeURIComponent(a.id)}`;
          const source = esc(a.source_name || a.source || "المصدر غير متاح");
          const title = esc(a.title);
          return `<article class="related-card"><small>${esc(desk.label(desk.kind(a),"ar"))} · ${source}</small><a href="${esc(href)}" dir="auto">${title}</a><time>${esc(when(a.published_at))}</time></article>`;
        }).join("") || '<p class="related-empty">لم نجد روابط صالحة.</p>';
      } catch {
        setStatus("تعذر تحميل الأخبار المرتبطة الآن.");
      }
    })();
  }
})();

/* Dossier intelligence suite filters */
(() => {
  const suite = document.querySelector("[data-suite]");
  if (!suite) return;
  const items = [...suite.querySelectorAll("[data-suite-item]")];
  const state = { type: "all", timing: "all", dossier: "all" };
  const groups = [
    { key: "type", selector: "[data-suite-type]", data: "suiteType" },
    { key: "timing", selector: "[data-suite-timing]", data: "suiteTiming" },
    { key: "dossier", selector: "[data-suite-dossier]", data: "suiteDossier" },
  ];
  for (const group of groups) {
    const buttons = [...suite.querySelectorAll(group.selector)];
    if (!buttons.length) continue;
    const requested = new URLSearchParams(location.search).get(group.key === "dossier" ? "dossier" : group.key);
    if (requested && buttons.some((b) => b.dataset[group.data] === requested)) state[group.key] = requested;
    const setActive = (value) => {
      for (const b of buttons) {
        const on = b.dataset[group.data] === value;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
    };
    setActive(state[group.key]);
    for (const b of buttons) {
      b.addEventListener("click", () => {
        state[group.key] = b.dataset[group.data];
        setActive(state[group.key]);
        apply();
      });
    }
  }
  const count = suite.querySelector("[data-suite-count]");
  const empty = suite.querySelector("[data-suite-empty]");
  const unit = suite.dataset.suiteUnit || "عنصر";
  function apply() {
    let shown = 0;
    for (const el of items) {
      const ok = (state.type === "all" || el.dataset.type === state.type)
        && (state.timing === "all" || el.dataset.timing === state.timing)
        && (state.dossier === "all" || el.dataset.dossier === state.dossier);
      el.hidden = !ok;
      if (ok) shown += 1;
    }
    if (count) count.textContent = `${shown} ${unit}`;
    if (empty) empty.hidden = shown !== 0;
  }
  apply();
})();
