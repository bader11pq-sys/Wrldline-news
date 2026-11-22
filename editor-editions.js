(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const panel = el("editorEdition"), form = el("editionEditorForm"), status = el("editionEditorStatus");
  if (!panel || !form || !status) return;
  const title = el("editionEditorTitle"), body = el("editionEditorBody"), note = el("editionEditorNote"), file = el("editionEditorFile");
  const fields = "id,title,summary,translation_status,translation_source";
  let session = null;
  function say(value) { status.textContent = value; }
  function attach(db, article) {
    form.reset();
    form.hidden = true;
    form.inert = false;
    panel.open = false;
    const source = window.WLArticleEditions?.locale(article?.source_language || article?.lang);
    session = db && article?.id && source ? { db, article, lang: source === "ar" ? "en" : "ar" } : null;
    say(session ? "افتح هذا القسم لتحميل النسخة الأخرى أو كتابتها." : article?.id
      ? "هذا المحرر يربط حاليًا النسختين العربية والإنجليزية فقط."
      : "احفظ المقال الأصلي أو افتح مقالًا محفوظًا لإضافة نسخة أخرى.");
  }
  async function open() {
    const s = session;
    if (!panel.open || !s || s.loaded || s.loading) return;
    s.loading = true;
    say("جارٍ تحميل النسخة المحفوظة…");
    try {
      const { data, error } = await s.db.from("article_translations").select(fields).eq("article_id", s.article.id).eq("lang", s.lang).maybeSingle();
      if (s !== session) return;
      if (error) throw error;
      s.loaded = true;
      if (data && data.translation_source !== "editorial") {
        say("توجد ترجمة آلية قديمة تشغل هذه اللغة. لا يغيّر هذا المحرر أصلها أو يعيد تصنيفها كنسخة تحريرية.");
        return;
      }
      s.row = data;
      title.value = data?.title || "";
      body.value = data?.summary || "";
      el("editionEditorStory").textContent = s.article.title;
      const language = el("editionEditorLanguage");
      language.lang = title.lang = body.lang = s.lang;
      language.textContent = window.WLArticleEditions.languages[s.lang].name;
      form.hidden = false;
      say(data?.translation_status === "published" ? "النسخة معتمدة. إذا حفظت نصًا معدّلًا دون اعتماده، سيعود إلى المراجعة ولن يظهر للقارئ." : "النسخة غير منشورة.");
    } catch {
      if (s === session) say("تعذّر تحميل النسخة. أغلق هذا القسم وافتحه للمحاولة مجددًا.");
    } finally { s.loading = false; }
  }
  panel.addEventListener("toggle", open);
  file.addEventListener("change", async () => {
    const picked = file.files[0], s = session;
    if (!picked || !s) return;
    const previous = body.value;
    file.value = "";
    try {
      if (picked.size > 4000000) throw new Error();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await picked.arrayBuffer());
      if (s !== session || previous !== body.value) return;
      if (!text.trim() || text.length > 1000000) throw new Error();
      if (previous && !confirm("هل تستبدل النص الحالي بمحتوى الملف؟")) return;
      body.value = text;
      say("استُورد النص. لم يُحفظ أو يُنشر بعد.");
    } catch {
      if (s === session) say("استخدم ملفًا نصيًا بترميز UTF-8 لا يتجاوز مليون حرف.");
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const s = session, publish = event.submitter?.id === "editionEditorPublish";
    if (!s?.loaded || s.saving || form.hidden) return;
    const headline = title.value.trim(), text = body.value, review = note.value.trim();
    if (!headline || !text.trim() || text.length > 1000000 || (publish && !review)) {
      say("أدخل العنوان والنص الكامل. يلزم تسجيل ملاحظة مراجعة بشرية للنشر.");
      return;
    }
    const changed = !s.row || s.row.title !== headline || s.row.summary !== text;
    if (!publish && s.row?.translation_status === "published" && !changed) {
      say("لا توجد تعديلات لحفظها. النسخة الحالية ما زالت معتمدة.");
      return;
    }
    s.saving = form.inert = true;
    say("جارٍ حفظ النسخة…");
    try {
      if (changed) {
        const values = { title: headline, summary: text, translation_status: "review" };
        const result = await (s.row
          ? s.db.from("article_translations").update(values).eq("id", s.row.id).eq("translation_source", "editorial").select("id").single()
          : s.db.from("article_translations").insert({ ...values, article_id: s.article.id, lang: s.lang, translation_source: "editorial" }).select("id").single());
        if (result.error) throw result.error;
        s.row = { id: result.data.id, ...values };
      }
      if (publish) {
        const result = await s.db.rpc("review_article_translation", { p_translation_id: s.row.id, p_decision: "published", p_note: review });
        if (result.error) {
          if (s === session) say("حُفظ النص، لكن تعذّر اعتماد النشر. أعد المحاولة؛ النص والملاحظة ما زالا هنا.");
          return;
        }
        s.row.translation_status = "published";
      }
      if (s === session) {
        note.value = "";
        say(publish ? (s.article.editorial_status === "published"
          ? "نُشرت النسخة التحريرية. يمكن للقارئ اختيارها من صفحة المقال."
          : "اعتُمدت النسخة. تظهر للقارئ عند نشر المقال الأصلي.")
          : "حُفظت النسخة دون نشرها.");
      }
    } catch {
      if (s === session) say("تعذّر حفظ النسخة. بقي النص في المحرر؛ أعد المحاولة أو تحقّق من وجود نسخة سابقة لهذه اللغة.");
    } finally {
      s.saving = false;
      if (s === session) form.inert = false;
    }
  });
  const isDirty = () => !form.hidden && !!session && (title.value.trim() !== (session.row?.title || "")
    || body.value !== (session.row?.summary || "") || !!note.value.trim());
  window.WLEditorEditions = { attach, isDirty, saving: () => session?.saving === true };
})();
