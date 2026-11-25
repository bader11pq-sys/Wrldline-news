/* WRLDLINE editorial assistant: instant local audit plus optional AI rewriting.
   The local audit is deterministic and runs entirely in the browser. The AI
   action posts the draft to the editorial-assist Edge Function, which requires
   an editor/admin session and never invents facts. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);

  const CLICKBAIT = /(صادم|مفاجأة مدوية|لن تتوقع|لا يصدق|هذا ما حدث|انفجار|كارثة كبرى|فضيحة مدوية|عاجل جدًا|بالفيديو|شاهد الآن)/u;
  const FILLER = /(جدير بالذكر|من الجدير بالذكر|على صعيد آخر|وفي سياق متصل|وفي هذا الإطار|يُذكر أن|الجدير بالذكر)/gu;
  // \b does not work between Arabic letters and spaces, so the verb is matched
  // only when a space follows it ("يتمكن" is not passive voice).
  const PASSIVE = /(?:تم|يتم|جرى|يجري)\s+/gu;
  const LATIN_PUNCT = /[,;?](?=\s*[\u0600-\u06FF])/u;

  const WORDS = value => (String(value || "").trim().match(/[^\s]+/gu) || []).length;
  const SENTENCES = value => (String(value || "").replace(/\n+/g, " ").match(/[^.!?؟]+[.!?؟]+|[^.!?؟]+$/gu) || [])
    .map(s => s.trim()).filter(Boolean);
  const PARAGRAPHS = value => String(value || "").split(/\n+/).map(p => p.trim()).filter(Boolean);

  /** @returns {{issues: Array<{level: string, message: string}>, stats: Record<string, number>}} */
  function audit(title, body) {
    const issues = [];
    const cleanTitle = String(title || "").trim();
    const text = String(body || "");
    const paragraphs = PARAGRAPHS(text);
    const sentences = SENTENCES(text);
    const words = WORDS(text);
    const add = (level, message) => issues.push({ level, message });

    if (!cleanTitle) add("high", "لا يوجد عنوان.");
    else {
      if (cleanTitle.length < 15) add("high", "العنوان قصير جدًا؛ اكتب عنوانًا يوضح من فعل ماذا.");
      if (cleanTitle.length > 110) add("medium", "العنوان طويل (" + cleanTitle.length + " حرفًا) وسيُقص في البطاقات. اجعله أقل من 90 حرفًا.");
      if (CLICKBAIT.test(cleanTitle)) add("high", "العنوان فيه لغة إثارة. الخبر الجيد لا يحتاج «صادم» أو «لن تتوقع».");
      if ((cleanTitle.match(/[:：]/gu) || []).length > 1) add("low", "العنوان فيه أكثر من نقطتين. استخدم نقطتين مرة واحدة على الأكثر.");
      if (/[!]{1,}/u.test(cleanTitle)) add("low", "علامة التعجب لا تُستخدم في عنوان خبري.");
    }

    if (words < 60) add("medium", "النص قصير (" + words + " كلمة). الخبر يحتاج سياقًا: ماذا حدث، من قال، وماذا يعني.");
    if (paragraphs.length === 1 && words > 120) add("medium", "النص فقرة واحدة طويلة. قسّمه إلى فقرات من 2 إلى 4 أسطر.");
    paragraphs.forEach((p, i) => {
      if (p.length > 900) add("medium", "الفقرة " + (i + 1) + " طويلة (" + p.length + " حرفًا). قسّمها.");
    });

    const first = paragraphs[0] || "";
    const firstWords = WORDS(first);
    if (first && (firstWords < 15 || firstWords > 90)) add("low", "الجملة الافتتاحية (المقدمة) " + firstWords + " كلمة. المقدمة الخبرية المثالية بين 25 و60 كلمة.");

    const longSentences = sentences.filter(s => WORDS(s) > 38);
    if (longSentences.length) add("medium", "هناك " + longSentences.length + " جملة أطول من 38 كلمة. قسّمها إلى جملتين.");
    if (sentences.length && words / sentences.length > 30) add("low", "متوسط طول الجملة " + Math.round(words / sentences.length) + " كلمة، وهو أعلى من الإيقاع الخبري المألوف.");

    const filler = (text.match(FILLER) || []).length;
    if (filler >= 3) add("low", "تكرار عبارات حشو (" + filler + " مرات): «جدير بالذكر»، «وفي سياق متصل».");
    const passive = (text.match(PASSIVE) || []).length;
    if (passive >= 5) add("low", "صيغة المبني للمجهول «تم/يتم» تكررت " + passive + " مرات. أسند الفعل إلى فاعله.");

    if (LATIN_PUNCT.test(text)) add("low", "علامات ترقيم لاتينية داخل نص عربي. استخدم «،» و«؟».");
    if (/[ \t]{2,}/u.test(text)) add("low", "مسافات مزدوجة داخل النص.");
    if (/([\u0600-\u06FF])\1{2,}/u.test(text)) add("low", "تكرار حرف بشكل غير طبيعي (مثل «جدًااا»).");

    const numbers = text.match(/\d+(?:[.,]\d+)?/gu) || [];
    if (numbers.length && !/(%|في المئة|بالمئة|مليون|مليار|ألف|ريال|دولار|درهم)/u.test(text)) {
      add("low", "توجد أرقام دون وحدة أو نسبة واضحة. تأكد من أن كل رقم منسوب.");
    }

    const hasQuote = /[«"”]/u.test(text);
    const hasAttribution = /(قال|أعلن|أكد|أوضح|وفق|نقلًا عن|بحسب|مصادر)/u.test(text);
    if (!hasQuote && !hasAttribution) add("low", "لا يوجد اقتباس أو نسبة واضحة لجهة. أضف من قال المعلومة.");

    const stats = {
      words, characters: text.length, paragraphs: paragraphs.length,
      sentences: sentences.length,
      readingMinutes: Math.max(1, Math.round(words / 180))
    };
    return { issues, stats };
  }

  function renderAudit(result) {
    const { issues, stats } = result;
    const order = { high: 0, medium: 1, low: 2 };
    const sorted = [...issues].sort((a, b) => order[a.level] - order[b.level]);
    const node = (tag, text, cls) => {
      const el = document.createElement(tag);
      if (text) el.textContent = text;
      if (cls) el.className = cls;
      return el;
    };
    const wrap = document.createDocumentFragment();
    const summary = node("p", "الكلمات: " + stats.words + " · الفقرات: " + stats.paragraphs +
      " · زمن القراءة نحو " + stats.readingMinutes + " دقيقة");
    summary.className = "assist-stats";
    wrap.append(summary);
    if (!sorted.length) {
      wrap.append(node("p", "لم أجد مشكلة شكلية. راجع الأسماء والأرقام والمصدر قبل النشر.", "assist-ok"));
    } else {
      const list = node("ul");
      list.className = "assist-issues";
      for (const issue of sorted) {
        const item = node("li", issue.message);
        item.dataset.level = issue.level;
        list.append(item);
      }
      wrap.append(list);
    }
    return wrap;
  }

  const state = { busy: false };

  function setStatus(message, tone) {
    const el = $("assistStatus");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.tone = tone || "";
  }

  function showResult(fragment) {
    const host = $("assistResult");
    if (!host) return;
    host.replaceChildren(fragment);
    host.hidden = false;
  }

  function getDraft() {
    const title = $("title")?.value.trim() || "";
    const body = window.WLEditorWorkspace?.getBody?.() ?? $("summary")?.value ?? "";
    return { title, body };
  }

  async function token() {
    const client = window.WRLDLINE_ADMIN_DB;
    if (!client?.auth?.getSession) return "";
    try {
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || "";
    } catch { return ""; }
  }

  async function ai(action) {
    if (state.busy) return;
    const { title, body } = getDraft();
    if (!body.trim()) { setStatus("اكتب النص أولًا.", "error"); return; }
    state.busy = true;
    document.querySelectorAll("#editorialAssist button").forEach(b => { b.disabled = true; });
    setStatus("جارٍ العمل على النص… قد يستغرق حتى نصف دقيقة.", "busy");
    try {
      const access = await token();
      if (!access) throw new Error("انتهت الجلسة. سجّل الدخول من جديد.");
      const response = await fetch("https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/editorial-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + access },
        body: JSON.stringify({ action, title, body, language: $("originalArticleLanguage")?.value || "ar" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || ("HTTP " + response.status));
      setStatus(Array.isArray(payload.notes) && payload.notes.length ? payload.notes[0] : "تم. راجع الاقتراح قبل اعتماده.", "");
      renderAiResult(action, payload);
    } catch (error) {
      setStatus("تعذّر الاتصال بمساعد التحرير: " + (error?.message || String(error)) +
        " — التدقيق السريع يعمل دون اتصال.", "error");
    } finally {
      state.busy = false;
      document.querySelectorAll("#editorialAssist button").forEach(b => { b.disabled = false; });
    }
  }

  function renderAiResult(action, payload) {
    const frag = document.createDocumentFragment();
    const heading = document.createElement("h4");
    heading.textContent = action === "headline" ? "عناوين مقترحة" : action === "tighten" ? "نص مكثّف" : "نص محرَّر";
    frag.append(heading);

    if (action === "headline") {
      const list = document.createElement("ul");
      list.className = "assist-headlines";
      for (const option of (payload.headlines || [])) {
        const item = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "assist-apply";
        btn.textContent = option;
        btn.addEventListener("click", () => {
          const input = $("title");
          if (input) { input.value = option; input.dispatchEvent(new Event("input", { bubbles: true })); }
          setStatus("طُبّق العنوان. يمكنك تعديله.", "ok");
        });
        item.append(btn); list.append(item);
      }
      frag.append(list);
    } else {
      if (payload.title) {
        const titleRow = document.createElement("div");
        titleRow.className = "assist-suggestion";
        const strong = document.createElement("strong");
        strong.textContent = payload.title;
        const apply = document.createElement("button");
        apply.type = "button"; apply.className = "assist-apply"; apply.textContent = "استخدم هذا العنوان";
        apply.addEventListener("click", () => {
          const input = $("title");
          if (input) { input.value = payload.title; input.dispatchEvent(new Event("input", { bubbles: true })); }
          setStatus("طُبّق العنوان.", "ok");
        });
        titleRow.append(strong, apply); frag.append(titleRow);
      }
      const pre = document.createElement("div");
      pre.className = "assist-body";
      pre.dir = "auto";
      for (const paragraph of String(payload.body || "").split(/\n+/)) {
        if (!paragraph.trim()) continue;
        const p = document.createElement("p");
        p.textContent = paragraph;
        pre.append(p);
      }
      frag.append(pre);
      const actions = document.createElement("div");
      actions.className = "assist-actions";
      const applyBody = document.createElement("button");
      applyBody.type = "button"; applyBody.className = "assist-apply"; applyBody.textContent = "طبّق النص في المحرّر";
      applyBody.addEventListener("click", () => {
        if (!confirm("سيستبدل النص الحالي في المحرّر. النسخة المحلية السابقة تُحفظ تلقائيًا قبل الاستبدال.")) return;
        window.WLEditorWorkspace?.persist?.();
        window.WLEditorWorkspace?.setBody?.(payload.body || "");
        $("summary")?.dispatchEvent(new Event("input", { bubbles: true }));
        setStatus("طُبّق النص. راجعه قبل النشر.", "ok");
      });
      actions.append(applyBody);
      if (Array.isArray(payload.notes) && payload.notes.length) {
        const notes = document.createElement("ul");
        notes.className = "assist-issues";
        for (const note of payload.notes) {
          const li = document.createElement("li");
          li.textContent = note; li.dataset.level = "low";
          notes.append(li);
        }
        frag.append(actions, notes);
      } else frag.append(actions);
    }
    showResult(frag);
  }

  function wire() {
    if (!$("editorialAssist")) return;
    $("assistAudit")?.addEventListener("click", () => {
      const { title, body } = getDraft();
      const result = audit(title, body);
      setStatus(result.issues.length ? "وجدت " + result.issues.length + " ملاحظة." : "لا ملاحظات شكلية.", "ok");
      showResult(renderAudit(result));
    });
    $("assistHeadline")?.addEventListener("click", () => void ai("headline"));
    $("assistPolish")?.addEventListener("click", () => void ai("polish"));
    $("assistTighten")?.addEventListener("click", () => void ai("tighten"));

    const exclusive = $("isExclusive"), reasonLabel = $("exclusiveReasonLabel"), reason = $("exclusiveReason");
    const sync = () => {
      if (!exclusive || !reasonLabel) return;
      reasonLabel.hidden = !exclusive.checked;
      if (reason) reason.disabled = !exclusive.checked;
    };
    exclusive?.addEventListener("change", sync);
    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
  else wire();

  window.WLEditorialAssist = { audit, ai, syncExclusive: () => $("isExclusive")?.dispatchEvent(new Event("change")) };
})();
