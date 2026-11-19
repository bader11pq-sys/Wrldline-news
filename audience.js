/* No public event reads and no user/account rows enter this page. */
(function () {
  "use strict";
  const URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const $ = id => document.getElementById(id);
  const number = value => new Intl.NumberFormat("ar").format(Number(value) || 0);
  const categories = { politics: "سياسة", economy: "اقتصاد", security: "أمن ودفاع", tech: "تقنية", sports: "رياضة", culture: "ثقافة", health: "صحة", science: "علوم", environment: "بيئة", society: "مجتمع", world: "حول العالم", uncategorized: "غير مصنف" };
  const pageNames = { home: "الرئيسية", news: "صفحات الأخبار", account: "الحساب", advertise: "أعلن معنا", markets: "الأسواق", map: "الخريطة", history: "التاريخ", newsletter: "النشرة", contact: "التواصل", about: "من نحن", privacy: "الخصوصية", terms: "الشروط", sources: "المصادر", briefing: "الموجز اليومي", other: "أخرى" };
  const arrivals = { direct: "مباشر / إحالة غير متاحة", internal: "داخل الموقع", search: "محركات البحث", social: "شبكات اجتماعية", messaging: "تطبيقات المراسلة", email: "البريد الإلكتروني", other: "مصادر أخرى" };
  const engagements = { scroll_50: "تجاوز ٥٠٪ من منطقة التمرير", scroll_90: "تجاوز ٩٠٪ من منطقة التمرير", share: "مشاركة ناجحة", save: "حفظ ناجح", follow: "متابعة ناجحة", reaction: "تفاعل" };
  let client, revision = 0, authorized = false, disposed = false;
  function status(message, error = false) { $("audienceStatus").textContent = message; $("audienceStatus").classList.toggle("error", error); }
  function duration(seconds) { const value = Math.max(0, Number(seconds) || 0); return value < 60 ? number(Math.round(value)) + " ث" : number(Math.round(value / 60)) + " د"; }
  function clear() {
    revision++; authorized = false;
    $("audienceDashboard").hidden = true;
    for (const id of ["audienceMetrics", "audienceNews", "audiencePages", "audienceArrivals", "audienceCategories", "audienceEngagement", "audienceFunnel", "audienceBilling"]) $(id).replaceChildren();
    $("audienceInsight").textContent = "—"; $("audienceUpdated").textContent = "";
  }
  function metric(title, value, hint) {
    const el = document.createElement("div"); el.className = "metric";
    const label = document.createElement("small"), amount = document.createElement("strong"), note = document.createElement("span");
    label.textContent = title; amount.textContent = value; note.textContent = hint; el.append(label, amount, note); return el;
  }
  function list(id, rows) {
    const host = $(id); host.replaceChildren();
    if (!rows.length) { const p = document.createElement("p"); p.className = "empty"; p.textContent = "لا توجد أحداث مقاسة في هذه النافذة."; host.appendChild(p); return; }
    const max = Math.max(1, ...rows.map(row => Number(row.weight) || 0));
    for (const row of rows) {
      const el = document.createElement("div"), label = document.createElement("div"), title = document.createElement("span"), value = document.createElement("strong");
      el.className = "list-row"; label.className = "list-label"; title.textContent = row.title; value.textContent = row.value; label.append(title, value); el.append(label);
      if (row.weight !== undefined) { const bar = document.createElement("div"), fill = document.createElement("span"); bar.className = "bar"; bar.setAttribute("aria-hidden", "true"); fill.style.width = Math.min(100, Math.max(0, Number(row.weight) / max * 100)) + "%"; bar.appendChild(fill); el.appendChild(bar); }
      host.appendChild(el);
    }
  }
  function render(data) {
    const s = data.summary, f = data.funnel, b = data.billing_snapshot;
    $("audienceMetrics").replaceChildren(
      metric("جلسات مقاسة", number(s.measured_sessions), "الموافقون فقط · ليست أشخاصًا فريدين"),
      metric("جلسات قراءة نشطة", number(s.reading_sessions), "ظهور الخبر + نشاط النافذة"),
      metric("وقت قراءة نشط", duration(s.active_seconds), "مجموع وقت الأخبار المقاس"),
      metric("متصفحات عائدة اختيارياً", number(s.returning_opt_in_browsers), "من " + number(s.opt_in_browsers) + " معرّفًا اختياريًا · ≤ ٧ أيام")
    );
    const top = data.top_news?.[0];
    $("audienceInsight").textContent = s.measured_sessions ? ("رُصدت " + number(s.reading_sessions) + " جلسة قارئة و" + number(s.engagement_events) + " أحداث تفاعل ضمن العينة الموافقة." + (top ? " الخبر الأعلى وقتًا: «" + top.title + "» بمتوسط " + duration(top.avg_active_seconds) + " لكل جلسة قارئة." : "")) : "لا توجد عينة مقاسة بعد. لا يعني ذلك عدم وجود زوار؛ قد يكون القياس مرفوضًا أو غير مفعّل بعد.";
    const table = $("audienceNews"); table.replaceChildren();
    for (const article of data.top_news || []) {
      const tr = document.createElement("tr"), first = document.createElement("td"), link = document.createElement("a");
      if (/^[0-9a-f-]{36}$/i.test(article.article_id)) link.href = "/news/" + article.article_id;
      link.textContent = article.title || "خبر منشور"; first.appendChild(link); tr.appendChild(first);
      for (const value of [number(article.views), number(article.read_sessions), duration(article.active_seconds), duration(article.avg_active_seconds)]) { const td = document.createElement("td"); td.textContent = value; tr.appendChild(td); }
      table.appendChild(tr);
    }
    if (!table.children.length) { const tr = document.createElement("tr"), td = document.createElement("td"); td.colSpan = 5; td.textContent = "لا توجد أخبار مقاسة بعد."; tr.appendChild(td); table.appendChild(tr); }
    list("audiencePages", (data.pages || []).map(row => ({ title: pageNames[row.page] || "أخرى", value: number(row.views) + " مشاهدة · " + number(row.sessions) + " جلسة", weight: row.views })));
    list("audienceArrivals", (data.arrivals || []).map(row => ({ title: arrivals[row.referrer_category] || "أخرى", value: number(row.sessions) + " جلسة", weight: row.sessions })));
    list("audienceCategories", (data.categories || []).map(row => ({ title: categories[row.category] || "غير مصنف", value: duration(row.active_seconds) + " · " + number(row.sessions) + " جلسة", weight: row.active_seconds })));
    list("audienceEngagement", (data.engagement || []).map(row => ({ title: engagements[row.engagement_type] || "تفاعل", value: number(row.events) + " حدث · " + number(row.sessions) + " جلسة", weight: row.events })));
    list("audienceFunnel", [
      { title: "اهتمام PLUS (لا يعني الدفع)", value: number(f.plus_interest_sessions) + " جلسة" },
      { title: "تسجيل حساب (حدث نجاح التطبيق)", value: number(f.account_signup_sessions) + " جلسة" },
      { title: "تسجيل نشرة (حدث نجاح التطبيق)", value: number(f.newsletter_signup_sessions) + " جلسة" },
      { title: "PLUS نشط موثّق من الخادم", value: number(f.verified_active_plus_sessions) + " جلسة" },
      { title: "تحويل مدفوع بإيصال مؤكد", value: "غير متاح من السجل الحالي" }
    ]);
    list("audienceBilling", [
      { title: "اشتراكات PLUS نشطة مرتبطة بمزود الدفع", value: number(b.active_provider_plus) },
      { title: "اشتراكات تجريبية — ليست دفعًا", value: number(b.trialing_plus) }
    ]);
    $("audienceUpdated").textContent = "تحديث: " + new Date(data.generated_at).toLocaleString("ar");
    $("audienceRetention").textContent = "الأحداث ورصد الاشتراك ٣٠ يومًا، وربط المتصفح ٧ أيام؛ التنظيف كل ساعة. " + (data.retention?.cron_installed ? "يجب التحقق تشغيليًا من نجاح مهمة الاحتفاظ." : "تحذير: جدولة الاحتفاظ غير متاحة؛ يجب تفعيلها قبل تشغيل القياس.");
  }
  async function load() {
    const request = ++revision; $("audienceRefresh").disabled = true;
    status("جارٍ تحميل المجاميع المحمية…");
    try {
      const { data: userData, error: authError } = await client.auth.getUser();
      if (request !== revision || disposed) return;
      const role = userData?.user?.app_metadata?.role;
      if (authError || !userData?.user || !["editor", "admin"].includes(role)) {
        clear(); $("audienceAccess").hidden = false;
        status(userData?.user ? "هذا الحساب غير مخوّل لقياس الجمهور." : "سجّل الدخول بحساب تحريري.", true); return;
      }
      // Server RPC checks auth.uid + signed app_metadata independently of this UI.
      const { data, error } = await client.rpc("audience_dashboard", { p_days: Number($("audienceDays").value) });
      if (request !== revision || disposed) return;
      if (error || !data?.summary) throw new Error("Protected aggregate unavailable");
      authorized = true; render(data); $("audienceAccess").hidden = true; $("audienceDashboard").hidden = false;
      status("العينة: المتصفحات الموافقة فقط. لا تُنسب الأرقام إلى جميع الزوار.");
    } catch {
      if (request !== revision || disposed) return;
      clear(); $("audienceAccess").hidden = false;
      status("تعذر تحميل القياس المحمي. تحقق من صلاحية الحساب وتطبيق ترحيل audience analytics؛ لا نعرض أرقامًا بديلة.", true);
    } finally { if (!disposed) $("audienceRefresh").disabled = false; }
  }
  function boot() {
    if (!window.supabase?.createClient) { status("تعذر تحميل عميل الدخول. لا يمكن فتح المجاميع.", true); $("audienceAccess").hidden = false; return; }
    client = window.supabase.createClient(URL, KEY);
    $("audienceRefresh").addEventListener("click", load); $("audienceDays").addEventListener("change", load);
    $("audienceSignout").addEventListener("click", async () => { clear(); await client.auth.signOut(); status("تم تسجيل الخروج."); $("audienceAccess").hidden = false; });
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { clear(); $("audienceAccess").hidden = false; status("تم إغلاق القياس بعد تسجيل الخروج."); }
      else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") setTimeout(load, 0);
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && authorized) void load(); });
    window.addEventListener("pagehide", () => { disposed = true; clear(); });
    window.addEventListener("pageshow", event => { if (event.persisted) { disposed = false; void load(); } });
    void load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
