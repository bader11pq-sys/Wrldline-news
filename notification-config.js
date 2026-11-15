/* Only browser-public configuration belongs here. VAPID private/email/service credentials stay in Edge secrets. */
window.WRLDLINE_NOTIFICATION_CONFIG = Object.freeze({
  endpoint: "https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/notification-center",
  publishableKey: "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx",
  worker: "/sw.js?v=notifications-20261115"
});
