/* WRLDLINE Web Push: no permission request, subscription, or enablement happens on page load. */
(() => {
  "use strict";
  const config = window.WRLDLINE_NOTIFICATION_CONFIG;
  const OWNER_KEY = "wrldline-push-owner";
  let cachedConfig = null, configTime = 0;
  function owner() { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } }
  function setOwner(value) { try { if (value) localStorage.setItem(OWNER_KEY,value); else localStorage.removeItem(OWNER_KEY); } catch {} }
  async function request(action, payload = {}, session = null) {
    if (!config) throw new Error("الإشعارات غير مهيّأة حالياً.");
    const response = await fetch(config.endpoint, { method: "POST", headers: { apikey: config.publishableKey, "Content-Type": "application/json", ...(session ? { Authorization: "Bearer " + session.access_token } : {}) }, body: JSON.stringify({ action, ...payload }), cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errors = { push_unavailable: "خدمة إشعارات المتصفح غير مفعلة بعد.", email_unavailable: "خدمة النشرة البريدية غير مفعلة بعد؛ لم يُحفظ اشتراك أو يُرسل بريد.", rate_limited: "طلبات كثيرة. حاول لاحقاً.", unauthorized: "سجّل الدخول من جديد.", subscription_owned_elsewhere: "هذا الجهاز مرتبط بحساب آخر. أوقف إشعارات الجهاز ثم أعد المحاولة.", confirmation_expired: "رابط التأكيد غير صالح أو منتهي. اطلب اشتراكاً جديداً.", invalid_request: "راجع الحقول والموافقة قبل المتابعة." };
      throw new Error(errors[data.error] || "تعذر تنفيذ طلب الإشعارات. حاول لاحقاً.");
    }
    return data;
  }
  async function readiness(force = false) {
    if (!force && cachedConfig && Date.now() - configTime < 60000) return cachedConfig;
    try { cachedConfig = await request("config"); configTime = Date.now(); return cachedConfig; }
    catch { cachedConfig = { push_ready: false, email_ready: false, vapid_public_key: null, unavailable: true }; configTime = Date.now(); return cachedConfig; }
  }
  function supported() { return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function iosNeedsInstall() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? !(navigator.standalone || window.matchMedia("(display-mode: standalone)").matches) : false; }
  function keyBytes(value) { const s = value.replace(/-/g,"+").replace(/_/g,"/"); return Uint8Array.from(atob(s + "=".repeat((4-s.length%4)%4)), c => c.charCodeAt(0)); }
  async function gate(reg, enabled, userId = null) {
    const worker = reg?.active || reg?.waiting;
    if (!worker) { if (enabled) throw new Error("انتظر تفعيل التطبيق ثم حاول مجدداً."); return; }
    await new Promise((resolve,reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error("تعذر تحديث حالة الإشعارات على الجهاز.")); },5000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); event.data?.ok ? resolve() : reject(new Error("تعذر تحديث حالة الإشعارات على الجهاز.")); };
      worker.postMessage({ type: "wrldline:push-gate", enabled, user_id: userId },[channel.port2]);
    });
  }
  async function registration(create = false) {
    if (!("serviceWorker" in navigator)) return null;
    let reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg && create) reg = await navigator.serviceWorker.register(config.worker, { scope: "/" });
    if (create) { await reg.update(); reg = await navigator.serviceWorker.ready; }
    return reg;
  }
  async function sessionFor(db) { const { data } = await db.auth.getSession(); return data.session; }
  async function disable(db, capturedSession = null) {
    const reg = await registration();
    // Old deployed workers may not yet acknowledge Push messages. Never block logout when no push subscription exists.
    try { await gate(reg,false); } catch { /* Local unsubscribe below is authoritative for the endpoint. */ }
    setOwner(null);
    const sub = await reg?.pushManager?.getSubscription();
    let serverRemoved = !sub;
    if (sub) {
      const current = capturedSession || (db ? await sessionFor(db) : null);
      try { if (current) { await request("push_delete",{ endpoint: sub.endpoint },current); serverRemoved = true; } } catch { /* always unsubscribe locally, including offline logout */ }
      const removed = await sub.unsubscribe();
      if (!removed) throw new Error("تعذر إيقاف اشتراك الجهاز؛ أوقف إشعارات الموقع من إعدادات المتصفح.");
    }
    return { server_removed: serverRemoved };
  }
  async function enable(db) {
    const current = await sessionFor(db);
    if (!current) throw new Error("سجّل الدخول أولاً.");
    if (iosNeedsInstall()) throw new Error("على iPhone وiPad: أضف الموقع إلى الشاشة الرئيسية من Safari ثم افتحه منها (iOS/iPadOS 16.4 أو أحدث).");
    if (!supported()) throw new Error("المتصفح لا يدعم Push أو الموقع ليس عبر HTTPS.");
    const available = await readiness(true);
    if (!available.push_ready || !available.vapid_public_key) throw new Error("خدمة إشعارات المتصفح غير مفعلة بعد. لم يتم طلب إذن أو تفعيل الاشتراك.");
    if (owner() && owner() !== current.user.id) await disable(db);
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") throw new Error("لم تسمح بإشعارات الموقع. عدّل إعدادات المتصفح إن رغبت بتفعيلها.");
    const reg = await registration(true);
    await gate(reg,false);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !owner()) { await sub.unsubscribe(); sub = null; }
    if (sub?.options?.applicationServerKey) {
      const actual = new Uint8Array(sub.options.applicationServerKey), expected = keyBytes(available.vapid_public_key);
      if (actual.length !== expected.length || actual.some((v,i)=>v !== expected[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(available.vapid_public_key) });
    try {
      await request("push_subscribe", { subscription: sub.toJSON(), consent: true },current);
      const latest = await sessionFor(db);
      if (!latest || latest.user.id !== current.user.id) throw new Error("تغير الحساب. أعد المحاولة.");
      await gate(reg,true,current.user.id);
      setOwner(current.user.id);
      return true;
    } catch(e) { await gate(reg,false).catch(()=>{}); await sub.unsubscribe().catch(()=>{}); setOwner(null); throw e; }
  }
  async function isEnabled(db) {
    const current = await sessionFor(db);
    if (!current || owner() !== current.user.id || !supported() || Notification.permission !== "granted") return false;
    const reg = await registration(), sub = await reg?.pushManager?.getSubscription();
    if (!sub) return false;
    try { return (await request("push_status",{ endpoint: sub.endpoint },current)).subscribed === true; } catch { return false; }
  }
  function observeAuth(db) {
    let previous = null;
    db.auth.getSession().then(({data}) => { previous = data.session; if (!previous || (owner() && owner() !== previous.user.id)) disable(db).catch(()=>{}); });
    return db.auth.onAuthStateChange((_event, next) => {
      const old = previous; previous = next;
      if (!next || (old && old.user.id !== next.user.id) || (owner() && owner() !== next.user.id)) setTimeout(()=>disable(db,old).catch(()=>{}),0);
    });
  }
  window.WRLDLINE_NOTIFICATIONS = { request, readiness, supported, iosNeedsInstall, enable, disable, isEnabled, observeAuth, beforeLogout: disable };
})();
