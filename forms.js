/* Public form transport. No anonymous direct table writes, private keys, or email tokens are logged. */
(() => {
  "use strict";
  const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const contact = document.getElementById("contactForm");
  if (contact) {
    // Prefill only from a small allow-list; never inject arbitrary text into the message.
    const params = new URLSearchParams(location.search);
    const topic = params.get("topic");
    const topicField = contact.elements.namedItem("topic");
    if (topic && topicField && [...topicField.options].some(o => o.value === topic)) topicField.value = topic;
    const subject = (params.get("subject") || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
    const messageField = contact.elements.namedItem("message");
    if (subject && messageField && !messageField.value.trim()) {
      messageField.value = `[${subject}]\n`;
      messageField.focus();
      messageField.setSelectionRange(messageField.value.length, messageField.value.length);
    }
  }
  if (contact) contact.addEventListener("submit", async event => {
    event.preventDefault();
    const status = document.getElementById("contactStatus"), button = contact.querySelector("button[type=submit]");
    if (!contact.reportValidity()) return;
    button.disabled = true; status.textContent = "جارٍ إرسال الرسالة..."; status.className = "form-status";
    try {
      const response = await fetch(SUPABASE_URL + "/functions/v1/contact-submit", { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15000), body: JSON.stringify({ name: contact.elements.namedItem("name").value.trim(), email: contact.elements.namedItem("email").value.trim(), topic: contact.elements.namedItem("topic").value, message: contact.elements.namedItem("message").value.trim(), page_path: location.pathname, website: contact.elements.namedItem("website")?.value || "", consent: contact.querySelector('input[type="checkbox"][required]')?.checked === true }) });
      if (!response.ok) throw new Error("contact_unavailable");
      if (contact.elements.namedItem("topic").value === "sponsorship") window.WRLDLINE_ANALYTICS?.track("sponsor_contact", { plan: "sponsorship" });
      contact.reset(); status.textContent = "وصلت رسالتك. سنراجعها وفق أولوية الموضوع؛ لا ترسل معلومات سرية أو بطاقات دفع."; status.className = "form-status ok";
    } catch { status.textContent = "تعذر إرسال الرسالة الآن. حاول لاحقًا أو استخدم البريد المنشور في صفحة التواصل."; status.className = "form-status error"; }
    finally { button.disabled = false; }
  });
  const newsletter = document.getElementById("newsletterForm");
  const notification = window.WRLDLINE_NOTIFICATIONS;
  if (newsletter) {
    const status = document.getElementById("newsletterStatus");
    notification?.readiness().then(config => {
      document.getElementById("newsletterReadiness").textContent = config.email_ready ? "خدمة طلب التأكيد متاحة. لا يبدأ الإرسال الدوري قبل تأكيد بريدك." : "خدمة الإرسال غير مفعلة أو غير متاحة حالياً. لا يمكن تفعيل اشتراك أو إرسال بريد حتى اكتمال إعدادها.";
      newsletter.querySelector("button[type=submit]").disabled = !config.email_ready;
    }).catch(() => {
      document.getElementById("newsletterReadiness").textContent = "تعذر التحقق من جاهزية خدمة الإرسال. بقي الاشتراك معطلاً ولم يُحفظ أي بريد.";
      newsletter.querySelector("button[type=submit]").disabled = true;
    });
    newsletter.addEventListener("submit", async event => {
      event.preventDefault(); if (!newsletter.reportValidity()) return;
      const button = newsletter.querySelector("button[type=submit]"); button.disabled = true;
      status.textContent = "جارٍ طلب رسالة التأكيد..."; status.className = "form-status";
      try {
        if (!notification || !(await notification.readiness(true)).email_ready) throw new Error("خدمة الإرسال غير مفعلة الآن. لم يتم تفعيل الاشتراك.");
        await notification.request("newsletter_subscribe", { email: newsletter.elements.namedItem("email").value.trim(), locale: document.documentElement.lang === "en" ? "en" : "ar", cadence: newsletter.elements.namedItem("cadence").value, topics: [...newsletter.querySelectorAll('[name="topics"]:checked')].map(el=>el.value), countries: [...newsletter.querySelectorAll('[name="countries"]:checked')].map(el=>el.value), website: newsletter.elements.namedItem("website")?.value || "", consent: newsletter.elements.namedItem("consent").checked === true });
        newsletter.reset(); status.textContent = "تم استلام طلبك. إذا كان الاشتراك يحتاج تأكيداً فستصلك رسالة عند معالجة الطابور. افتح رابطها وأكّد بريدك؛ لم يبدأ الاشتراك الدوري بعد."; status.className = "form-status ok";
      } catch(e) { status.textContent = e.message || "تعذر طلب التأكيد الآن. حاول لاحقاً."; status.className = "form-status error"; }
      finally { button.disabled = false; }
    });
    // Early inline script scrubbed email token fragment before third-party scripts/analytics loaded.
    const intent = window.WRLDLINE_NEWSLETTER_INTENT;
    if (intent) {
      delete window.WRLDLINE_NEWSLETTER_INTENT;
      const panel = document.getElementById("newsletterTokenPanel"), button = document.getElementById("newsletterTokenButton"), message = document.getElementById("newsletterTokenStatus");
      panel.hidden = false;
      document.getElementById("newsletterTokenTitle").textContent = intent.action === "confirm" ? "تأكيد اشتراك البريد" : "إلغاء اشتراك البريد";
      button.textContent = intent.action === "confirm" ? "أؤكد الاشتراك وفق الاختيارات الواردة في رسالة التأكيد" : "تأكيد إلغاء الاشتراك";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          if (!notification) throw new Error("الخدمة غير متاحة.");
          await notification.request(intent.action === "confirm" ? "newsletter_confirm" : "newsletter_unsubscribe", { token: intent.token });
          intent.token = null;
          message.textContent = intent.action === "confirm" ? "تم تأكيد بريدك واشتراكك. يمكنك الإلغاء من رابط أي رسالة." : "تم إلغاء الاشتراك. لن تتم جدولة نشرات أخرى لهذا البريد.";
          message.className = "form-status ok";
        } catch(e) { message.textContent = e.message; message.className = "form-status error"; button.disabled = false; }
      });
    }
  }
})();
