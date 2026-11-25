/* WRLDLINE — personalised feed page. Anonymous visitors get the public feed ranked by
   locally stored follows; signed-in readers sync follows, saved articles and (opt-in)
   reading history through the existing Supabase tables. */
(() => {
  "use strict";
  const P = window.WLProduct, F = window.WLFeed, E = window.WLEditorial, TAX = window.WRLDLINE_TAXONOMY;
  const { h } = P;
  const lang = P.currentLang();
  const storage = P.safeStorage();

  const L = {
    ar: {
      title: "صفحتك الشخصية", lead: "أخبار مرتبة وفق ما تتابعه. تفسّر لك كل بطاقة سبب ظهورها، وتستطيع تعطيل أي إشارة أو مسح ما يُحفظ في أي وقت.",
      tabFeed: "لك", tabSaved: "المحفوظات", tabHistory: "سجل القراءة", tabFollows: "ما أتابعه",
      anon: "أنت تتصفح كزائر. متابعاتك محفوظة على هذا الجهاز فقط.", signIn: "سجّل الدخول لمزامنتها بين أجهزتك",
      signedIn: "مزامنة الحساب مفعلة", loading: "جارٍ تحميل الأخبار…", failed: "تعذر تحميل الأخبار الآن. حاول لاحقاً.", retry: "إعادة المحاولة",
      empty: "لا توجد أخبار مطابقة لهذه المرشحات.", emptyFollows: "لم تتابع شيئاً بعد، لذلك ترى أحدث الأخبار العامة. أضف أقساماً أو دولاً أو موضوعات من تبويب ما أتابعه.",
      categories: "الأقسام", countries: "الدول", topics: "الموضوعات", interests: "اهتمامات مخصصة", addInterest: "أضف كلمة اهتمام", add: "إضافة",
      addCountry: "أضف دولة", chooseCountry: "اختر دولة", interestHint: "كلمة أو عبارة قصيرة (حتى 40 حرفاً) تُطابق عنوان الخبر وملخصه.",
      filters: "المرشحات", sort: "الترتيب", sortRelevance: "الأكثر صلة", sortNewest: "الأحدث", sortOldest: "الأقدم",
      category: "القسم", country: "الدولة", topic: "الموضوع", range: "الفترة", language: "لغة الخبر", trust: "حالة التحقق", all: "الكل",
      r24: "آخر 24 ساعة", r7: "آخر 7 أيام", r30: "آخر 30 يوماً", search: "بحث", followedOnly: "ما أتابعه فقط", unreadOnly: "غير المقروء فقط",
      trustConfirmed: "مؤكد", trustUnconfirmed: "غير مؤكد", trustDisputed: "متنازع عليه", langAr: "العربية", langEn: "English",
      save: "حفظ", saved: "محفوظ", unsave: "إزالة من المحفوظات", open: "فتح الخبر", why: "لماذا يظهر لك هذا؟", breaking: "عاجل", exploration: "اكتشاف: خارج متابعاتك",
      originalLang: "نص المصدر بالعربية", originalLangEn: "نص المصدر بالإنجليزية", noTranslationNote: "لا توجد ترجمة تحريرية منشورة؛ يُعرض نص المصدر.",
      privacy: "الخصوصية", remember: "تذكّر ما أقرؤه واستخدمه في ترتيب الأخبار",
      rememberHelp: "يُحفظ قسم الخبر ودولته ومصدره ووقت القراءة فقط. لا نحفظ نص البحث أو مدة التصفح. عند الإيقاف يُمسح السجل فوراً.",
      clear: "مسح سجل القراءة", cleared: "تم مسح سجل القراءة", rememberOff: "سجل القراءة متوقف. فعّل الخيار في ما أتابعه لحفظ ما تقرؤه.",
      emptySaved: "لا توجد محفوظات.", emptyHistory: "لا يوجد سجل قراءة.", remove: "إزالة", followed: "تتابعه", follow: "تابع",
      syncError: "تعذر حفظ التغيير على الحساب.", limit: "بلغت الحد الأقصى للمتابعات.", shown: "المعروض", of: "من", updated: "آخر تحديث للبيانات",
      localOnly: "محفوظ على هذا الجهاز", merged: "تمت مزامنة متابعاتك المحلية مع حسابك.", remaining: "تم تحميل المزيد", more: "عرض المزيد"
    },
    en: {
      title: "Your personal feed", lead: "News ranked by what you follow. Every card explains why it appears, and you can switch off any signal or erase what is stored at any time.",
      tabFeed: "For you", tabSaved: "Saved", tabHistory: "Reading history", tabFollows: "Following",
      anon: "You are browsing as a guest. Your follows are stored on this device only.", signIn: "Sign in to sync them across devices",
      signedIn: "Account sync is on", loading: "Loading news…", failed: "Could not load the news right now. Please try again.", retry: "Retry",
      empty: "No stories match these filters.", emptyFollows: "You are not following anything yet, so you see the latest public news. Add categories, countries or topics in the Following tab.",
      categories: "Categories", countries: "Countries", topics: "Topics", interests: "Custom interests", addInterest: "Add an interest keyword", add: "Add",
      addCountry: "Add a country", chooseCountry: "Choose a country", interestHint: "A short word or phrase (up to 40 characters) matched against headlines and summaries.",
      filters: "Filters", sort: "Sort", sortRelevance: "Most relevant", sortNewest: "Newest", sortOldest: "Oldest",
      category: "Category", country: "Country", topic: "Topic", range: "Period", language: "Story language", trust: "Verification", all: "All",
      r24: "Last 24 hours", r7: "Last 7 days", r30: "Last 30 days", search: "Search", followedOnly: "Followed only", unreadOnly: "Unread only",
      trustConfirmed: "Confirmed", trustUnconfirmed: "Unconfirmed", trustDisputed: "Disputed", langAr: "Arabic", langEn: "English",
      save: "Save", saved: "Saved", unsave: "Remove from saved", open: "Open story", why: "Why am I seeing this?", breaking: "Breaking", exploration: "Discovery: outside your follows",
      originalLang: "Source text in Arabic", originalLangEn: "Source text in English", noTranslationNote: "No published editorial translation; the source text is shown.",
      privacy: "Privacy", remember: "Remember what I read and use it to rank news",
      rememberHelp: "Only the story's category, country, source and read time are kept. Search text and time spent are never stored. Turning this off erases the history immediately.",
      clear: "Clear reading history", cleared: "Reading history cleared", rememberOff: "Reading history is off. Enable it in Following to record what you read.",
      emptySaved: "Nothing saved yet.", emptyHistory: "No reading history yet.", remove: "Remove", followed: "Following", follow: "Follow",
      syncError: "Could not save the change to your account.", limit: "You reached the follow limit.", shown: "Showing", of: "of", updated: "Data updated",
      localOnly: "Stored on this device", merged: "Your local follows were synced to your account.", remaining: "More loaded", more: "Show more"
    }
  };
  const t = P.pick(L, lang);
  const catName = (key) => TAX.categoryName(key, lang);
  const countryName = (iso3) => E.countryName(iso3, lang) || iso3;
  const names = { category: catName, country: countryName };

  const state = {
    client: null, user: null, follows: F.emptyFollows(), remember: false,
    history: [], readIds: new Set(), savedIds: new Set(),
    articles: [], byId: new Map(), updated: null, loadError: false,
    tab: "feed", visible: 24,
    filters: { sort: "relevance", category: "all", country: "all", topic: "all", range: "all", lang: "all", trust: "all", query: "", followedOnly: false, unreadOnly: false }
  };
  const $ = (id) => document.getElementById(id);
  const live = (text) => { const el = $("feedLive"); if (el) el.textContent = text; };

  /* ---------- persistence ---------- */
  const readSavedLocal = () => { try { return new Set(JSON.parse(storage.getItem("wrldline:saved") || "[]")); } catch { return new Set(); } };
  const writeSavedLocal = () => { try { storage.setItem("wrldline:saved", JSON.stringify([...state.savedIds])); } catch {} };
  const writeFollowsLocal = () => { try { storage.setItem(F.KEYS.follows, JSON.stringify(state.follows)); } catch {} };
  const writeHistoryLocal = () => { try { storage.setItem(F.KEYS.history, JSON.stringify(state.history)); } catch {} };

  async function loadAccount() {
    state.client = P.getClient();
    if (!state.client) return;
    const { data } = await state.client.auth.getSession();
    state.user = data.session ? data.session.user : null;
    if (!state.user) return;
    const uid = state.user.id;
    const [follows, prefs, saved] = await Promise.all([
      state.client.from("user_follows").select("target_type,target_value").eq("user_id", uid),
      state.client.from("user_preferences").select("personalize_from_history").eq("user_id", uid).maybeSingle(),
      state.client.from("user_saved_articles").select("article_id").eq("user_id", uid)
    ]);
    if (!follows.error) {
      const remote = F.parseFollows(follows.data);
      const local = F.loadLocalFollows(storage);
      if (F.followCount(local)) {
        const rows = [];
        for (const type of F.FOLLOW_TYPES) for (const value of local[type]) if (!remote[type].includes(value)) rows.push({ user_id: uid, target_type: type, target_value: value });
        const room = F.MAX_FOLLOWS - F.followCount(remote);
        if (rows.length && room > 0) {
          const { error } = await state.client.from("user_follows").upsert(rows.slice(0, room), { onConflict: "user_id,target_type,target_value", ignoreDuplicates: true });
          if (!error) { for (const r of rows.slice(0, room)) remote[r.target_type].push(r.target_value); notice(t("merged")); }
        }
        try { storage.removeItem(F.KEYS.follows); } catch {}
      }
      state.follows = remote;
    }
    state.remember = Boolean(prefs.data && prefs.data.personalize_from_history);
    if (!saved.error) state.savedIds = new Set([...(saved.data || []).map((r) => r.article_id), ...readSavedLocal()]);
  }

  async function setFollow(type, value, on) {
    const v = F.validateFollow(type, value);
    if (!v.ok) return false;
    const list = state.follows[type];
    if (on && list.includes(v.value)) return true;
    if (on && F.followCount(state.follows) >= F.MAX_FOLLOWS) { notice(t("limit"), true); return false; }
    if (state.user) {
      const q = state.client.from("user_follows");
      const { error } = on ? await q.insert({ user_id: state.user.id, target_type: type, target_value: v.value })
        : await q.delete().eq("user_id", state.user.id).eq("target_type", type).eq("target_value", v.value);
      if (error && !(on && error.code === "23505")) { notice(t("syncError"), true); return false; }
    }
    state.follows[type] = on ? [...list, v.value] : list.filter((x) => x !== v.value);
    if (!state.user) writeFollowsLocal();
    return true;
  }

  async function setRemember(on) {
    if (state.user) {
      const { error } = await state.client.from("user_preferences").upsert({ user_id: state.user.id, personalize_from_history: on }, { onConflict: "user_id" });
      if (error) { notice(t("syncError"), true); return; }
    }
    state.remember = on;
    try { storage.setItem(F.KEYS.consent, on ? "1" : "0"); } catch {}
    if (!on) { state.history = []; state.readIds = new Set(); try { storage.removeItem(F.KEYS.history); } catch {} }
    render();
  }

  async function clearHistory() {
    if (state.user) { const { error } = await state.client.rpc("clear_reading_history"); if (error) { notice(t("syncError"), true); return; } }
    state.history = []; state.readIds = new Set(); try { storage.removeItem(F.KEYS.history); } catch {}
    notice(t("cleared")); render();
  }

  async function toggleSaved(article) {
    const on = !state.savedIds.has(article.id);
    if (state.user) {
      const q = state.client.from("user_saved_articles");
      const { error } = on ? await q.upsert({ user_id: state.user.id, article_id: article.id }, { onConflict: "user_id,article_id" })
        : await q.delete().eq("user_id", state.user.id).eq("article_id", article.id);
      if (error) { notice(t("syncError"), true); return; }
    }
    if (on) state.savedIds.add(article.id); else state.savedIds.delete(article.id);
    writeSavedLocal(); render();
  }

  function recordRead(article) {
    if (!state.remember) return;
    state.history = F.addToHistory(state.history, F.historyEntry(article));
    state.readIds.add(article.id);
    writeHistoryLocal();
    if (state.user) state.client.rpc("record_article_read", { p_article_id: article.id }).then(() => {}, () => {});
  }

  /* ---------- data ---------- */
  async function loadArticles() {
    state.loadError = false;
    try {
      const rows = await P.publicNews(300);
      state.articles = rows.map((r) => F.toArticle(r, lang));
      state.updated = Date.now();
    } catch { state.loadError = true; state.articles = []; }
    state.byId = new Map(state.articles.map((a) => [a.id, a]));
  }
  async function hydrate(ids) {
    const missing = ids.filter((id) => !state.byId.has(id)).slice(0, 30);
    await Promise.all(missing.map(async (id) => {
      try { const rows = await P.rpc("public_news_article", { p_id: id }); if (rows[0]) { const a = F.toArticle(rows[0], lang); state.byId.set(a.id, a); } } catch {}
    }));
  }
  async function loadServerHistory() {
    if (!state.user || !state.remember) return;
    const { data, error } = await state.client.from("user_reading_history").select("article_id,last_read_at").order("last_read_at", { ascending: false }).limit(100);
    if (error) return;
    state.serverHistory = data;
    for (const r of data) state.readIds.add(r.article_id);
  }

  /* ---------- rendering ---------- */
  function notice(text, warn) {
    const box = $("feedNotice"); box.replaceChildren(h("div", { class: "wp-notice" + (warn ? " warn" : " ok"), role: warn ? "alert" : "status", text }));
    clearTimeout(notice.timer); notice.timer = setTimeout(() => box.replaceChildren(), 6000);
  }

  function badge(article) {
    const label = { confirmed: t("trustConfirmed"), unconfirmed: t("trustUnconfirmed"), disputed: t("trustDisputed") }[article.trust];
    return h("span", { class: "wp-badge " + article.trust, text: label });
  }

  function card(item, withReasons) {
    const a = item.article;
    const saved = state.savedIds.has(a.id);
    const link = h("a", { href: "/news/" + a.id, onclick: () => recordRead(a), ...(a.titleLang ? { lang: a.titleLang, dir: a.titleLang === "ar" ? "rtl" : "ltr" } : {}) },
      h("h2", { text: a.title }));
    const reasons = withReasons && item.reasons ? item.reasons.filter((r) => !["read", "saved"].includes(r.type)).map((r) => F.reasonText(r, lang, names)).filter(Boolean) : [];
    if (item.explore) reasons.push(t("exploration"));
    return h("article", { class: "wp-card wp-article" },
      h("div", { class: "wp-meta" },
        a.breaking ? h("span", { class: "wp-badge developing", text: t("breaking") }) : null, badge(a),
        h("span", { text: catName(a.category) }), a.country ? h("span", { text: countryName(a.country) }) : null,
        a.source ? h("span", { text: a.source }) : null,
        a.published ? h("time", { datetime: new Date(a.published).toISOString(), text: P.dateFormat(a.published, lang, { dateStyle: "medium", timeStyle: "short" }) }) : null),
      link,
      a.summary ? h("p", { class: "wp-muted", ...(a.titleLang ? { lang: a.titleLang, dir: a.titleLang === "ar" ? "rtl" : "ltr" } : {}), text: a.summary.length > 220 ? a.summary.slice(0, 217) + "…" : a.summary }) : null,
      a.titleLang && a.titleLang !== lang && !a.translated ? h("p", { class: "wp-footnote", text: t("noTranslationNote") }) : null,
      reasons.length ? h("div", {}, h("span", { class: "wp-sr", text: t("why") }), h("ul", { class: "wp-reasons", "aria-label": t("why") }, reasons.map((r) => h("li", { text: r })))) : null,
      h("div", { class: "wp-row" },
        h("button", { class: "wp-btn", type: "button", "aria-pressed": String(saved), onclick: () => toggleSaved(a), text: saved ? t("saved") : t("save") }),
        h("a", { class: "wp-btn", href: "/news/" + a.id, onclick: () => recordRead(a), text: t("open") })));
  }

  function select(id, label, options, value, onchange) {
    const el = h("select", { class: "wp-select", id, onchange: (e) => onchange(e.target.value) },
      options.map(([v, text]) => h("option", { value: v, selected: v === value ? true : false, text })));
    return h("label", { class: "wp-field", for: id }, label, el);
  }

  function ranked() {
    const base = F.rank(state.articles, { follows: state.follows, history: state.remember ? state.history : [], useHistory: state.remember, readIds: state.readIds, savedIds: state.savedIds });
    return base;
  }

  function filterBar(all) {
    const f = state.filters, facets = F.facets(all);
    const catOptions = [["all", t("all")], ...Object.keys(facets.category).sort().map((k) => [k, `${catName(k)} (${facets.category[k]})`])];
    const countryOptions = [["all", t("all")], ...Object.keys(facets.country).sort((a, b) => countryName(a).localeCompare(countryName(b), lang)).map((k) => [k, `${countryName(k)} (${facets.country[k]})`])];
    const set = (key) => (value) => { state.filters[key] = value; state.visible = 24; render(); };
    return h("form", { class: "wp-filters", role: "search", "aria-label": t("filters"), onsubmit: (e) => e.preventDefault() },
      h("label", { class: "wp-field", for: "fSearch" }, t("search"), h("input", { class: "wp-input", id: "fSearch", type: "search", value: f.query, maxlength: "80", oninput: (e) => { state.filters.query = e.target.value; clearTimeout(filterBar.timer); filterBar.timer = setTimeout(() => { state.visible = 24; renderFeedOnly(); }, 200); } })),
      select("fSort", t("sort"), [["relevance", t("sortRelevance")], ["newest", t("sortNewest")], ["oldest", t("sortOldest")]], f.sort, set("sort")),
      select("fCat", t("category"), catOptions, f.category, set("category")),
      select("fCountry", t("country"), countryOptions, f.country, set("country")),
      select("fTopic", t("topic"), [["all", t("all")], ...Object.keys(F.TOPICS).map((k) => [k, F.TOPICS[k][lang]])], f.topic, set("topic")),
      select("fRange", t("range"), [["all", t("all")], ["24h", t("r24")], ["7d", t("r7")], ["30d", t("r30")]], f.range, set("range")),
      select("fLang", t("language"), [["all", t("all")], ["ar", t("langAr")], ["en", t("langEn")]], f.lang, set("lang")),
      select("fTrust", t("trust"), [["all", t("all")], ["confirmed", t("trustConfirmed")], ["unconfirmed", t("trustUnconfirmed")], ["disputed", t("trustDisputed")]], f.trust, set("trust")),
      h("button", { class: "wp-chip", type: "button", "aria-pressed": String(f.followedOnly), onclick: () => { state.filters.followedOnly = !f.followedOnly; render(); }, text: t("followedOnly") }),
      h("button", { class: "wp-chip", type: "button", "aria-pressed": String(f.unreadOnly), disabled: !state.remember, onclick: () => { state.filters.unreadOnly = !f.unreadOnly; render(); }, text: t("unreadOnly") }));
  }

  function renderFeedOnly() {
    const host = $("feedList"); if (!host) return;
    const all = ranked();
    const items = F.applyFilters(all, { ...state.filters, readIds: state.readIds });
    host.replaceChildren(...listNodes(items));
    live(`${t("shown")} ${Math.min(items.length, state.visible)} ${t("of")} ${items.length}`);
  }
  function listNodes(items) {
    if (state.loadError) return [h("div", { class: "wp-notice warn", role: "alert" }, t("failed"), " ", h("button", { class: "wp-btn", type: "button", onclick: boot, text: t("retry") }))];
    if (!items.length) return [h("p", { class: "wp-muted", text: t("empty") })];
    const nodes = [h("div", { class: "wp-articles" }, items.slice(0, state.visible).map((i) => card(i, true)))];
    if (items.length > state.visible) nodes.push(h("button", { class: "wp-btn", type: "button", onclick: () => { state.visible += 24; renderFeedOnly(); }, text: t("more") }));
    return nodes;
  }

  function feedPanel() {
    const all = ranked();
    const items = F.applyFilters(all, { ...state.filters, readIds: state.readIds });
    const parts = [];
    if (!F.followCount(state.follows) && !(state.remember && state.history.length)) parts.push(h("p", { class: "wp-notice", text: t("emptyFollows") }));
    parts.push(filterBar(all));
    parts.push(h("div", { id: "feedList", class: "wp-grid", style: "margin-block-start:16px" }, listNodes(items)));
    if (state.updated) parts.push(h("p", { class: "wp-footnote", text: `${t("updated")}: ${P.dateFormat(state.updated, lang, { dateStyle: "medium", timeStyle: "short" })}` }));
    return parts;
  }

  function savedPanel() {
    const items = [...state.savedIds].map((id) => state.byId.get(id)).filter(Boolean).map((article) => ({ article, reasons: [] }));
    if (!items.length) return [h("p", { class: "wp-muted", text: t("emptySaved") })];
    return [h("div", { class: "wp-articles" }, items.map((i) => card(i, false)))];
  }
  function historyPanel() {
    const out = [];
    if (!state.remember) out.push(h("p", { class: "wp-notice", text: t("rememberOff") }));
    const ids = state.user && state.serverHistory ? state.serverHistory.map((r) => r.article_id) : state.history.map((e) => e.id);
    const items = ids.map((id) => state.byId.get(id)).filter(Boolean).map((article) => ({ article, reasons: [] }));
    if (state.remember && !items.length) out.push(h("p", { class: "wp-muted", text: t("emptyHistory") }));
    if (items.length) out.push(h("div", { class: "wp-articles" }, items.map((i) => card(i, false))));
    if (state.remember) out.push(h("p", {}, h("button", { class: "wp-btn", type: "button", onclick: clearHistory, text: t("clear") })));
    return out;
  }

  function chipGroup(label, type, options) {
    return h("fieldset", { class: "wp-card" }, h("legend", { class: "wp-muted", text: label }),
      h("div", { class: "wp-row" }, options.map(([value, text]) => {
        const on = state.follows[type].includes(value);
        return h("button", { class: "wp-chip", type: "button", "aria-pressed": String(on), onclick: async () => { if (await setFollow(type, value, !on)) render(); }, text: `${on ? "✓ " : ""}${text}` });
      })));
  }
  function followsPanel() {
    const catKeys = ["politics", "economy", "security", "tech", "science", "health", "environment", "society", "culture", "sports", "world"];
    const countryField = h("select", { class: "wp-select", id: "countryAdd", "aria-label": t("addCountry") },
      h("option", { value: "", text: t("chooseCountry") }),
      E.iso3List().map((c) => ({ c, n: countryName(c) })).filter((x) => x.n && x.n !== x.c).sort((a, b) => a.n.localeCompare(b.n, lang)).map((x) => h("option", { value: x.c, text: x.n })));
    const interest = h("input", { class: "wp-input", id: "interestAdd", type: "text", maxlength: "40", "aria-describedby": "interestHint", placeholder: t("addInterest") });
    return [
      chipGroup(t("categories"), "category", catKeys.map((k) => [k, catName(k)])),
      chipGroup(t("topics"), "topic", Object.keys(F.TOPICS).map((k) => [k, F.TOPICS[k][lang]])),
      h("section", { class: "wp-card" }, h("h3", { text: t("countries") }),
        h("div", { class: "wp-row" }, state.follows.country.map((c) => h("button", { class: "wp-chip is-on", type: "button", "aria-label": `${t("remove")}: ${countryName(c)}`, onclick: async () => { if (await setFollow("country", c, false)) render(); }, text: `${countryName(c)} ×` })),
          countryField, h("button", { class: "wp-btn", type: "button", onclick: async () => { if (countryField.value && await setFollow("country", countryField.value, true)) render(); }, text: t("add") }))),
      h("section", { class: "wp-card" }, h("h3", { text: t("interests") }),
        h("div", { class: "wp-row" }, state.follows.interest.map((w) => h("button", { class: "wp-chip is-on", type: "button", "aria-label": `${t("remove")}: ${w}`, onclick: async () => { if (await setFollow("interest", w, false)) render(); }, text: `${w} ×` })),
          interest, h("button", { class: "wp-btn", type: "button", onclick: async () => { if (await setFollow("interest", interest.value, true)) render(); }, text: t("add") })),
        h("p", { class: "wp-footnote", id: "interestHint", text: t("interestHint") })),
      h("section", { class: "wp-card" }, h("h3", { text: t("privacy") }),
        h("label", { class: "wp-row" }, h("input", { type: "checkbox", checked: state.remember ? true : false, onchange: (e) => setRemember(e.target.checked) }), t("remember")),
        h("p", { class: "wp-footnote", text: t("rememberHelp") }),
        state.remember ? h("button", { class: "wp-btn", type: "button", onclick: clearHistory, text: t("clear") }) : null)
    ];
  }

  function statusLine() {
    return state.user ? h("p", { class: "wp-notice ok", text: t("signedIn") })
      : h("p", { class: "wp-notice" }, t("anon"), " ", h("a", { href: "account.html?next=" + encodeURIComponent("for-you.html?lang=" + lang), text: t("signIn") }));
  }

  function render() {
    const tabs = [["feed", t("tabFeed")], ["saved", t("tabSaved")], ["history", t("tabHistory")], ["follows", t("tabFollows")]];
    const panel = { feed: feedPanel, saved: savedPanel, history: historyPanel, follows: followsPanel }[state.tab]();
    const root = $("forYouApp");
    root.replaceChildren(
      statusLine(),
      h("div", { class: "wp-tabs", role: "tablist", "aria-label": t("title") }, tabs.map(([key, label]) =>
        h("button", { class: "wp-tab", role: "tab", id: "tab-" + key, "aria-selected": String(state.tab === key), "aria-controls": "panel", tabindex: state.tab === key ? "0" : "-1",
          onclick: () => { state.tab = key; render(); $("tab-" + key).focus(); },
          onkeydown: (e) => { const i = tabs.findIndex((x) => x[0] === state.tab); const d = (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0) * (lang === "ar" ? -1 : 1); if (d) { state.tab = tabs[(i + d + tabs.length) % tabs.length][0]; render(); $("tab-" + state.tab).focus(); } },
          text: label }))),
      h("div", { id: "panel", role: "tabpanel", "aria-labelledby": "tab-" + state.tab }, panel));
  }

  async function boot() {
    $("forYouApp").replaceChildren(h("div", { class: "wp-skeleton", role: "status", "aria-label": t("loading") }));
    state.history = F.loadLocalHistory(storage);
    state.savedIds = readSavedLocal();
    try { state.remember = storage.getItem(F.KEYS.consent) === "1"; } catch {}
    if (!state.user) state.follows = F.loadLocalFollows(storage);
    const account = loadAccount().catch(() => {});
    await Promise.all([loadArticles(), account]);
    if (!state.user) { try { state.remember = storage.getItem(F.KEYS.consent) === "1"; } catch {} } else { try { storage.setItem(F.KEYS.consent, state.remember ? "1" : "0"); } catch {} }
    if (!state.remember) state.history = [];
    state.readIds = new Set(state.history.map((e) => e.id));
    await loadServerHistory();
    await hydrate([...state.savedIds, ...state.history.slice(0, 30).map((e) => e.id), ...(state.serverHistory || []).slice(0, 30).map((r) => r.article_id)]);
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("forYouTitle").textContent = t("title"); $("forYouLead").textContent = t("lead");
    boot();
  });
  window.WLForYou = { state, boot };
})();
