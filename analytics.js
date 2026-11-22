/* WRLDLINE: measures consenting browsers, never the site's total audience. */
(function () {
  "use strict";
  const config = window.WRLDLINE_ANALYTICS_CONFIG || {};
  const CONSENT = "wrldline:analytics-consent-v2";
  const BROWSER = "wrldline:analytics-browser-v2";
  const SESSION = "wrldline:analytics-session-v2";
  const DAY = 86400000;
  const categories = new Set(["politics", "economy", "security", "tech", "sports", "culture", "health", "science", "environment", "society", "world", "uncategorized"]);
  const names = new Set(["page_view", "view_article", "article_read", "engagement", "signup", "outbound_source_click", "search", "market_view", "newsletter_signup", "sponsor_contact", "plus_interest"]);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ARTICLE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let choice = stored(localStorage, CONSENT);
  if (!choice || choice.version !== 2 || choice.expires <= Date.now() || !["granted", "denied"].includes(choice.state)) choice = null;
  let queue = [], running = false, reading = null, interval = null, flushTimer = null;
  let cleanup = [], controllers = new Set(), generation = 0, dialog = null, session = null;
  let recent = Date.now(), budgetStart = Date.now(), sentInMinute = 0;
  let lastPageSession = "";

  function stored(storage, key) { try { return JSON.parse(storage.getItem(key)); } catch { return null; } }
  function save(storage, key, value) { try { storage.setItem(key, JSON.stringify(value)); } catch { /* memory-only */ } }
  function remove(storage, key) { try { storage.removeItem(key); } catch { /* denied storage */ } }
  function uuid() { try { return crypto.randomUUID(); } catch { return null; } }
  function granted() {
    if (choice?.state === "granted" && choice.expires > Date.now()) return true;
    if (running) stop();
    return false;
  }
  function identifiers() {
    const now = Date.now();
    const idle = Math.max(5, Math.min(30, Number(config.sessionIdleMinutes) || 30)) * 60000;
    session = session || stored(sessionStorage, SESSION);
    if (!session || !UUID.test(session.id) || now - session.last > idle || now < session.last) session = { id: uuid(), last: now };
    if (!session.id) return null;
    session.last = now;
    save(sessionStorage, SESSION, session);
    const out = { session_id: session.id };
    if (choice?.returning === true) {
      let browser = stored(localStorage, BROWSER);
      const ttl = Math.max(1, Math.min(7, Number(config.browserRetentionDays) || 7)) * DAY;
      if (!browser || !UUID.test(browser.id) || now - browser.created >= ttl || now < browser.created) browser = { id: uuid(), created: now };
      if (browser.id) { save(localStorage, BROWSER, browser); out.browser_id = browser.id; }
    }
    return out;
  }
  function page() {
    const path = location.pathname;
    if (/^\/news\/[0-9a-f-]{36}\/?$/i.test(path)) return "news";
    const file = path.split("/").pop() || "index.html";
    const known = { "index.html": "home", "account.html": "account", "advertise.html": "advertise", "markets.html": "markets", "map.html": "map", "history.html": "history", "newsletter.html": "newsletter", "contact.html": "contact", "about.html": "about", "privacy.html": "privacy", "terms.html": "terms", "sources.html": "sources", "daily-briefing.html": "briefing" };
    return known[file] || "other";
  }
  // Parse only hostname. Never transmit or persist document.referrer or a URL/query.
  function arrival() {
    if (!document.referrer) return "direct";
    try {
      const host = new URL(document.referrer).hostname.toLowerCase();
      if (host === location.hostname) return "internal";
      const matches = list => list.some(domain => host === domain || host.endsWith("." + domain));
      if (matches(["mail.google.com", "outlook.live.com", "outlook.office.com", "mail.yahoo.com"])) return "email";
      if (matches(["google.com", "google.co.uk", "google.ae", "google.com.sa", "bing.com", "duckduckgo.com", "yahoo.com", "yandex.com"])) return "search";
      if (matches(["facebook.com", "instagram.com", "x.com", "twitter.com", "linkedin.com", "tiktok.com", "reddit.com"])) return "social";
      if (matches(["t.me", "telegram.org", "web.whatsapp.com", "whatsapp.com"])) return "messaging";
      return "other";
    } catch { return "other"; }
  }
  function device() { return matchMedia("(max-width: 600px)").matches ? "mobile" : matchMedia("(max-width: 1024px)").matches ? "tablet" : "desktop"; }
  function event(name, params) {
    const ids = identifiers(), id = uuid();
    if (!ids || !id) return null;
    const out = { event_id: id, name, occurred_at: new Date().toISOString(), ...ids, page: page(), device_type: device(), locale: document.documentElement.lang === "en" ? "en" : "ar", referrer_category: arrival() };
    if (ARTICLE_UUID.test(params.article_id || "")) out.article_id = params.article_id;
    if (categories.has(params.category)) out.category = params.category;
    if (["news", "editorial", "analysis", "opinion", "sponsored", "unknown"].includes(params.content_type)) out.content_type = params.content_type;
    for (const key of ["has_source_link", "has_query"]) if (typeof params[key] === "boolean") out[key] = params[key];
    if (Number.isInteger(params.results_count) && params.results_count >= 0) out.results_count = Math.min(1000, params.results_count);
    if (["free", "plus", "monthly", "yearly", "newsletter", "sponsorship"].includes(params.plan)) out.plan = params.plan;
    if (name === "article_read" && Number.isInteger(params.active_ms) && params.active_ms > 0) out.active_ms = Math.min(60000, params.active_ms);
    if (name === "engagement" && ["scroll_50", "scroll_90", "share", "save", "follow", "reaction"].includes(params.engagement_type)) out.engagement_type = params.engagement_type;
    if (name === "signup" && ["account", "newsletter"].includes(params.signup_type)) out.signup_type = params.signup_type;
    if (["view_article", "article_read", "outbound_source_click"].includes(name) && !out.article_id) return null;
    if (name === "article_read" && !out.active_ms) return null;
    if (name === "engagement" && !out.engagement_type) return null;
    if (name === "signup" && !out.signup_type) return null;
    return out;
  }
  function track(name, params = {}) {
    if (!granted() || !running || !names.has(name)) return false;
    if (Date.now() - budgetStart >= 60000) { budgetStart = Date.now(); sentInMinute = 0; }
    if (sentInMinute >= 30 || queue.length >= 40) return false;
    const item = event(name, params || {});
    if (!item) return false;
    sentInMinute++; queue.push(item);
    if (queue.length >= 10) flush();
    return true;
  }
  async function transport(body, token) {
    if (!granted() || !running || !config.endpoint || config.enabled === false) return null;
    const controller = new AbortController(), epoch = generation;
    controllers.add(controller);
    try {
      const headers = { "Content-Type": "application/json" };
      if (config.publishableKey) headers.apikey = config.publishableKey;
      if (token) headers.Authorization = "Bearer " + token;
      const response = await fetch(config.endpoint, { method: "POST", headers, body: JSON.stringify(body), mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
      if (epoch !== generation || !granted()) return null;
      return response.ok ? await response.json() : null;
    } catch { return null; } finally { controllers.delete(controller); }
  }
  function flush() {
    if (!granted() || !running) { queue.length = 0; return; }
    // No persistent queue/retry and no sendBeacon/keepalive: withdrawal can abort transport.
    if (!queue.length) return;
    const batch = queue.splice(0, 10);
    void transport({ version: 1, consent: true, operation: "events", events: batch });
  }
  function on(target, name, handler, options) { target.addEventListener(name, handler, options); cleanup.push(() => target.removeEventListener(name, handler, options)); }
  function visible(element) {
    if (!element?.isConnected || element.closest("[hidden], [aria-hidden='true']")) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }
  function active() { return !document.hidden && document.hasFocus() && Date.now() - recent < 60000 && reading && visible(reading.element); }
  function sample() {
    if (!reading) return;
    const now = performance.now(), elapsed = Math.max(0, Math.min(2000, now - reading.tick));
    if (reading.active) reading.pending += elapsed;
    reading.tick = now; reading.active = !!active();
    if (reading.pending >= 15000) reportReading();
  }
  function reportReading() {
    if (!reading || reading.pending < 1000) return;
    const amount = Math.min(60000, Math.round(reading.pending));
    track("article_read", { ...reading.params, active_ms: amount }); reading.pending = 0;
  }
  function endArticle() { if (granted() && reading) { sample(); reportReading(); } reading = null; }
  function beginArticle(article, element) {
    if (!granted() || !running || !article) return false;
    const id = article.article_id || article.id;
    if (!ARTICLE_UUID.test(id || "")) return false;
    if (reading?.params.article_id === id) return true;
    endArticle();
    element = element || document.querySelector("[data-audience-article], #modalContent .modal-article-body, article[data-article-id]");
    if (!element) return false;
    reading = { params: { article_id: id, category: article.category || article.cat }, element, pending: 0, tick: performance.now(), active: false, depths: new Set() };
    recent = Date.now(); reading.active = !!active();
    return true;
  }
  function start() {
    if (running || !granted() || config.enabled === false || !config.endpoint) return;
    running = true; recent = Date.now();
    const ids = identifiers();
    if (ids && lastPageSession !== ids.session_id) { lastPageSession = ids.session_id; track("page_view"); }
    const canonicalArticle = document.querySelector("article[data-article-id], main[data-article-id], [data-audience-article][data-article-id]");
    if (canonicalArticle && /^\/news\/[0-9a-f-]{36}\/?$/i.test(location.pathname)) {
      const article = { article_id: canonicalArticle.dataset.articleId, category: canonicalArticle.dataset.category };
      if (beginArticle(article, canonicalArticle)) track("view_article", article);
    }
    on(document, "wrldline:article-opened", e => beginArticle(e.detail?.article, e.detail?.element));
    on(document, "wrldline:article-closed", endArticle);
    on(document, "visibilitychange", () => { sample(); if (document.hidden) { reportReading(); flush(); } });
    on(window, "blur", () => { sample(); if (reading) reading.active = false; });
    on(window, "focus", () => { recent = Date.now(); sample(); });
    for (const type of ["pointerdown", "keydown", "touchstart"]) on(document, type, () => { recent = Date.now(); }, { passive: true });
    on(document, "scroll", () => {
      recent = Date.now();
      if (!reading || !active()) return;
      const el = reading.element, scroller = el.closest(".modal") || document.scrollingElement;
      const height = scroller.scrollHeight - scroller.clientHeight;
      const depth = height > 0 ? scroller.scrollTop / height : 0;
      for (const threshold of [50, 90]) if (depth * 100 >= threshold && !reading.depths.has(threshold)) {
        reading.depths.add(threshold); track("engagement", { ...reading.params, engagement_type: "scroll_" + threshold });
      }
    }, { capture: true, passive: true });
    on(window, "pagehide", () => { endArticle(); flush(); });
    interval = setInterval(() => {
      if (!granted()) return;
      if (reading && !visible(reading.element)) { sample(); reportReading(); reading.active = false; }
      else sample();
    }, 1000);
    flushTimer = setInterval(flush, 5000);
    flush();
  }
  function clearIdentifiers() {
    remove(localStorage, BROWSER); remove(sessionStorage, SESSION);
    remove(localStorage, "wrldline:analytics-consent"); remove(sessionStorage, "wrldline:analytics-session");
    try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const key = sessionStorage.key(i); if (key?.startsWith("wrldline:analytics-pageview:")) sessionStorage.removeItem(key); } } catch { /* no storage */ }
    session = null; lastPageSession = "";
  }
  function stop() {
    running = false; generation++; queue.length = 0; reading = null;
    clearInterval(interval); clearInterval(flushTimer); interval = flushTimer = null;
    cleanup.splice(0).forEach(fn => fn());
    controllers.forEach(controller => controller.abort()); controllers.clear(); clearIdentifiers();
  }
  function setConsent(state, options = {}) {
    if (!["granted", "denied"].includes(state)) return;
    stop();
    choice = { version: 2, state, returning: state === "granted" && options.returning === true, expires: Date.now() + 180 * DAY };
    save(localStorage, CONSENT, choice); dialog?.remove(); dialog = null;
    if (state === "granted") start();
  }
  function localizeConsent() {
    const en = document.documentElement.lang === "en";
    const copy = (ar, english) => en ? english : ar;
    const settings = document.querySelector(".wrldline-privacy-settings");
    if (settings) settings.textContent = copy("إعدادات قياس الجمهور والخصوصية", "Audience measurement and privacy settings");
    if (!dialog) return;
    dialog.lang = en ? "en" : "ar";
    dialog.dir = en ? "ltr" : "rtl";
    dialog.setAttribute("aria-label", copy("إعداد القياس والخصوصية", "Measurement and privacy settings"));
    const labels = {
      "strong": copy("الخصوصية أولًا.", "Privacy first."),
      "[data-consent-intro]": copy("القياس اختياري للقرّاء الموافقين فقط: الزيارات ووقت القراءة النشط والتفاعل. لا نحفظ نص البحث أو عنوان الخبر أو البريد أو الهاتف أو الروابط الكاملة أو عنوان IP.", "Optional measurement covers visits, active reading time and interaction only with your consent. We do not store search text, article titles, email addresses, phone numbers, full URLs or IP addresses."),
      "[data-consent-returning]": copy("السماح بقياس عودة هذا المتصفح بمعرّف عشوائي يتغير خلال ٧ أيام (اختياري منفصل)", "Allow this browser's return visits to be measured with a random identifier that changes within 7 days (separate and optional)"),
      "[data-consent-policy]": copy("يمكنك سحب الموافقة في أي وقت. السحب يوقف القياس الجديد ولا يحذف تلقائياً أحداثاً سابقة تُمحى بعد ٣٠ يوماً.", "You can withdraw your consent at any time. Withdrawal stops new measurement but does not automatically delete past events, which are deleted after 30 days."),
      "[data-choice=granted]": copy("قبول القياس", "Allow measurement"),
      "[data-choice=denied]": copy("رفض / سحب الموافقة", "Decline or withdraw"),
      "[data-close]": copy("إغلاق", "Close"),
      "a": copy("الخصوصية", "Privacy policy")
    };
    for (const [selector, value] of Object.entries(labels)) dialog.querySelector(selector).textContent = value;
  }
  function openSettings() {
    if (dialog) return;
    dialog = document.createElement("aside"); dialog.className = "wrldline-consent";
    dialog.setAttribute("role", "dialog");
    dialog.dataset.languageManaged = "";
    dialog.innerHTML = '<p><strong></strong> <span data-consent-intro></span></p><label><input type="checkbox" data-returning> <span data-consent-returning></span></label><p data-consent-policy></p><div class="actions"><button type="button" data-choice="granted" data-consent="granted"></button><button type="button" data-choice="denied" data-consent="denied"></button><button type="button" data-close></button><a href="/privacy.html"></a></div>';
    localizeConsent();
    dialog.querySelector("[data-returning]").checked = choice?.returning === true;
    dialog.addEventListener("click", e => {
      const button = e.target.closest("[data-choice]");
      if (button) setConsent(button.dataset.choice, { returning: dialog.querySelector("[data-returning]").checked });
      else if (e.target.closest("[data-close]")) { dialog.remove(); dialog = null; }
    });
    document.body.appendChild(dialog); dialog.querySelector("button").focus();
  }
  async function confirmPlus(accessToken) {
    // A checkout click is never a conversion. JWT + trusted billing record are required.
    if (!granted() || !running) return null;
    const epoch = generation;
    const token = accessToken || await window.WRLDLINE_AUTH?.getAccessToken?.();
    if (!token || epoch !== generation || !granted()) return null;
    const ids = identifiers();
    return ids ? transport({ version: 1, consent: true, operation: "verify_plus", event_id: uuid(), ...ids }, token) : null;
  }
  function boot() {
    const style = document.createElement("style");
    style.textContent = '.wrldline-consent{position:fixed;inset-inline:12px;bottom:12px;z-index:5000;max-width:620px;max-height:85vh;overflow:auto;margin:auto;padding:18px;border:1px solid #3b506a;border-radius:14px;background:#101b2d;color:#f3f6fb;font:13px/1.85 "IBM Plex Sans Arabic",sans-serif;box-shadow:0 16px 50px #0006}.wrldline-consent p{margin:0 0 10px}.wrldline-consent label{display:block;margin:8px 0}.wrldline-consent a{color:#e0b96f}.wrldline-consent .actions{display:flex;gap:8px;flex-wrap:wrap}.wrldline-consent button,.wrldline-privacy-settings{cursor:pointer;font:inherit;padding:8px 12px;border:1px solid #58708b;border-radius:8px;background:#172941;color:#fff}.wrldline-consent button:first-child{background:#e0b96f;color:#172234}.wrldline-consent :focus-visible,.wrldline-privacy-settings:focus-visible{outline:3px solid #e0b96f;outline-offset:3px}.wrldline-privacy-settings{display:block;margin:16px auto;font-size:12px}';
    document.head.appendChild(style);
    const button = document.createElement("button"); button.type = "button"; button.className = "wrldline-privacy-settings"; button.dataset.languageManaged = ""; button.addEventListener("click", openSettings); document.body.appendChild(button);
    localizeConsent();
    document.addEventListener("wrldline:language", localizeConsent);
    document.addEventListener("click", e => { if (e.target.closest?.("[data-analytics-settings]")) { e.preventDefault(); openSettings(); } });
    if (!choice) { clearIdentifiers(); openSettings(); } else if (choice.state === "granted") start(); else clearIdentifiers();
    window.addEventListener("storage", e => {
      if (e.key !== CONSENT) return;
      choice = stored(localStorage, CONSENT); stop(); if (granted()) start();
    });
  }
  window.WRLDLINE_ANALYTICS = Object.freeze({ track, flush, beginArticle, endArticle, confirmPlus, consent: () => granted() ? "granted" : choice?.state === "denied" ? "denied" : null, setConsent, withdraw: () => setConsent("denied"), openSettings, config: Object.freeze({ ...config }) });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
