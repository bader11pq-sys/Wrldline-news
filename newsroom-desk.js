/* Admin: newsroom desk. Workflow overview, article queue, internal review notes, source summary.
   Data comes only from the editor-gated RPCs in 20261126020000_newsroom_desk.sql; access is enforced by the
   database. This file never publishes or changes an article's status: it can open an article in the
   existing editor and add internal notes. DOM builders only (no innerHTML). */
(() => {
  "use strict";
  const root = document.getElementById("newsroomDesk"), D = window.WLNewsroomDesk;
  if (!root || !D) return;
  const lang = () => (window.wrldlineLang || (() => { try { return localStorage.getItem("wrldline:language"); } catch { return null; } })() || "ar");
  const t = (ar, en) => (lang() === "ar" ? ar : en);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "text") n.textContent = String(v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  const db = () => window.WRLDLINE_ADMIN_DB;
  const num = (n) => new Intl.NumberFormat(lang() === "ar" ? "ar-SA-u-nu-latn" : "en").format(n);
  const stamp = (ms) => (ms ? new Date(ms).toLocaleString(lang() === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en", { dateStyle: "medium", timeStyle: "short" }) : "—");
  const STATUS = { draft: ["مسودة", "Draft"], review: ["قيد المراجعة", "In review"], published: ["منشور", "Published"], rejected: ["مرفوض", "Rejected"] };
  const TRUST = { confirmed: ["مؤكد", "Confirmed"], unconfirmed: ["غير مؤكد", "Unconfirmed"], disputed: ["متنازع عليه", "Disputed"] };
  const NOTE = { note: ["ملاحظة", "Note"], request_changes: ["طلب تعديل", "Change request"], verification: ["تحقق", "Verification"], assignment: ["تكليف", "Assignment"] };
  const pick = (map, k) => (map[k] ? t(map[k][0], map[k][1]) : k);

  const state = { filters: { status: "", trust: "", q: "" }, page: 0, size: 25, open: null };
  const slots = { overview: el("div", { id: "deskOverview" }), queue: el("div", { id: "deskQueue" }), sources: el("div", { id: "deskSources" }), status: el("p", { id: "deskStatus", role: "status", "aria-live": "polite", class: "muted" }) };
  let started = false;

  const say = (m) => { slots.status.textContent = m || ""; };
  const rpcErr = (e) => (e && e.message ? e.message : String(e));

  function card(label, value, hint) {
    return el("div", { class: "desk-card" }, el("span", { class: "desk-card-label", text: label }), el("strong", { class: "desk-card-value", text: value }), hint ? el("small", { class: "muted", text: hint }) : null);
  }
  function renderOverview(o) {
    const bars = D.barHeights(o.series);
    slots.overview.replaceChildren(
      el("div", { class: "desk-cards" },
        ...D.STATUSES.map((s) => card(pick(STATUS, s), num(o.byStatus[s]))),
        card(t("طابور المراجعة", "Review backlog"), num(o.reviewBacklog), t("مسودات وقيد المراجعة", "Drafts and in review")),
        card(t("منشور يحتاج مراجعة مصداقية", "Published, trust review due"), num(o.needsTrustReview)),
        card(t("ترجمات بانتظار المراجعة", "Translations awaiting review"), num(o.translationsAwaiting)),
        card(t("طلبات تعديل مفتوحة", "Open change requests"), num(o.openRequests))),
      el("h3", { text: t(`المنشور خلال ${num(o.windowDays)} يومًا حسب حالة التحقق`, `Published in ${num(o.windowDays)} days by verification`) }),
      el("p", { class: "muted", text: D.TRUSTS.map((k) => `${pick(TRUST, k)}: ${num(o.publishedByTrust[k])}`).join(" · ") }),
      el("h3", { text: t("سجل التصحيحات والتحديثات", "Corrections and updates") }),
      el("p", { class: "muted", text: [
        ...["correction", "retraction", "verification", "updated"].map((k) => `${({ correction: t("تصحيح", "Corrections"), retraction: t("سحب", "Retractions"), verification: t("تحقق", "Verification changes"), updated: t("تعديل", "Edits") })[k]}: ${num(o.changes[k])}`),
        `${t("تحديثات القصة", "Story updates")}: ${num(Object.values(o.updates).reduce((a, b) => a + b, 0))}`].join(" · ") }),
      bars.length ? el("div", { class: "desk-bars", role: "img", "aria-label": t("عدد المنشور يوميًا", "Published per day") },
        ...bars.map((b) => el("span", { class: "desk-bar", title: `${b.day}: ${b.count}`, style: `height:${b.pct}%` }))) : el("p", { class: "muted", text: t("لا منشورات في هذه الفترة.", "Nothing published in this period.") }),
      el("small", { class: "muted", text: t(`وقت الحساب: ${stamp(o.generatedAt)}`, `Computed: ${stamp(o.generatedAt)}`) }));
  }
  async function loadOverview() {
    const { data, error } = await db().rpc("editor_newsroom_overview", { p_days: 30 });
    if (error) { slots.overview.replaceChildren(el("p", { class: "notice", text: t("تعذر تحميل المؤشرات: ", "Could not load indicators: ") + rpcErr(error) })); return; }
    const o = D.normalizeOverview(data);
    if (!o) { slots.overview.replaceChildren(el("p", { class: "notice", text: t("رد غير متوقع من الخادم.", "Unexpected server response.") })); return; }
    renderOverview(o);
  }

  function badge(text, kind) { return el("span", { class: "desk-badge " + (kind || ""), text }); }
  async function loadNotes(row, box) {
    box.replaceChildren(el("p", { class: "muted", text: t("جارٍ التحميل…", "Loading…") }));
    const { data, error } = await db().from("article_review_notes").select("id,kind,body,created_at").eq("article_id", row.id).order("created_at", { ascending: false }).limit(50);
    if (error) { box.replaceChildren(el("p", { class: "notice", text: rpcErr(error) })); return; }
    const kind = el("select", { "aria-label": t("نوع الملاحظة", "Note type") }, D.NOTE_KINDS.map((k) => el("option", { value: k, text: pick(NOTE, k) })));
    const body = el("textarea", { rows: 2, maxlength: 1000, "aria-label": t("نص الملاحظة", "Note text"), dir: "auto" });
    const msg = el("span", { role: "status", class: "muted" });
    const add = el("button", { type: "button", class: "btn secondary", text: t("إضافة ملاحظة داخلية", "Add internal note"), onclick: async () => {
      const text = body.value.trim();
      if (text.length < 3) { msg.textContent = t("اكتب ملاحظة من 3 أحرف على الأقل.", "Write at least 3 characters."); return; }
      add.disabled = true;
      const { error: e } = await db().from("article_review_notes").insert({ article_id: row.id, kind: kind.value, body: text });
      add.disabled = false;
      if (e) { msg.textContent = t("تعذر الحفظ: ", "Could not save: ") + rpcErr(e); return; }
      body.value = ""; loadNotes(row, box); loadQueue(); loadOverview();
    } });
    box.replaceChildren(
      el("p", { class: "muted", text: t("ملاحظات داخلية لا تظهر للقراء ولا يمكن تعديلها أو حذفها.", "Internal notes are never shown to readers and cannot be edited or deleted.") }),
      el("ul", { class: "desk-notes" }, (data || []).map((n) => el("li", {}, badge(pick(NOTE, n.kind), n.kind), " ", el("span", { dir: "auto", text: n.body }), " ", el("small", { class: "muted", text: stamp(Date.parse(n.created_at)) })))),
      D.can(window.WRLDLINE_ADMIN_ROLE, "add_note") ? el("div", { class: "desk-note-form" }, kind, body, add, msg) : null);
  }
  function renderRow(r) {
    const notesBox = el("div", { class: "desk-notes-box", hidden: true });
    const toggle = el("button", { type: "button", class: "btn secondary", "aria-expanded": "false", text: t(`ملاحظات (${num(r.notes)})`, `Notes (${num(r.notes)})`), onclick: () => {
      const open = notesBox.hidden; notesBox.hidden = !open; toggle.setAttribute("aria-expanded", String(open));
      if (open) loadNotes(r, notesBox);
    } });
    return el("li", { class: "desk-row" },
      el("div", { class: "desk-row-main" },
        el("strong", { dir: "auto", text: r.title }),
        el("div", { class: "desk-meta" },
          badge(pick(STATUS, r.status), "st-" + r.status), badge(pick(TRUST, r.trust), "tr-" + r.trust),
          r.needsReview && r.status === "published" ? badge(t("مراجعة مصداقية مطلوبة", "Trust review due"), "warn") : null,
          r.lastNoteKind === "request_changes" ? badge(t("طلب تعديل", "Change requested"), "warn") : null,
          r.source ? el("span", { text: r.source }) : el("span", { class: "muted", text: t("بلا مصدر", "No source") }),
          r.publishedAt ? el("span", { text: stamp(r.publishedAt) }) : null),
        el("small", { class: "muted", text: t(
          `تغييرات ${num(r.changes)} · تصحيحات ${num(r.corrections)} · تحديثات ${num(r.updates)} · آخر تغيير ${stamp(r.lastChangeAt)}`,
          `Changes ${num(r.changes)} · corrections ${num(r.corrections)} · updates ${num(r.updates)} · last change ${stamp(r.lastChangeAt)}`) })),
      el("div", { class: "desk-row-actions" },
        el("button", { type: "button", class: "btn", text: t("فتح في المحرر", "Open in editor"), onclick: () => window.WLAdminOpenArticle && window.WLAdminOpenArticle(r.id) }), toggle),
      notesBox);
  }
  async function loadQueue() {
    const args = D.queueArgs(state.filters, state.page, state.size);
    const { data, error } = await db().rpc("editor_article_queue", args);
    if (error) { slots.queue.replaceChildren(el("p", { class: "notice", text: t("تعذر تحميل القائمة: ", "Could not load the queue: ") + rpcErr(error) })); return; }
    const rows = (Array.isArray(data) ? data : []).map(D.normalizeRow).filter(Boolean);
    const prev = el("button", { type: "button", class: "btn secondary", text: t("السابق", "Previous"), disabled: state.page === 0, onclick: () => { state.page--; loadQueue(); } });
    const next = el("button", { type: "button", class: "btn secondary", text: t("التالي", "Next"), disabled: rows.length < state.size, onclick: () => { state.page++; loadQueue(); } });
    slots.queue.replaceChildren(
      rows.length ? el("ul", { class: "desk-list" }, rows.map(renderRow)) : el("p", { class: "muted", text: t("لا أخبار تطابق هذه الفلاتر.", "No stories match these filters.") }),
      el("div", { class: "desk-pager" }, prev, el("span", { text: t(`صفحة ${num(state.page + 1)}`, `Page ${num(state.page + 1)}`) }), next));
  }
  function filters() {
    const sel = (id, label, opts, key) => el("label", { for: id }, label, el("select", { id, onchange: (e) => { state.filters[key] = e.target.value; state.page = 0; loadQueue(); } },
      el("option", { value: "", text: t("الكل", "All") }), opts.map(([v, l]) => el("option", Object.assign({ value: v }, state.filters[key] === v ? { selected: "" } : {}), l))));
    const q = el("input", { id: "deskSearch", type: "search", maxlength: 120, placeholder: t("بحث في العنوان أو المصدر", "Search title or source"), "aria-label": t("بحث", "Search"), dir: "auto" });
    let timer = null;
    q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { state.filters.q = q.value; state.page = 0; loadQueue(); }, 350); });
    return el("div", { class: "desk-filters" },
      sel("deskStatusFilter", t("الحالة", "Status"), D.STATUSES.map((s) => [s, pick(STATUS, s)]), "status"),
      sel("deskTrustFilter", t("التحقق", "Verification"), D.TRUSTS.map((s) => [s, pick(TRUST, s)]), "trust"), q);
  }
  async function loadSources() {
    const { data, error } = await db().rpc("editor_source_summary", { p_days: 30 });
    if (error) { slots.sources.replaceChildren(el("p", { class: "notice", text: rpcErr(error) })); return; }
    const rows = Array.isArray(data) ? data.filter((r) => r && typeof r.source_name === "string") : [];
    const h = (ar, en) => el("th", { scope: "col", text: t(ar, en) });
    slots.sources.replaceChildren(el("div", { class: "desk-table-wrap" }, el("table", { class: "desk-table" },
      el("caption", { class: "sr-only", text: t("ملخص المصادر", "Source summary") }),
      el("thead", {}, el("tr", {}, h("المصدر", "Source"), h("التصنيف", "Policy tier"), h("الأخبار", "Stories"), h("منشور", "Published"), h("مؤكد", "Confirmed"), h("يحتاج مراجعة", "Needs review"), h("تصحيحات", "Corrections"), h("آخر نشر", "Last published"))),
      el("tbody", {}, rows.map((r) => el("tr", {}, el("th", { scope: "row", dir: "auto", text: r.source_name }), el("td", { text: r.policy_tier || t("غير مسجّل", "Not listed") }),
        ...["articles", "published", "confirmed", "needs_review", "corrections"].map((k) => el("td", { text: num(Number(r[k]) || 0) })), el("td", { text: stamp(Date.parse(r.last_published_at)) })))))));
  }

  async function start() {
    if (started || !db()) return;
    const { data: { session } } = await db().auth.getSession();
    const role = session && session.user && session.user.app_metadata && session.user.app_metadata.role;
    if (!D.can(role, "view_desk")) return;
    started = true; window.WRLDLINE_ADMIN_ROLE = role;
    root.hidden = false;
    root.replaceChildren(
      el("h2", { id: "deskTitle", text: t("مكتب التحرير", "Newsroom desk") }),
      el("p", { class: "muted", text: t("نظرة تشغيلية على سير العمل التحريري. لا تنشر هذه اللوحة شيئًا؛ النشر يمر عبر بوابة النشر والمراجعة البشرية القائمة.", "An operational view of the editorial workflow. This panel never publishes; publishing still goes through the existing publication gate and human review.") }),
      slots.status, slots.overview,
      el("h3", { text: t("قائمة الأخبار", "Story queue") }), filters(), slots.queue,
      el("h3", { text: t("المصادر (آخر 30 يومًا)", "Sources (last 30 days)") }), slots.sources);
    say(t("جارٍ التحميل…", "Loading…"));
    await Promise.all([loadOverview(), loadQueue(), loadSources()]);
    say("");
  }
  const editorPanel = document.getElementById("editorPanel");
  if (editorPanel) new MutationObserver(() => { if (!editorPanel.classList.contains("hidden")) start(); }).observe(editorPanel, { attributes: true, attributeFilter: ["class"] });
  if (editorPanel && !editorPanel.classList.contains("hidden")) start();
})();
