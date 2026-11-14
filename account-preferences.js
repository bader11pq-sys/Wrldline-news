/* WRLDLINE account preferences */
(() => {
  "use strict";
  const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const categories = [
    ["politics", "سياسة"], ["economy", "اقتصاد وأسواق"], ["security", "أمن ودفاع"], ["tech", "تقنية"],
    ["sports", "رياضة"], ["culture", "ثقافة"], ["health", "صحة"], ["world", "حول العالم"]
  ];
  const countries = [
    ["الإمارات", "الإمارات"], ["السعودية", "السعودية"], ["قطر", "قطر"], ["الكويت", "الكويت"],
    ["البحرين", "البحرين"], ["عمان", "عمان"], ["مصر", "مصر"], ["فلسطين", "فلسطين"],
    ["لبنان", "لبنان"], ["الأردن", "الأردن"], ["سوريا", "سوريا"], ["العراق", "العراق"],
    ["المغرب", "المغرب"], ["الجزائر", "الجزائر"], ["تونس", "تونس"], ["دولي", "العالم"]
  ];
  const $ = id => document.getElementById(id);
  const state = { categories: [], countries: [] };
  const db = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  function status(message, type = "") { const el = $("preferencesStatus"); if (el) { el.textContent = message; el.className = "status preferences-status " + type; } }
  function chips(hostId, items, selected, type) {
    const host = $(hostId); if (!host) return;
    host.innerHTML = items.map(([value, label]) => '<button type="button" class="pref-chip ' + (selected.includes(value) ? "is-selected" : "") + '" data-pref-type="' + type + '" data-pref-value="' + value.replace(/"/g, "&quot;") + '" aria-pressed="' + selected.includes(value) + '">' + label + '</button>').join("");
  }
  function render() {
    chips("prefCategories", categories, state.categories, "category");
    chips("prefCountries", countries, state.countries, "country");
  }
  function toggle(type, value) {
    const key = type === "category" ? "categories" : "countries";
    state[key] = state[key].includes(value) ? state[key].filter(item => item !== value) : [...state[key], value];
    render();
  }
  async function load() {
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    if (!session) return;
    const { data, error } = await db.from("user_preferences").select("followed_categories,followed_countries,notify_breaking,browser_notifications").eq("user_id", session.user.id).maybeSingle();
    if (error) { status("تعذر تحميل التفضيلات حالياً. يمكنك المحاولة لاحقاً.", "error"); return; }
    state.categories = data?.followed_categories || [];
    state.countries = data?.followed_countries || [];
    $("prefBreaking").checked = data?.notify_breaking !== false;
    $("prefBrowser").checked = data?.browser_notifications === true;
    render();
  }
  async function save() {
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    if (!session) { status("سجّل الدخول أولاً لحفظ التفضيلات.", "error"); return; }
    const browserRequested = $("prefBrowser").checked;
    if (browserRequested && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    const browserEnabled = browserRequested && (!window.Notification || Notification.permission === "granted");
    const payload = {
      user_id: session.user.id,
      followed_categories: state.categories,
      followed_countries: state.countries,
      notify_breaking: $("prefBreaking").checked,
      notify_categories: state.categories,
      notify_countries: state.countries,
      browser_notifications: browserEnabled
    };
    const { error } = await db.from("user_preferences").upsert(payload, { onConflict: "user_id" });
    if (error) { status("تعذر حفظ التفضيلات: " + error.message, "error"); return; }
    $("prefBrowser").checked = browserEnabled;
    status("تم حفظ تفضيلاتك. سيُرتب موجز الأخبار وفق اختياراتك.", "ok");
    window.dispatchEvent(new CustomEvent("wrldline:preferences-updated", { detail: payload }));
  }
  function init() {
    if (!$("preferencesSection")) return;
    $("prefCategories")?.addEventListener("click", event => { const button = event.target.closest("[data-pref-type]"); if (button) toggle(button.dataset.prefType, button.dataset.prefValue); });
    $("prefCountries")?.addEventListener("click", event => { const button = event.target.closest("[data-pref-type]"); if (button) toggle(button.dataset.prefType, button.dataset.prefValue); });
    $("savePreferencesButton")?.addEventListener("click", async () => { const button = $("savePreferencesButton"); button.disabled = true; await save(); button.disabled = false; });
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
