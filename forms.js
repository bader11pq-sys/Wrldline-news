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
    const readiness = document.getElementById("newsletterReadiness");
    const submitButton = newsletter.querySelector("button[type=submit]");
    const recheckButton = document.getElementById("newsletterRecheck");
    let emailReady = false;

    async function checkNewsletterReadiness(force = false) {
      submitButton.disabled = true;
      if (recheckButton) recheckButton.disabled = true;
      if (!notification || typeof notification.readiness !== "function") {
        emailReady = false;
        readiness.textContent = "تعذر تحميل وحدة النشرة البريدية. حدّث الصفحة؛ لم يُحفظ بريدك ولم يُرسل أي شيء.";
        if (recheckButton) recheckButton.disabled = false;
        return false;
      }
      try {
        const config = await notification.readiness(force);
        if (config?.unavailable) {
          throw new Error("تعذر الوصول إلى خدمة الإشعارات. تحقق من اتصال الموقع بالخدمة ثم أعد الفحص.");
        }
        emailReady = config?.email_ready === true;
        readiness.textContent = emailReady
          ? "خدمة تأكيد البريد جاهزة. لن يبدأ الإرسال الدوري إلا بعد تأكيد بريدك."
          : "النشرة البريدية غير مفعّلة بعد. يلزم إعداد RESEND_API_KEY وعنوان NEWSLETTER_FROM على نطاق موثّق، ثم تفعيل قناة البريد. لن نحفظ طلبك أو نرسل نشرة قبل الجاهزية.";
        return emailReady;
      } catch {
        emailReady = false;
        readiness.textContent = "تعذر التحقق من جاهزية خدمة البريد. لم يُقبل الاشتراك؛ أعد الفحص لاحقاً.";
        return false;
      } finally {
        submitButton.disabled = !emailReady;
        if (recheckButton) recheckButton.disabled = false;
      }
    }

    recheckButton?.addEventListener("click", () => checkNewsletterReadiness(true));
    void checkNewsletterReadiness();

    newsletter.addEventListener("submit", async event => {
      event.preventDefault();
      if (!newsletter.reportValidity()) return;
      submitButton.disabled = true;
      status.textContent = "جارٍ طلب رسالة التأكيد...";
      status.className = "form-status";
      try {
        if (!(await checkNewsletterReadiness(true))) {
          throw new Error("خدمة البريد غير جاهزة حالياً. لم يتم حفظ الاشتراك أو إرسال رسالة.");
        }
        await notification.request("newsletter_subscribe", {
          email: newsletter.elements.namedItem("email").value.trim(),
          locale: document.documentElement.lang === "en" ? "en" : "ar",
          cadence: newsletter.elements.namedItem("cadence").value,
          topics: [...newsletter.querySelectorAll('[name="topics"]:checked')].map(el => el.value),
          countries: [...newsletter.querySelectorAll('[name="countries"]:checked')].map(el => el.value),
          website: newsletter.elements.namedItem("website")?.value || "",
          consent: newsletter.elements.namedItem("consent").checked === true
        });
        newsletter.reset();
        status.textContent = "استلمنا طلب الاشتراك ووضعنا رسالة التأكيد في طابور الإرسال. لن تصلك النشرة الدورية قبل فتح رابط التأكيد في بريدك.";
        status.className = "form-status ok";
      } catch (e) {
        status.textContent = e.message || "تعذر طلب رسالة التأكيد الآن. حاول لاحقاً.";
        status.className = "form-status error";
      } finally {
        await checkNewsletterReadiness();
      }
    });

    // The inline script scrubs email-token fragments before analytics or external scripts load.
    const intent = window.WRLDLINE_NEWSLETTER_INTENT;
    if (intent) {
      delete window.WRLDLINE_NEWSLETTER_INTENT;
      const panel = document.getElementById("newsletterTokenPanel");
      const button = document.getElementById("newsletterTokenButton");
      const message = document.getElementById("newsletterTokenStatus");
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
        } catch (e) {
          message.textContent = e.message;
          message.className = "form-status error";
          button.disabled = false;
        }
      });
    }
  }
})();
