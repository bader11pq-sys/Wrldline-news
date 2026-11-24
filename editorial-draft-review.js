/* WRLDLINE editorial draft review (human gate).
 * Lists AI-assisted editorial_publications drafts and lets an editor approve or reject them through
 * public.review_editorial_publication(). Nothing is published without a written editorial note.
 * Authorization is enforced by the database (trigger + RPC), never by hiding this panel. */
(() => {
  "use strict";
  const panelId = "editorialDraftReviewPanel";
  const SECTION_LABEL = { hourly: "النشرة الساعية", dossier: "ملف حدث", watchlist: "ما نراقبه", context: "غرفة السياق", mirror: "مرآة التاريخ" };
  let db = null, loading = false;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") node.textContent = v; else if (k === "class") node.className = v; else node.setAttribute(k, v);
    }
    for (const child of children || []) node.appendChild(child);
    return node;
  }

  function sourceCount(row) { return Array.isArray(row.sources) ? row.sources.length : 0; }

  function summaryOf(row) {
    const c = row && row.content && typeof row.content === "object" ? row.content : {};
    const first = c.executive_summary || c.summary || c.dek || c.nowSummary || (Array.isArray(c.items) && c.items[0] && c.items[0].summary) || "";
    return String(first).replace(/\s+/g, " ").trim().slice(0, 420);
  }

  function buildShell() {
    if (document.getElementById(panelId)) return document.getElementById(panelId);
    const host = document.getElementById("aiProviderPanel") || document.getElementById("editorialTrustPanel");
    if (!host || !host.parentNode) return null;
    const section = el("section", { class: "panel hidden", id: panelId, "aria-labelledby": panelId + "Heading" }, [
      el("div", { class: "row" }, [
        el("div", {}, [
          el("h2", { id: panelId + "Heading", text: "مسودات المحرر الآلي بانتظار القرار البشري" }),
          el("small", { class: "muted", text: "الذكاء الاصطناعي يعدّ مسودات فقط. لا شيء يُنشر قبل أن يراجع محرر المصادر ويكتب ملاحظة قرار." })
        ]),
        el("button", { class: "btn", type: "button", id: panelId + "Refresh", text: "تحديث" })
      ]),
      el("div", { class: "status", id: panelId + "Status", role: "status", "aria-live": "polite", text: "جارٍ تحميل المسودات…" }),
      el("div", { id: panelId + "List" })
    ]);
    host.parentNode.insertBefore(section, host);
    document.getElementById(panelId + "Refresh").addEventListener("click", load);
    return section;
  }

  function card(row) {
    const note = el("textarea", { rows: "2", maxlength: "1000", placeholder: "ملاحظة القرار (8 أحرف على الأقل): ما الذي تحققت منه؟", "aria-label": "ملاحظة القرار" });
    const msg = el("div", { class: "muted", role: "status", "aria-live": "polite" });
    const decide = async decision => {
      const text = note.value.trim();
      if (text.length < 8) { msg.textContent = "اكتب ملاحظة قرار لا تقل عن 8 أحرف."; note.focus(); return; }
      if (decision === "approve" && !window.confirm("سيُنشر هذا المحتوى للقراء بعد موافقتك. هل راجعت المصادر والادعاءات؟")) return;
      approve.disabled = reject.disabled = true; msg.textContent = "جارٍ حفظ القرار…";
      const { error } = await db.rpc("review_editorial_publication", { p_id: row.id, p_decision: decision, p_note: text });
      if (error) { msg.textContent = "تعذر حفظ القرار: " + error.message; approve.disabled = reject.disabled = false; return; }
      msg.textContent = decision === "approve" ? "تم النشر بقرار بشري." : "تم الرفض وحفظ السبب.";
      setTimeout(load, 600);
    };
    const approve = el("button", { class: "btn", type: "button", text: "اعتماد ونشر" });
    const reject = el("button", { class: "btn secondary", type: "button", text: "رفض" });
    approve.addEventListener("click", () => decide("approve"));
    reject.addEventListener("click", () => decide("reject"));
    const sources = Array.isArray(row.sources) ? row.sources.slice(0, 12) : [];
    const list = el("ol", { class: "muted" }, sources.map(s => {
      const li = el("li");
      const href = /^https?:\/\//i.test(String(s && s.url || "")) ? s.url : "";
      if (href) li.appendChild(el("a", { href, target: "_blank", rel: "noopener noreferrer", text: String(s.title || s.publisher || href).slice(0, 140) }));
      else li.textContent = String((s && (s.title || s.publisher)) || "مصدر بلا رابط").slice(0, 140);
      if (s && s.publisher) li.appendChild(document.createTextNode(" — " + String(s.publisher).slice(0, 80)));
      return li;
    }));
    const supersedes = row.content && row.content.supersedes ? "تعديل مقترح على: " + row.content.supersedes : "";
    return el("article", { class: "panel", style: "margin-top:12px" }, [
      el("h3", { text: row.title || row.slug }),
      el("p", { class: "muted", text: [SECTION_LABEL[row.section] || row.section, "المولّد: " + (row.generated_by || "غير محدد"), sourceCount(row) + " مصدر", supersedes, new Date(row.updated_at).toISOString().slice(0, 16).replace("T", " ") + " UTC"].filter(Boolean).join(" · ") }),
      el("p", { text: summaryOf(row) || "لا يوجد ملخص نصي؛ افتح المحتوى الكامل قبل القرار." }),
      el("details", {}, [el("summary", { text: "المصادر المرفقة" }), list]),
      el("details", {}, [el("summary", { text: "المحتوى الكامل (JSON للقراءة)" }), el("pre", { style: "white-space:pre-wrap;max-height:320px;overflow:auto;direction:ltr;text-align:left", text: JSON.stringify(row.content, null, 2).slice(0, 20000) })]),
      note, el("div", { class: "row" }, [approve, reject]), msg
    ]);
  }

  async function load() {
    if (loading || !db) return; loading = true;
    const status = document.getElementById(panelId + "Status"), list = document.getElementById(panelId + "List");
    const { data, error } = await db.from("editorial_publications")
      .select("id,section,slug,title,status,content,sources,generated_by,updated_at,review_decision")
      .eq("status", "draft").order("updated_at", { ascending: false }).limit(25);
    loading = false;
    list.replaceChildren();
    if (error) { status.textContent = "تعذر تحميل المسودات: " + error.message; return; }
    status.textContent = data.length ? data.length + " مسودة بانتظار القرار." : "لا توجد مسودات بانتظار المراجعة.";
    data.forEach(row => list.appendChild(card(row)));
  }

  async function init() {
    const shell = buildShell(); if (!shell) return;
    db = window.WRLDLINE_ADMIN_DB; if (!db) return;
    const { data } = await db.auth.getSession();
    const role = data && data.session && data.session.user && data.session.user.app_metadata && data.session.user.app_metadata.role;
    const allowed = role === "editor" || role === "admin";
    shell.classList.toggle("hidden", !allowed);
    if (allowed) load();
  }

  // admin.js creates the client lazily; poll briefly instead of coupling to its internals.
  let tries = 0;
  const timer = setInterval(() => {
    if (window.WRLDLINE_ADMIN_DB) { clearInterval(timer); init(); window.WRLDLINE_ADMIN_DB.auth.onAuthStateChange(() => init()); }
    else if (++tries > 40) clearInterval(timer);
  }, 500);
})();
