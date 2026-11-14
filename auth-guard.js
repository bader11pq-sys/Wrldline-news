/* WRLDLINE — authenticated content gate */
(() => {
  "use strict";
  const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const path = location.pathname.split("/").pop() || "index.html";
  const publicPages = new Set(["account.html", "privacy.html", "terms.html"]);
  if (publicPages.has(path)) return;

  document.documentElement.classList.add("wl-auth-pending");
  const pendingStyle = document.createElement("style");
  pendingStyle.textContent = "html.wl-auth-pending body{visibility:hidden!important}html.wl-auth-ready body{visibility:visible!important}";
  document.head.appendChild(pendingStyle);

  function loadSupabase() {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  function gate() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", gate, { once: true }); return; }
    document.documentElement.classList.remove("wl-auth-pending");
    document.documentElement.classList.add("wl-auth-ready", "wl-auth-required");
    let el = document.getElementById("wrldlineAuthGate");
    if (!el) {
      el = document.createElement("section");
      el.id = "wrldlineAuthGate";
      el.className = "wl-auth-gate";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.innerHTML = '<div class="wl-auth-gate__orb" aria-hidden="true">W</div>' +
        '<span class="wl-auth-gate__eyebrow">WRLDLINE · PRIVATE NEWSROOM</span>' +
        '<h1>غرفة الأخبار لك بعد تسجيل الدخول</h1>' +
        '<p>أنشئ حساباً مجانياً أو سجّل الدخول لترى الأخبار، السياق، المرصد، والمحتوى المخصص لك.</p>' +
        '<div class="wl-auth-gate__actions"><a class="wl-auth-gate__primary" href="account.html?next=' + encodeURIComponent(location.pathname + location.search) + '">تسجيل الدخول أو إنشاء حساب</a><a class="wl-auth-gate__secondary" href="privacy.html">اقرأ سياسة الخصوصية</a></div>' +
        '<small>نحمي تجربة القراءة ونستخدم اختياراتك لترتيب الأخبار التي تهمك.</small>';
      document.body.appendChild(el);
    }
    document.body.classList.add("wl-auth-locked");
    document.dispatchEvent(new CustomEvent("wrldline:auth-denied"));
  }
  function allow(session, client) {
    window.WRLDLINE_AUTH = {
      client,
      session,
      user: session?.user || null,
      getSession: () => client.auth.getSession(),
      getAccessToken: async () => (await client.auth.getSession()).data.session?.access_token || ""
    };
    document.documentElement.classList.remove("wl-auth-pending", "wl-auth-required");
    document.documentElement.classList.add("wl-auth-ready");
    document.body?.classList.remove("wl-auth-locked");
    document.dispatchEvent(new CustomEvent("wrldline:auth-ready", { detail: { session } }));
  }
  async function init() {
    try {
      await loadSupabase();
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) gate();
      else allow(data.session, client);
      client.auth.onAuthStateChange((_event, session) => {
        if (session) allow(session, client);
        else gate();
      });
    } catch (error) {
      console.error("WRLDLINE auth gate:", error);
      gate();
    }
  }
  init();
})();
