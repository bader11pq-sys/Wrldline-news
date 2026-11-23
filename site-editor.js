/* The reader never initializes the writing surface without a server-confirmed admin. */
(() => {
  "use strict";
  const endpoint = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const key = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  const t = (ar, en) => document.documentElement.lang.startsWith("en") ? en : ar;
  const q = (selector, root = document) => root.querySelector(selector);
  const node = (tag, text, attrs = {}) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  const button = (text, attrs = {}) => node("button", text, { type: "button", ...attrs });
  const option = (value, ar, en) => [value, ar, en];
  const sections = [
    ["politics","سياسة","Politics"],["economy","اقتصاد","Economy"],["security","أمن ودفاع","Security"],
    ["world","حول العالم","World"],["sports","رياضة","Sports"],["tech","تقنية","Technology"],
    ["culture","ثقافة","Culture"],["health","صحة","Health"],["science","علوم","Science"],
    ["environment","بيئة","Environment"],["society","مجتمع","Society"],["uncategorized","غير مصنّف","Uncategorized"]
  ];
  const states = [
    ["published","منشور","Published"],["draft","مسودة خاصة","Private draft"],
    ["review","قيد المراجعة","In review"],["rejected","مستبعد","Unpublished"]
  ];
  const trustStates = [["unconfirmed","غير مؤكد","Unconfirmed"],["disputed","مختلف عليه","Disputed"],["confirmed","مؤكد","Confirmed"]];
  const translationStates = [["pending","تحتاج مراجعة","Needs review"],["reviewed","راجعتها بشريًا","Reviewed by me"],["not_required","لا تحتاج ترجمة","Not translated"]];
  const mediaTypes = [["image","صورة","Image"],["video","فيديو","Video"]];
  const contentKinds = [["news","خبر","News"],["analysis","تحليل","Analysis"],["opinion","رأي","Opinion"],["sponsored","محتوى مدعوم","Sponsored"]];
  const evidenceKinds = [
    ["independent_report","تقرير مستقل","Independent report"],["official_statement","بيان رسمي","Official statement"],
    ["field_report","تقرير ميداني","Field report"],["primary_document","وثيقة أولية","Primary document"],
    ["contradiction","دليل معارض","Contradiction"],["correction","تصحيح","Correction"],["retraction","سحب","Retraction"]
  ];
  let client, permitted = false, userId, roleGeneration = 0, surface, storyButtonId, authRetryAt = 0, callback;
  let dialog, dirty = false, reviewDirty = false, busy = false, selected, focusReturn, publishOriginal, reviewFocus = "", loadedTools;
  let channel;
  try { channel = new BroadcastChannel("wrldline:publication"); } catch {}

  function applyRole(allowed) {
    const changed = permitted !== (allowed === true);
    permitted = allowed === true;
    if (permitted && !q("#wlSiteEditorStyles")) {
      document.head.append(node("link", null, { id:"wlSiteEditorStyles", rel:"stylesheet", href:"/site-editor.css?v=20261123-live-breaking" }));
    }
    if (!permitted) {
      dialog?.close();
      dialog?.remove();
      dialog = null;
      focusReturn = null;
      dirty = reviewDirty = busy = false;
      selected = loadedTools = null;
    }
    if (changed) syncButtons();
  }
  async function authorize(session) {
    const generation = ++roleGeneration;
    if (userId !== session?.user?.id) applyRole(false);
    userId = session?.user?.id;
    if (!userId || session.user.app_metadata?.role !== "admin") { applyRole(false); return; }
    authRetryAt = Date.now() + 30_000;
    try {
      const { data, error } = await client.rpc("site_editor", { p_action:"access" });
      if (generation === roleGeneration) applyRole(!error && data === true);
    } catch { if (generation === roleGeneration) applyRole(false); }
  }
  function attach(db, afterSave) {
    if (afterSave) callback = afterSave;
    if (!db || client) return;
    client = db;
    client.auth.onAuthStateChange((_event, session) => setTimeout(() => void authorize(session), 0));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && userId && Date.now() > authRetryAt) {
        void client.auth.getSession().then(({data}) => authorize(data?.session)).catch(() => applyRole(false));
      }
    });
  }
  async function rpc(action, id, version, values) {
    const generation = roleGeneration, owner = userId;
    if (!permitted) throw { code:"42501" };
    const args = { p_action:action };
    if (id) args.p_id = id;
    if (version) args.p_version = version;
    if (values) args.p_values = values;
    const { data, error } = await client.rpc("site_editor", args);
    if (userId !== owner || !permitted) throw { code:"42501" };
    if (error) {
      // The article trust engine can also raise 42501 for an invalid human review.
      if (generation === roleGeneration && error.code === "42501" && (error.message === "Admin access required" || action === "load" || action === "queue")) applyRole(false);
      throw error;
    }
    return data;
  }
  function composerButton(action, ar, en, className, id = null) {
    const label = t(ar,en);
    const el = button(null, { class:`wl-edit-entry ${className || ""}`, "data-site-editor":action, "data-language-managed":"", "aria-label":label, "aria-haspopup":"dialog" });
    const icon = node("span", action === "compose" ? "+" : "✎", { "aria-hidden":"true" });
    el.append(icon, node("span",label));
    el.addEventListener("click", () => void open(id, el));
    return el;
  }
  function syncButtons() {
    document.querySelectorAll("[data-site-editor]").forEach(el => el.remove());
    if (!permitted) return;
    const compose = q("[data-site-editor-main]") || q(".public-news-header .wl-masthead");
    if (compose) compose.append(composerButton("compose","اكتب","Write","wl-edit-compose"));
    if (surface?.isConnected && uuid.test(storyButtonId || "")) {
      surface.prepend(composerButton("edit","تحرير","Edit story","wl-edit-story",storyButtonId));
    }
    syncRows();
  }
  function syncRows(root = document) {
    if (!permitted) return;
    root.querySelectorAll("[data-site-editor-row]").forEach(row => {
      const id=row.dataset.siteEditorRow;
      if (uuid.test(id || "") && !q('[data-site-editor="edit"]',row)) {
        (q(".story-meta",row) || row).append(composerButton("edit","تحرير","Edit story","wl-edit-story",id));
      }
    });
  }
  function setStory(id, host) {
    surface?.querySelector('[data-site-editor="edit"]')?.remove();
    storyButtonId = id;
    surface = host;
    if (permitted && surface?.isConnected && uuid.test(id || "")) surface.prepend(composerButton("edit","تحرير","Edit story","wl-edit-story",id));
  }
  async function bootstrapPublic() {
    if (client) return;
    // No extra SDK download for a visitor. Presence of storage is only a loading hint.
    try { if (!localStorage.getItem("sb-vmaxbnogmmfyrcucapnq-auth-token")) return; } catch { return; }
    try {
      if (!window.supabase?.createClient) await import("/vendor/supabase-2.119.0.js");
      attach(window.supabase?.createClient(endpoint, key, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:false } }));
    } catch { /* The public article remains readable without an account. */ }
  }

  function field(form, name, label, kind = "text", opts = {}) {
    const wrap = node("label", null, { class:`wl-edit-field${opts.wide ? " is-wide" : ""}` });
    const caption = node("span", label);
    const ctl = node(kind === "textarea" || kind === "select" ? kind : "input", null, { name });
    if (ctl.tagName === "INPUT") ctl.type = kind;
    if (opts.max) ctl.maxLength = opts.max;
    if (opts.required) ctl.required = true;
    if (opts.placeholder) ctl.placeholder = opts.placeholder;
    if (opts.value != null && kind !== "checkbox") ctl.value = opts.value;
    if (kind === "select") {
      for (const [value, ar, en] of opts.options) ctl.append(node("option",t(ar,en),{value}));
      if (opts.value != null && ![...ctl.options].some(o => o.value === opts.value)) ctl.append(node("option",opts.value,{ value:opts.value }));
      if (opts.value != null) ctl.value = opts.value;
    }
    if (kind === "checkbox") { ctl.checked = opts.value === true; wrap.classList.add("is-check"); wrap.append(ctl, caption); }
    else {
      if (kind !== "select" && kind !== "datetime-local") ctl.dir = kind === "url" ? "ltr" : "auto";
      wrap.append(caption, ctl);
    }
    if (opts.hint) wrap.append(node("small",opts.hint));
    form.append(wrap);
    return ctl;
  }
  function values(form) {
    return Object.fromEntries([...form.elements].filter(el => el.name).map(el => [
      el.name, el.type === "checkbox" ? el.checked : el.type === "datetime-local" ?
        (el.value ? new Date(el.value).toISOString() : null) :
        (el.tagName === "TEXTAREA" && ["summary"].includes(el.name) ? el.value : el.value.trim()) || null
    ]));
  }
  function say(message, type = "") {
    const target = dialog && q(".wl-edit-status",dialog);
    if (!target) return;
    target.textContent = message;
    target.dataset.state = type;
  }
  function explain(error) {
    if (error?.code === "40001") return t("تغيّر المحتوى في نافذة أخرى. نصّك ما زال هنا؛ انسخه قبل إعادة فتح الخبر لدمج التعديلات.","This story changed elsewhere. Your text is still here; copy it before reopening to merge changes.");
    if (error?.code === "23505") return t("هذا الرابط أو السجل مستخدم بالفعل. راجع القيمة وحاول مرة أخرى.","This link or entry already exists. Check it and retry.");
    if (error?.code === "P0002") return t("لم يعد هذا المحتوى متاحًا.","This content is no longer available.");
    if (error?.message === "Publication gate did not permit this story") return t("منعت سياسة النشر ظهور المادة. راجع العنوان والمصدر واللغة والقسم، أو احفظها كمسودة. نصك ما زال هنا.","The publication policy blocked this story. Check its headline, source, language, and section, or save it as a draft. Your text is still here.");
    if (error?.message === "Existing machine translation requires the review queue") return t("هذه ترجمة آلية موجودة؛ راجعها من قائمة الترجمات في لوحة التحرير.","This is an existing machine translation. Use the dashboard’s translation review queue.");
    if (/claim|evidence|translation|human.*review/i.test(error?.message || "") && /^(22|23|P0|42501)/.test(error?.code || "")) {
      return t("تعذّر اعتماد المراجعة. تحقق من الأدلة الداعمة، حالة الادعاءات وملاحظة المراجعة البشرية.","Review could not be recorded. Check supporting evidence, claim statuses and the human review note.");
    }
    return t("تعذّر إكمال العملية. راجع الحقول والاتصال وحاول مرة ثانية. لم نمسح النص.","Could not complete the action. Check the fields and your connection, then retry. Your text wasn’t cleared.");
  }
  function setBusy(value) {
    busy = value;
    const main = dialog && q(".wl-edit-panel",dialog);
    if (!main) return;
    main.inert = value;
    q(".wl-edit-tabbar",dialog).inert = value;
    dialog.setAttribute("aria-busy",String(value));
  }
  function ask(text, yes, onCancel) {
    const box = q(".wl-edit-confirm",dialog);
    const previous = document.activeElement;
    box.replaceChildren(node("p",text));
    const ok = button(t("متابعة","Continue"),{class:"wl-edit-primary"});
    const cancel = button(t("إلغاء","Cancel"));
    function finish(accepted) {
      box.hidden = true;
      q(".wl-edit-panel",dialog).inert = false;
      q(".wl-edit-tabbar",dialog).inert = false;
      if (accepted) yes(); else { previous?.focus(); onCancel?.(); }
    }
    ok.onclick = () => finish(true); cancel.onclick = () => finish(false);
    box.append(cancel,ok); box.hidden = false;
    q(".wl-edit-panel",dialog).inert = true; q(".wl-edit-tabbar",dialog).inert = true;
    cancel.focus();
  }
  function leave() {
    if (busy) return;
    const confirmation = q(".wl-edit-confirm",dialog);
    if (!confirmation.hidden) { confirmation.querySelector("button")?.click(); return; }
    if (dirty || reviewDirty) ask(t("عند الإغلاق ستفقد التعديلات غير المحفوظة. هل تريد المتابعة؟","Closing will discard unsaved changes. Continue?"),() => dialog.close());
    else dialog.close();
  }
  function makeDialog() {
    const d = node("dialog",null,{class:"wl-site-editor","aria-labelledby":"wlEditHeading","data-language-managed":""});
    const top = node("header",null,{class:"wl-edit-top"});
    const title = node("div");
    title.append(node("small",t("غرفة الأخبار · المدير","Newsroom · Admin"),{class:"wl-edit-kicker"}),node("h2",t("اكتب","Write"),{id:"wlEditHeading"}));
    const close = button("×",{class:"wl-edit-close","aria-label":t("إغلاق المحرر","Close editor")});
    close.onclick = leave; top.append(title,close);
    const tabs = node("nav",null,{class:"wl-edit-tabbar","aria-label":t("أدوات الكتابة","Writing tools")});
    const confirm = node("div",null,{class:"wl-edit-confirm",role:"group","aria-label":t("تأكيد العملية","Confirm action")});
    confirm.hidden = true;
    d.append(top,tabs,confirm,node("div",null,{class:"wl-edit-status",role:"status","aria-live":"polite"}),node("section",null,{class:"wl-edit-panel"}));
    d.addEventListener("cancel", ev => { ev.preventDefault(); leave(); });
    d.addEventListener("close",() => {
      if (dialog !== d || d.open) return;
      d.remove(); dialog = null; selected = loadedTools = null; dirty = reviewDirty = busy = false;
      if (focusReturn?.isConnected) focusReturn.focus();
      focusReturn = null;
    });
    document.body.append(d); return d;
  }
  function tabs(active) {
    const tabBar = q(".wl-edit-tabbar",dialog);
    tabBar.replaceChildren();
    const items = [
      ["write",t("الكتابة","Write"),() => renderWriter()],
      ["queue",t("مسودات ومراجعة","Drafts & review"),() => void renderQueue()],
      ["trust",t("المصداقية","Credibility"),() => void renderReview("trust"),!selected?.id],
      ["edition",t("النسخة الأخرى","Other edition"),() => void renderReview("edition"),!selected?.id]
    ];
    tabBar.dataset.active = active;
    for (const [name, label, action, hidden] of items) {
      if (hidden) continue;
      const el = button(label,{"aria-pressed":String(active === name)});
      el.onclick = () => {
        if (busy || active === name) return;
        if (dirty || reviewDirty) ask(t("احفظ التعديلات قبل تغيير القسم، أو تابع لتجاهلها.","Save edits before switching, or continue to discard them."),() => { dirty = reviewDirty = false; action(); });
        else action();
      };
      tabBar.append(el);
    }
  }
  async function open(id, trigger) {
    if (!permitted || dialog?.open || (id && !uuid.test(id))) return;
    focusReturn = trigger;
    dialog = makeDialog();
    dialog.showModal();
    if (id) await load(id);
    else renderWriter();
  }
  async function load(id) {
    const owner = dialog;
    say(t("جارٍ تحميل النص الكامل…","Loading full story…"));
    setBusy(true);
    try {
      const result = await rpc("load",id);
      if (owner !== dialog) return;
      selected = result; loadedTools = null; dirty = reviewDirty = false;
      renderWriter();
    } catch (error) { if (owner === dialog) say(explain(error),"error"); }
    finally { if (owner === dialog) setBusy(false); }
  }
  function localDate(value) {
    const date = new Date(value || "invalid");
    return Number.isFinite(+date) ? new Date(+date - date.getTimezoneOffset()*60_000).toISOString().slice(0,16) : "";
  }
  function renderWriter() {
    const editing = !!selected?.id, a = selected || {};
    const host = q(".wl-edit-panel",dialog);
    q("#wlEditHeading",dialog).textContent = editing ? t("تحرير المحتوى","Edit story") : t("اكتب خبرًا أو مقالًا","Write a story");
    tabs("write"); say(""); host.replaceChildren();
    const form = node("form",null,{class:"wl-edit-form"});
    const quick = node("div",null,{class:"wl-edit-quick"});
    const articleMode = value => /^WRLDLINE(?: NEWS)?$/i.test(value || "");
    const type = field(quick,"format",t("طريقة الكتابة","Format"),"select",{
      options:[option("news","خبر","News"),option("editorial","مقال من ورلدلاين","WRLDLINE article")],
      value:articleMode(a.source_name) ? "editorial" : "news"
    });
    const title = field(quick,"title",t("العنوان","Headline"),"text",{value:a.title,max:300,required:true,wide:true,placeholder:t("اكتب عنوانًا واضحًا","Give your story a headline")});
    const body = field(quick,"summary",t("النص الكامل","Full text"),"textarea",{
      value:a.summary,max:1000000,required:true,wide:true,placeholder:t("اكتب أو الصق الخبر هنا…","Write or paste your story…")
    });
    body.rows = 8;
    const tools = node("div",null,{class:"wl-edit-toolbar"});
    const heading = button(t("عنوان فرعي","Subheading"));
    const bullet = button(t("قائمة نقطية","Bullet list"));
    const preview = button(t("معاينة","Preview"),{"aria-expanded":"false"});
    const count = node("small");
    const rendered = node("div",null,{class:"wl-edit-preview"});
    rendered.hidden = true;
    function stats() {
      count.textContent = new Intl.NumberFormat(document.documentElement.lang).format(body.value.trim() ? body.value.trim().split(/\s+/u).length : 0) + t(" كلمة"," words");
      if (!rendered.hidden) void showPreview();
    }
    function insert(prefix) {
      const start = body.selectionStart, end = body.selectionEnd;
      body.setRangeText((start && body.value[start-1] !== "\n" ? "\n" : "") + prefix + body.value.slice(start,end),start,end,"end");
      dirty = true; stats(); body.focus();
    }
    heading.onclick = () => insert("## "); bullet.onclick = () => insert("- ");
    async function showPreview() {
      try { if (!window.WLReaderProse) await import("/reader-prose.js?v=20261122-longread1"); } catch {}
      if (!rendered.isConnected || rendered.hidden) return;
      const h = node("h3",title.value || t("بدون عنوان","Untitled"),{dir:"auto"}), prose=node("div",null,{class:"reader-prose"});
      rendered.replaceChildren(h,prose);
      if (window.WLReaderProse) window.WLReaderProse.renderInto(prose, body.value.slice(0,50_000), { lang:form.elements.lang.value,editorial:type.value === "editorial" });
      else prose.textContent = body.value.slice(0,50_000);
      if (body.value.length>50_000) rendered.append(node("small",t("المعاينة تعرض بداية المقال. سيُحفظ النص كاملًا.","Preview shows the start. The complete text will be saved.")));
    }
    preview.onclick = () => { rendered.hidden = !rendered.hidden; preview.setAttribute("aria-expanded",String(!rendered.hidden)); if (!rendered.hidden) void showPreview(); };
    body.addEventListener("input", stats);
    title.addEventListener("input", () => { if (!rendered.hidden) void showPreview(); });
    tools.append(heading,bullet,preview,count);
    const details = node("details",null,{class:"wl-edit-details"});
    details.append(node("summary",t("إعدادات النشر والتفاصيل","Publishing & details")));
    const grid = node("div",null,{class:"wl-edit-grid"});
    const language = [["ar","العربية","Arabic"],["en","الإنجليزية","English"]];
    const source = field(grid,"source_name",t("اسم المصدر / الناشر","Source / publisher"),"text",{value:a.source_name || t("هيئة التحرير","Editorial desk"),max:200,required:true});
    type.onchange = () => {
      if (type.value === "editorial") source.value = "WRLDLINE NEWS";
      else if (articleMode(source.value)) source.value = t("هيئة التحرير","Editorial desk");
      if (!rendered.hidden) void showPreview();
    };
    field(grid,"author",t("اسم الكاتب","Byline"),"text",{value:Array.isArray(a.author)?a.author.join(", "):typeof a.author==="string"?a.author:"",max:200});
    field(grid,"category",t("القسم","Section"),"select",{options:sections,value:a.category || "uncategorized"});
    field(grid,"event_country",t("دولة الحدث","Event country"),"text",{value:a.event_country,max:80});
    field(grid,"lang",t("لغة النص الحالي","Text language"),"select",{options:language,value:a.lang || document.documentElement.lang.slice(0,2)});
    const originalLang = field(grid,"source_language",t("لغة المصدر الأصلية","Original source language"),"select",{options:language,value:a.source_language || a.lang || document.documentElement.lang.slice(0,2)});
    grid.querySelector('[name="lang"]').onchange = () => { if (!editing) originalLang.value=grid.querySelector('[name="lang"]').value; if (!rendered.hidden) void showPreview(); };
    const kind=field(grid,"content_type",t("تصنيف المحتوى","Content label"),"select",{options:contentKinds,value:a.content_type || "news"});
    const status=field(grid,"editorial_status",t("حالة النشر","Status"),"select",{options:states,value:!a.editorial_status || a.editorial_status==="draft" ? "published" : a.editorial_status});
    const date = field(grid,"published_at",t("تاريخ النشر (اختياري)","Publication date (optional)"),"datetime-local",{
      value:a.editorial_status === "published" ? localDate(a.published_at) : "",hint:t("بتوقيت جهازك. اتركه فارغًا للنشر الآن.","Your device’s timezone. Leave blank to publish now.")
    });
    field(grid,"source_url",t("رابط المصدر الأصلي","Original source URL"),"url",{value:a.source_url,max:2048,placeholder:"https://…"});
    field(grid,"image_url",t("رابط الصورة أو الفيديو","Image or video URL"),"url",{value:a.image_url,max:2048});
    field(grid,"media_type",t("نوع الوسائط","Media type"),"select",{options:mediaTypes,value:a.media_type || "image"});
    const sponsorName=field(grid,"sponsor_name",t("اسم الراعي","Sponsor name"),"text",{value:a.sponsor_name,max:120});
    const sponsorUrl=field(grid,"sponsor_url",t("رابط الراعي","Sponsor URL"),"url",{value:a.sponsor_url,max:2048});
    field(grid,"correction_note",t("تصحيح علني للقارئ","Public correction"),"textarea",{value:a.correction_note,max:1200,wide:true});
    const alert = node("div",null,{class:"wl-edit-breaking"});
    const breaking = field(alert,"is_breaking",t("خبر عاجل","Breaking news"),"checkbox",{value:a.is_breaking});
    const alertHint = node("small",t("بعد النشر: ٥ دقائق في الشريط الأحمر، و١٥ دقيقة في قسم العاجل، من وقت النشر.","After publication: 5 minutes in the red ticker and 15 minutes in Breaking News, timed from publication."),{id:"wlEditBreakingHint"});
    alert.append(alertHint);
    breaking.setAttribute("aria-describedby",alertHint.id);
    const exclusive=field(grid,"is_exclusive",t("أبرز كخبر حصري","Mark as exclusive"),"checkbox",{value:a.is_exclusive});
    const reason=field(grid,"exclusive_reason",t("ما دليل الحصرية؟","Basis for exclusivity"),"textarea",{value:a.exclusive_reason,max:1200,wide:true});
    function switches() {
      const sponsored=kind.value === "sponsored";
      for (const ctl of [sponsorName,sponsorUrl]) { ctl.closest("label").hidden = !sponsored; ctl.disabled = !sponsored; }
      sponsorName.required=sponsored;
      reason.closest("label").hidden=!exclusive.checked; reason.disabled=!exclusive.checked; reason.required=exclusive.checked && !a.is_exclusive;
      save.textContent = status.value === "published" ? (a.editorial_status === "published" ? t("حفظ التعديلات","Save changes") : breaking.checked ? t("نشر خبر عاجل","Publish breaking news") : t("نشر الآن","Publish now")) : t("حفظ","Save");
      save.classList.toggle("wl-edit-publish-breaking", status.value === "published" && breaking.checked && a.editorial_status !== "published");
    }
    details.append(grid);
    const footer = node("div",null,{class:"wl-edit-footer"});
    const save = button("",{type:"submit",class:"wl-edit-primary",value:"save"});
    const draft = button(t("حفظ مسودة","Save draft"),{type:"submit",value:"draft"});
    const live = a.id && a.editorial_status === "published" ? node("a",t("عرض المنشور","View published"),{href:"/news/"+a.id}) : null;
    if (live) footer.append(live);
    if (a.editorial_status !== "published") footer.append(draft);
    footer.append(save);
    kind.onchange=switches; status.onchange=switches; exclusive.onchange=switches; breaking.onchange=switches;
    switches();
    form.append(alert,quick,tools,rendered,details,footer);
    const initial=values(form);
    form.addEventListener("invalid", ev => { if (details.contains(ev.target)) details.open=true; },true);
    form.addEventListener("input",() => { dirty = true; });
    form.onsubmit = ev => {
      ev.preventDefault();
      if (busy || !permitted) return;
      const payload = values(form);
      delete payload.format;
      if (ev.submitter === draft) payload.editorial_status="draft";
      if (date.value === localDate(a.published_at) && a.editorial_status === "published") payload.published_at=a.published_at;
      if (!date.value && payload.editorial_status !== "published" && a.published_at) payload.published_at=a.published_at;
      const desiredStatus=payload.editorial_status;
      if (editing) {
        for (const prop of Object.keys(payload)) {
          if (prop==="editorial_status" || prop==="published_at") continue;
          if (payload[prop]===initial[prop]) delete payload[prop];
        }
        if (payload.published_at===a.published_at) delete payload.published_at;
      }
      if (a.editorial_status === "published" && desiredStatus !== "published") {
        ask(t("سيختفي الخبر من صفحات القرّاء. يمكنك إعادة نشره لاحقًا.","Readers will no longer see this story. You can publish it again later."),()=>void saveWriter(payload));
      } else void saveWriter(payload);
    };
    host.append(form); stats();
    queueMicrotask(() => { if (title.isConnected) title.focus({preventScroll:true}); });
  }
  function publishEvent(article, previous) {
    if (article.editorial_status !== "published" && previous !== "published") return;
    channel?.postMessage({type:"published"});
    document.dispatchEvent(new Event("wrldline:publication"));
    callback?.(article,previous);
  }
  async function saveWriter(payload) {
    const owner = dialog, previous = selected?.editorial_status;
    setBusy(true); say(t("جارٍ الحفظ…","Saving…"));
    try {
      const value = await rpc("save",selected?.id,selected?.version,payload);
      if (dialog !== owner) return;
      selected = value; dirty = false; renderWriter();
      say(value.editorial_status === "published" ?
        (value.audience_lane === "leisure" ? t("حُفظت المادة في الأرشيف الرياضي، دون ظهورها في الموجز الرئيسي أو صفحة خبر مستقلة.","Saved to the sports archive. This story does not appear in the main feed or on a standalone article page.") :
          previous === "published" ? t("حُفظت التعديلات على الموقع.","Changes saved.") : t("تم النشر على الموقع.","Published.")) :
        value.editorial_status === "draft" ? t("حُفظت المسودة الخاصة.","Private draft saved.") : t("حُفظ المحتوى دون نشره.","Saved without publishing."),"success");
      publishEvent(value,previous);
    } catch(error) { if (dialog === owner) say(explain(error),"error"); }
    finally { if (dialog === owner) setBusy(false); }
  }
  async function renderQueue() {
    const host = q(".wl-edit-panel",dialog);
    tabs("queue"); say(""); host.replaceChildren();
    const form = node("form",null,{class:"wl-edit-queue-search"});
    const search = field(form,"query",t("بحث في المحتوى غير المنشور","Search unpublished content"),"search",{max:160});
    form.append(button(t("ابحث","Search"),{type:"submit"}));
    const listing = node("div",null,{class:"wl-edit-queue"});
    const newStory=button(t("كتابة محتوى جديد","Write a new story"));
    newStory.onclick = () => { selected = null; renderWriter(); };
    host.append(form,listing,newStory);
    let run=0;
    const loadQueue = async () => {
      const version=++run;
      listing.textContent=t("جارٍ التحميل…","Loading…");
      try {
        const rows=await rpc("queue",null,null,{query:search.value});
        if (!listing.isConnected || version!==run) return;
        listing.replaceChildren();
        if (!rows.length) listing.append(node("p",t("ما فيه محتوى غير منشور مطابق للبحث.","No matching unpublished stories.")));
        for (const row of rows) {
          const item=button(null,{class:"wl-edit-queue-item"});
          item.append(node("strong",row.title,{dir:"auto"}),node("small",t(...(states.find(opt=>opt[0]===row.editorial_status) || states[1]).slice(1))));
          item.onclick=()=>void load(row.id); listing.append(item);
        }
      } catch(error) { if (listing.isConnected && version===run) listing.textContent=explain(error); }
    };
    form.onsubmit=ev=>{ev.preventDefault();void loadQueue();};
    search.focus(); await loadQueue();
  }
  async function reviewWrite(action,payload,message) {
    const owner = dialog;
    setBusy(true); say(t("جارٍ الحفظ…","Saving…"));
    try {
      selected = await rpc(action,selected.id,selected.version,payload);
      if (dialog !== owner) return;
      reviewDirty = false;
      publishEvent(selected,selected.editorial_status);
      await renderReview(reviewFocus,message);
    } catch(error) { if (dialog === owner) say(explain(error),"error"); }
    finally { if (dialog === owner) setBusy(false); }
  }
  function reviewForm(host, label, action, options = {}) {
    const form = node("form",null,{class:"wl-edit-form wl-edit-review-form"});
    const grid = node("div",null,{class:"wl-edit-grid"});
    const footer = node("div",null,{class:"wl-edit-toolbar"});
    footer.append(button(label,{type:"submit",class:"wl-edit-primary"}));
    form.append(grid,footer); host.append(form);
    form.addEventListener("input",() => { reviewDirty = true; });
    form.onsubmit=ev=>{
      ev.preventDefault();
      if (busy) return;
      const payload=values(form);
      action(payload,ev.submitter,form);
    };
    if (options.secondary) footer.append(button(options.secondary,{type:"submit",value:"publish"}));
    return grid;
  }
  function renderTrust(host, data) {
    const a=selected;
    host.append(node("p",t("المصداقية قرار بشري مبني على ادعاءات وأدلة. تعديل النص أو المصدر قد يتطلب مراجعة جديدة.","Credibility is a human decision based on claims and evidence. Text and source changes can require a new review.")));
    const current=trustStates.find(o=>o[0]===a.editorial_trust_status) || trustStates[0];
    host.append(node("p",t("الحالة الحالية: ","Current status: ")+t(current[1],current[2])+(a.trust_needs_review?t(" · تحتاج مراجعة"," · Review needed"):""),{class:"wl-edit-review-state"}));
    const context=node("details",null,{class:"wl-edit-details"});
    context.append(node("summary",t("الرواية والمصدر","Attribution & source")));
    const c=reviewForm(context,t("حفظ الرواية","Save attribution"),payload=>void reviewWrite("save",payload,t("تم حفظ الرواية.","Attribution saved.")));
    for (const [name,ar,en,kind,max] of [
      ["agency_name","اسم الجهة","Agency name","text",180],["agency_account_url","حساب الجهة","Agency account URL","url",2048],
      ["agency_statement_url","رابط البيان","Statement URL","url",2048],["agency_narrative","رواية الجهة","Agency account","textarea",2000],
      ["trust_source_excerpt","اقتباس من المصدر","Source excerpt","textarea",2000]
    ]) field(c,name,t(ar,en),kind,{value:a[name],max,wide:kind==="textarea"});
    host.append(context);
    renderEvidence(host,data); renderClaims(host,data);
    const review=reviewForm(host,t("تسجيل قرار المصداقية","Record credibility decision"),payload=>{
      ask(t("أقر بأنني راجعت الخبر والأدلة بنفسي.","I confirm I reviewed the story and evidence myself."),()=>void reviewWrite("trust",payload,t("سُجل قرار المصداقية.","Credibility decision recorded.")));
    });
    field(review,"status",t("المصداقية","Credibility"),"select",{options:trustStates,value:a.editorial_trust_status || "unconfirmed"});
    const trs=field(review,"translation_status",t("مراجعة الترجمة","Translation review"),"select",{options:translationStates,value:a.human_translation_status || "pending"});
    const translationNote=field(review,"translation_note",t("ملاحظة مراجعة الترجمة (داخلية)","Translation review note (private)"),"textarea",{max:2000,wide:true});
    function showNote() { translationNote.closest("label").hidden=trs.value!=="reviewed"; translationNote.disabled=trs.value!=="reviewed"; translationNote.required=trs.value==="reviewed"; }
    trs.onchange=showNote; showNote();
    field(review,"note",t("سبب القرار (داخلي)","Decision note (private)"),"textarea",{max:2000,required:true,wide:true});
  }
  function collection(host, label, rows, display, editor) {
    const box=node("details",null,{class:"wl-edit-details"});
    box.append(node("summary",`${label} (${rows.length})`));
    const list=node("div",null,{class:"wl-edit-queue wl-edit-collection"});
    const form=node("div");
    const load=item=>{
      const draw=()=>{reviewDirty=false;form.replaceChildren();editor(form,item);};
      if (reviewDirty) ask(t("تجاهل التغييرات غير المحفوظة؟","Discard unsaved review edits?"),draw);
      else draw();
    };
    for (const item of rows) {
      const open=button(display(item),{class:"wl-edit-queue-item",dir:"auto"});
      open.onclick=()=>load(item); list.append(open);
    }
    const add=button(t("إضافة","Add"));
    add.onclick=()=>load({});
    box.append(list,add,form); host.append(box);
  }
  function renderEvidence(host,data) {
    collection(host,t("الأدلة","Evidence"),data.evidence,e=>e.publisher,(form,e)=>{
      const grid=reviewForm(form,t("حفظ الدليل","Save evidence"),payload=>void reviewWrite("evidence",{...payload,id:e.id},t("حُفظ الدليل.","Evidence saved.")));
      field(grid,"publisher",t("الناشر","Publisher"),"text",{value:e.publisher,max:200,required:true});
      field(grid,"evidence_url",t("رابط الدليل","Evidence URL"),"url",{value:e.evidence_url,max:2048,required:true});
      field(grid,"evidence_type",t("نوع الدليل","Evidence type"),"select",{value:e.evidence_type || "primary_document",options:evidenceKinds});
      const independent=field(grid,"independent_source",t("مصدر مستقل","Independent source"),"checkbox",{value:e.independent_source});
      const group=field(grid,"provenance_group",t("أصل التقرير أو الجهة الناشرة أولًا","Original reporting group"),"text",{value:e.provenance_group,max:160});
      const reason=field(grid,"independence_note",t("لماذا هو مستقل؟","Why is it independent?"),"textarea",{value:e.independence_note,max:2000,wide:true});
      const sync=()=>{group.required=reason.required=independent.checked;}; independent.onchange=sync; sync();
      field(grid,"notes",t("ملاحظات على الدليل","Evidence notes"),"textarea",{value:e.notes,max:2000,wide:true});
    });
  }
  function renderClaims(host,data) {
    collection(host,t("الادعاءات","Claims"),data.claims,e=>e.claim_text,(form,c)=>{
      const grid=reviewForm(form,t("حفظ الادعاء","Save claim"),(payload,_submit,frm)=>{
        payload.supporting_evidence_ids=[...frm.querySelectorAll("[data-claim-evidence]:checked")].map(el=>el.value);
        void reviewWrite("claim",{...payload,id:c.id},t("حُفظ الادعاء.","Claim saved."));
      });
      field(grid,"claim_text",t("نص الادعاء","Claim"),"textarea",{value:c.claim_text,max:2000,required:true,wide:true});
      field(grid,"status",t("حالة الادعاء","Claim status"),"select",{value:c.status || "unconfirmed",options:trustStates});
      const group=node("fieldset",null,{class:"is-wide wl-edit-evidence-list"});
      group.append(node("legend",t("الأدلة الداعمة","Supporting evidence")));
      if (!data.evidence.length) group.append(node("p",t("أضف دليلًا أولًا.","Add evidence first.")));
      for (const e of data.evidence) {
        const el=field(group,"",e.publisher,"checkbox",{value:(c.supporting_evidence_ids || []).includes(e.id)});
        el.dataset.claimEvidence=""; el.value=e.id;
      }
      grid.append(group);
      field(grid,"review_note",t("ملاحظة المراجعة (داخلية)","Review note (private)"),"textarea",{value:c.review_note,max:2000,wide:true});
    });
  }
  function renderEdition(host,data) {
    const lang=(selected.source_language || selected.lang || "ar").startsWith("en") ? "ar" : "en";
    const row=data.editions.find(e=>e.lang===lang);
    host.append(node("h3",lang==="ar"?t("النسخة العربية","Arabic edition"):t("النسخة الإنجليزية","English edition")));
    if (row && row.translation_source!=="editorial") {
      host.append(node("p",t("هناك ترجمة آلية لهذه اللغة. راجعها دون استبدالها من لوحة التحرير.","An automated translation already exists. Review it from the dashboard without replacing it.")),node("a",t("قائمة مراجعة الترجمات","Translation review queue"),{href:"/admin.html#translationReviewList"}));
      return;
    }
    host.append(node("p",row?.translation_status==="published"?t("النسخة منشورة. تعديل نصّها دون اعتماد يعيدها للمراجعة.","Published. Saving changed text without approval returns it to review."):t("النسخة منفصلة عن النص الأصلي ولا تظهر قبل اعتمادها.","This edition is separate from the original and is hidden until approved.")));
    const grid=reviewForm(host,t("حفظ النسخة للمراجعة","Save edition for review"),(payload,submit)=>{
      const publish=submit?.value==="publish";
      const save=()=>void reviewWrite("edition",{...payload,lang,id:row?.id,edition_version:row?.version,publish},publish?t("نُشرت النسخة الأخرى.","The other edition was published."):t("حُفظت النسخة.","Edition saved."));
      if (publish && !payload.note) { say(t("أضف ملاحظة توضح ما راجعته قبل النشر.","Add a note on what you reviewed before publishing."),"error");return; }
      if (publish) ask(t("هل راجعت النص واعتمدت نشره؟","Have you reviewed this edition and approved publication?"),save);
      else save();
    },{secondary:selected.editorial_status==="published"?t("اعتماد النسخة ونشرها","Approve & publish edition"):null});
    field(grid,"title",t("عنوان النسخة الأخرى","Edition headline"),"text",{value:row?.title,max:300,required:true,wide:true});
    field(grid,"summary",t("نص النسخة الأخرى","Edition body"),"textarea",{value:row?.summary,max:1000000,required:true,wide:true});
    field(grid,"note",t("ملاحظة المراجعة البشرية (داخلية)","Human review note (private)"),"textarea",{max:2000,wide:true});
  }
  async function renderReview(mode, message = "") {
    const owner=dialog;
    if (!owner || !selected?.id) return;
    const host=q(".wl-edit-panel",owner);
    reviewFocus=mode; tabs(mode); setBusy(true);
    say(t("جارٍ تحميل بيانات المراجعة…","Loading review data…"));
    try {
      loadedTools=await rpc("review_tools",selected.id);
      if (dialog!==owner) return;
      host.replaceChildren();
      if (mode==="trust") renderTrust(host,loadedTools);
      else renderEdition(host,loadedTools);
      say(message,message?"success":"");
    } catch(error) { if (dialog===owner) say(explain(error),"error"); }
    finally { if (dialog===owner) setBusy(false); }
  }
  window.WLSiteEditor = { attach, setStory, syncRows };
  if (q(".public-news-header")) {
    const article=q("[data-public-article]");
    if (article) setStory(article.dataset.articleId,q(".public-news-meta",article));
    callback=articleResult=>{
      if (article && article.dataset.articleId!==articleResult.id) return;
      const status=q(".wl-edit-status",dialog);
      if (status && !q("a",status)) status.append(" ",node("a", t("تحديث الصفحة","Reload page"),{ href:article && articleResult.editorial_status!=="published" ? "/news/" : location.href }));
    };
    void bootstrapPublic();
  }
  new MutationObserver(() => { if (permitted && !dialog?.open) syncButtons(); }).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
})();
