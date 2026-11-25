/* WRLDLINE: public editorial context. No SDK/session or table-wide reads. */
(function (scope) {
  "use strict";
  if (scope.document && !scope.document.getElementById("storyUpdatesScript") && scope.document.querySelector("[data-public-article]")) {
    const loader = scope.document.createElement("script");
    loader.id = "storyUpdatesScript"; loader.src = "/story-updates.js?v=20261125-1"; loader.defer = true;
    scope.document.head.append(loader);
  }
  const PROJECT_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const PUBLIC_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const states = {
    confirmed: ["مؤكد بمراجعة بشرية", "Human-reviewed confirmation"],
    unconfirmed: ["غير مؤكد", "Unconfirmed"],
    multi: ["مؤكد من مصادر متعددة", "Confirmed by multiple sources"],
    single: ["مصدر واحد", "Single source"],
    field_confirmed: ["تأكيد ميداني", "Field-confirmed"],
    official_confirmed: ["تأكيد رسمي", "Officially confirmed"],
    disputed: ["متنازع عليه", "Disputed"],
    corrected: ["مصحّح", "Corrected"],
    retracted: ["مسحوب", "Retracted"]
  };
  const evidenceTypes = {
    independent_report: ["تقرير صحفي", "Reporting"], official_statement: ["بيان رسمي — ادعاء الجهة وليس إثباتًا مستقلًا", "Official statement — the agency's account, not independent proof"],
    field_report: ["تقرير ميداني", "Field reporting"], primary_document: ["وثيقة أصلية", "Primary document"],
    contradiction: ["دليل مخالف", "Contradictory evidence"], correction: ["تصحيح", "Correction"], retraction: ["سحب", "Retraction"]
  };
  const pair = (values, lang) => values[lang === "en" ? 1 : 0];
  const text = (ar, en, lang) => lang === "en" ? en : ar;
  function safeUrl(value) {
    if (typeof value !== "string" || value.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
    catch (_) { return null; }
  }
  function articleId(value) { return UUID.test(String(value || "")) ? String(value).toLowerCase() : null; }
  function status(value) { return Object.hasOwn(states, value) ? value : "unconfirmed"; }
  function list(value) { return Array.isArray(value) ? value.slice(0, 100) : []; }
  function stamp(value, lang) {
    if (!value) return text("لم تُسجّل مراجعة بشرية", "No human review recorded", lang);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? text("وقت غير متاح", "Time unavailable", lang) : date.toLocaleString(lang === "en" ? "en-GB" : "ar-SA");
  }
  async function fetchTrust(id, options = {}) {
    const validId = articleId(id);
    if (!validId) throw new TypeError("A canonical article UUID is required");
    const lang = options.lang === "en" ? "en" : "ar";
    const request = options.fetch || scope.fetch.bind(scope);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || 10000);
    try {
      const response = await request(PROJECT_URL + "/rest/v1/rpc/get_public_article_trust", {
        method: "POST", mode: "cors", credentials: "omit", cache: "no-store", signal: controller.signal,
        headers: {"Content-Type": "application/json", apikey: PUBLIC_KEY},
        body: JSON.stringify({p_article_id: validId, p_lang: options.includeTranslation === false ? null : lang})
      });
      if (!response.ok) throw new Error("Editorial context unavailable (" + response.status + ")");
      const record = await response.json();
      if (record === null) return null;
      if (!record || typeof record !== "object" || Array.isArray(record) || articleId(record.id) !== validId) throw new Error("Invalid editorial context response");
      return record;
    } finally { clearTimeout(timer); }
  }
  function render(root, record, lang = "ar") {
    const doc = root.ownerDocument;
    const node = (tag, content, className) => {
      const el = doc.createElement(tag); if (content != null) el.textContent = String(content);
      if (className) el.className = className; return el;
    };
    const link = (url, label) => {
      const href = safeUrl(url); if (!href) return node("span", label);
      const a = node("a", label); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
    };
    const section = (title) => { const el = node("section", null, "wl-trust-section"); el.append(node("h3", title)); return el; };
    root.replaceChildren(); root.classList.add("wl-trust"); root.dir = lang === "en" ? "ltr" : "rtl";
    root.setAttribute("aria-label", text("المصادر وحالة الادعاءات", "Sources and claim assessment", lang));
    if (!record) { root.append(node("p", text("لا يتوفر سياق تحريري عام لهذا الخبر.", "No public editorial context is available for this story.", lang))); return; }
    const current = record.trust_needs_review ? (record.editorial_trust_status === "disputed" ? "disputed" : "unconfirmed") : status(record.editorial_trust_status);
    const header = node("div", null, "wl-trust-header");
    header.append(node("h2", text("المصداقية والسياق", "Credibility & context", lang)), node("span", pair(states[current], lang), "wl-trust-badge wl-trust-badge--" + current));
    root.append(header, node("p", text("هذا تقييم تحريري للأدلة، وليس ضمانًا للحقيقة. ثقة الذكاء الاصطناعي لا تعني التحقق من الخبر.", "This is an editorial assessment of evidence, not a guarantee of truth. AI confidence does not verify a story.", lang), "wl-trust-disclaimer"));
    root.append(node("p", text("آخر مراجعة بشرية: ", "Last human review: ", lang) + stamp(record.trust_reviewed_at, lang), "wl-trust-meta"));
    if (record.trust_needs_review) root.append(node("p", text("يلزم تقييم جديد؛ قد تكون الأدلة أو النص قد تغيرت منذ آخر مراجعة.", "A new assessment is needed; evidence or text may have changed since the last review.", lang), "wl-trust-warning"));
    const source = section(text("المصدر الأصلي", "Original source", lang));
    source.append(link(record.source_url, record.source_name || text("رابط المصدر", "Source link", lang)));
    source.append(node("p", text("لغة المصدر: ", "Source language: ", lang) + (record.source_language || text("غير معلومة", "Unknown", lang)))); root.append(source);
    if (record.agency_narrative || record.agency_name || safeUrl(record.agency_account_url)) {
      const agency = section(text("رواية الجهة / الوكالة", "Agency / institution account", lang));
      agency.append(node("p", record.agency_name || text("جهة غير مسماة", "Unnamed agency", lang)), node("p", record.agency_narrative || ""));
      if (safeUrl(record.agency_account_url)) agency.append(link(record.agency_account_url, text("حساب الجهة — رابط سجله المحرر", "Agency account — editor-recorded link", lang)));
      if (safeUrl(record.agency_statement_url)) agency.append(link(record.agency_statement_url, text("البيان الأصلي", "Original statement", lang)));
      agency.append(node("small", text("نسب الرواية إلى جهة لا يؤكد مضمونها ولا يوثّق الحساب تلقائيًا.", "Attribution does not confirm the account or automatically authenticate the profile.", lang))); root.append(agency);
    }
    const claims = section(text("ما المؤكد وما المختلف عليه؟", "What is confirmed or disputed?", lang));
    if (!list(record.claims).length) claims.append(node("p", text("لم تُسجّل ادعاءات مفصلة؛ لا نستنتج التأكيد من عدد المصادر.", "No detailed claims recorded; source counts alone do not establish confirmation.", lang)));
    for (const claim of list(record.claims)) {
      if (!claim || typeof claim !== "object") continue;
      const assessed = record.trust_needs_review && claim.status === "confirmed" ? "unconfirmed" : status(claim.status);
      const item = node("article", null, "wl-trust-claim"); item.append(node("span", pair(states[assessed], lang), "wl-trust-badge wl-trust-badge--" + assessed), node("p", claim.claim_text || ""));
      for (const evidence of list(claim.supporting_evidence)) if (evidence) item.append(link(evidence.evidence_url, evidence.publisher || text("الدليل المسند", "Supporting evidence", lang)));
      claims.append(item);
    }
    root.append(claims);
    const evidenceSection = section(text("الأدلة وروابطها", "Evidence & source links", lang));
    if (!list(record.evidence).length) evidenceSection.append(node("p", text("لم تُضف أدلة تفصيلية بعد.", "Detailed evidence has not been added yet.", lang)));
    for (const evidence of list(record.evidence)) {
      if (!evidence || typeof evidence !== "object") continue;
      const item = node("div", null, "wl-trust-evidence"); item.append(link(evidence.evidence_url, evidence.publisher || text("مصدر", "Source", lang)));
      item.append(node("p", pair(evidenceTypes[evidence.evidence_type] || ["نوع غير محدد", "Unspecified type"], lang)));
      item.append(node("small", evidence.independence_recorded ? text("استقلالية سجّلها محرر بشري؛ ليست شهادة آلية.", "Independence recorded by a human editor, not automatically certified.", lang) : text("لم تُسجّل مراجعة استقلالية؛ إعادة النشر لا تُعد مصدرًا مستقلًا.", "Independence review not recorded; republication is not an independent source.", lang))); evidenceSection.append(item);
    }
    root.append(evidenceSection);
    const translations = section(text("الترجمة والنص الأصلي", "Translation & source content", lang));
    const translated = record.source_language && record.lang && record.source_language !== record.lang;
    const reviewed = record.human_translation_status === "reviewed" && !!record.human_translation_reviewed_at;
    translations.append(node("p", translated ? (reviewed ? text("نص مترجم راجعه محرر بشري.", "Translated text reviewed by a human editor.", lang) : text("نص مترجم لم تسجّل له مراجعة بشرية؛ لا يُعامل كتأكيد.", "Translated text without a recorded human review; it is not confirmation.", lang)) : text("لغة النص المسجلة: ", "Recorded text language: ", lang) + (record.lang || text("غير معلومة", "Unknown", lang))));
    if (translated) translations.append(node("p", text("مراجعة الترجمة: ", "Translation review: ", lang) + stamp(record.human_translation_reviewed_at, lang), "wl-trust-meta"));
    if (record.trust_source_excerpt) {
      translations.append(node("h4", text("مقتطف بلغة المصدر سجله المحرر", "Editor-recorded source-language excerpt", lang)));
      const quote = node("blockquote", record.trust_source_excerpt); quote.dir = "auto"; if (record.source_language) quote.lang = record.source_language; translations.append(quote);
    } else translations.append(node("small", text("لا يتوفر مقتطف أصلي هنا؛ ارجع إلى رابط المصدر للمقارنة.", "No original excerpt is available here; use the source link to compare.", lang)));
    if (record.reviewed_translation && record.reviewed_translation.lang === lang) {
      const tr = record.reviewed_translation; translations.append(node("h4", text("ترجمة معتمدة للمقارنة", "Human-reviewed translation for comparison", lang)), node("p", tr.title || ""), node("p", tr.summary || ""), node("small", text("وقت مراجعتها: ", "Reviewed: ", lang) + stamp(tr.reviewed_at, lang)));
      if (tr.translation_source === "machine_draft") translations.append(node("small", text("أصلها ترجمة آلية ثم مراجعة بشرية؛ لم تُغيّر نسبة المصدر.", "Machine-origin translation followed by human review; origin attribution is preserved.", lang)));
    }
    root.append(translations);
    const history = section(text("التصحيحات وسجل التغييرات", "Corrections & change history", lang));
    if (record.correction_note) history.append(node("p", record.correction_note, "wl-trust-warning"));
    history.append(node("small", text("سجل عام مختصر يُضاف إليه دون استبدال؛ لا يعرض ملاحظات داخلية أو بيانات المحررين. يُعرض أحدث 100 تغيير، لا لقطات النص القديمة.", "An append-only public summary; no internal notes or editor identities. Shows the latest 100 changes, not prior text snapshots.", lang)));
    if (!list(record.history).length) history.append(node("p", text("لا توجد تغييرات مسجلة في طبقة التدقيق الجديدة؛ لا يعني ذلك أن الخبر لم يتغير سابقًا.", "No changes recorded in the new audit layer; this does not imply the story was never changed before.", lang)));
    const changes = node("ol", null, "wl-trust-history");
    const labels = {created: ["إنشاء الخبر", "Story created"], updated: ["تحديث تحريري", "Editorial update"], verification: ["تحديث التقييم", "Assessment update"], correction: ["تصحيح", "Correction"], retraction: ["سحب", "Withdrawal"]};
    for (const change of list(record.history)) if (change) {
      const item = node("li"); item.append(node("time", stamp(change.changed_at, lang)), node("strong", pair(labels[change.change_type] || labels.updated, lang)));
      // Only corrections contain human-authored public text; generic event notes are localized here.
      if (change.change_type === "correction" && change.public_note) item.append(node("p", change.public_note)); changes.append(item);
    }
    history.append(changes); root.append(history);
  }
  const mounts = new WeakMap();
  async function mount(root, options = {}) {
    if (!root) return null;
    const id = articleId(root.dataset.articleId); if (!id) return null;
    const lang = options.lang === "en" ? "en" : (options.lang || scope.wrldlineLang || (scope.document && scope.document.documentElement.lang) || "ar");
    const marker = {}; mounts.set(root, marker);
    root.setAttribute("aria-busy", "true");
    try {
      const record = await fetchTrust(id, {...options, lang, includeTranslation: root.dataset.editionView === undefined});
      if (mounts.get(root) === marker) render(root, record, lang);
      return record;
    } catch (_) {
      if (mounts.get(root) === marker) {
        // Fail closed, but keep safe SSR content if the optional refresh fails.
        if (!root.dataset.trustSsr) {
          root.replaceChildren(); const p = root.ownerDocument.createElement("p");
          p.textContent = text("تعذر تحميل سجل المصداقية. لا نستنتج التأكيد من غياب البيانات.", "Credibility context could not be loaded. Missing data does not imply confirmation.", lang); root.append(p);
        }
      }
      return null;
    } finally { if (mounts.get(root) === marker) root.removeAttribute("aria-busy"); }
  }
  function init() {
    const root = scope.document && scope.document.getElementById("articleTrust");
    if (!root || !articleId(root.dataset.articleId)) return;
    const load = () => mount(root);
    if (scope.IntersectionObserver) {
      const observer = new scope.IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); } }, {rootMargin: "200px"}); observer.observe(root);
    } else load();
    scope.document.addEventListener("wrldline:language", () => mount(root));
  }
  const api = {safeUrl, articleId, status, fetchTrust, render, mount};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { scope.WRLDLINE_TRUST = Object.freeze(api); if (scope.document.readyState === "loading") scope.document.addEventListener("DOMContentLoaded", init, {once: true}); else init(); }
})(typeof window !== "undefined" ? window : globalThis);
