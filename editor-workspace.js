(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("articleForm");
  const body = $("summary");
  const title = $("title");
  const composer = $("articleComposer");
  const MAX = 1000000, SECTION = 24000, FIELD = 36000;
  let timer, key, restore, dirty = false;
  let parts = [""], current = 0;
  const storageKey = user => "wrldline:working-draft:" + user;
  $("editorJumps").after(composer);
  const draftOption = document.createElement("option");
  draftOption.value = "draft"; draftOption.textContent = "مسودة";
  $("statusFilter").append(draftOption);
  const numeric = n => new Intl.NumberFormat(document.documentElement.lang || "ar").format(n);
  function getBody() {
    parts[current] = body.value;
    return parts.join("");
  }
  function splitParts(text) {
    const sections = [];
    let start = 0;
    while (text.length - start > SECTION) {
      let end = text.lastIndexOf("\n", start + SECTION);
      if (end < start + SECTION * .65) end = text.lastIndexOf(" ", start + SECTION);
      if (end < start + SECTION * .65) end = start + SECTION - 1;
      // Don't split UTF-16 surrogate pairs across an editor boundary.
      if (/[\uD800-\uDBFF]/u.test(text[end]) && /[\uDC00-\uDFFF]/u.test(text[end + 1])) end++;
      sections.push(text.slice(start, end + 1));
      start = end + 1;
    }
    sections.push(text.slice(start));
    return sections;
  }
  function syncParts() {
    const other = parts.reduce((sum, part, i) => sum + (i === current ? 0 : part.length), 0);
    body.maxLength = Math.max(0, Math.min(FIELD, MAX - other));
    const picker = $("composePartSelect");
    if (picker.options.length !== parts.length) {
      const options = parts.map((_, i) => new Option(`الجزء ${numeric(i + 1)} من ${numeric(parts.length)}`, i));
      picker.replaceChildren(...options);
    }
    picker.value = String(current);
    $("previousPart").disabled = current === 0;
    $("nextPart").disabled = current + 1 >= parts.length;
    $("appendPart").disabled = other + body.value.length >= MAX;
  }
  function setBody(value, position = 0) {
    parts = splitParts(String(value ?? "").replace(/\r\n?/g, "\n"));
    current = 0;
    while (current + 1 < parts.length && position > parts[current].length) position -= parts[current++].length;
    body.value = parts[current];
    body.setSelectionRange(position, position);
    syncParts();
  }
  function selectPart(index) {
    getBody();
    current = index;
    body.value = parts[current];
    syncParts();
    if (!$("composePreview").hidden) preview(true);
    body.focus();
  }
  function updateCount() {
    const pattern = /\S+/gu;
    const text = getBody();
    let words = 0;
    while (pattern.exec(text)) words++;
    $("composeCount").textContent = `${numeric(text.length)} / ${numeric(MAX)} حرف · ${numeric(words)} كلمة`;
    syncParts();
  }
  function persist() {
    if (!key || !dirty) return;
    const text = getBody();
    if (!title.value.trim() && !text.trim()) return;
    try {
      localStorage.setItem(key, JSON.stringify({ id: $("articleId").value, title: title.value, body: text }));
      $("workingDraftStatus").textContent = "حُفظ العنوان والنص على هذا الجهاز.";
    } catch {
      $("workingDraftStatus").textContent = "لم تُحفظ النسخة المحلية. احفظ مسودة خاصة من زر الحفظ.";
    }
  }
  function changed() {
    dirty = true;
    $("workingDraftStatus").textContent = "تغييرات غير محفوظة…";
    clearTimeout(timer);
    timer = setTimeout(() => {
      updateCount(); persist();
      if (!$("composePreview").hidden) preview(true, false);
    }, 500);
  }
  function markClean() {
    clearTimeout(timer);
    dirty = false;
    fileStatus("");
    updateCount();
    if (!$("composePreview").hidden) preview(false);
  }
  function saved(message, link) {
    $("publishResult").textContent = message;
    const anchor = $("openPublishedStory");
    anchor.hidden = !link;
    if (link) anchor.href = link;
  }
  function fileStatus(message) {
    const status = $("composeFileStatus");
    status.hidden = !message;
    status.textContent = message;
  }
  function preview(show, scroll = true) {
    const panel = $("composePreview");
    panel.hidden = !show;
    $("composePreviewButton").setAttribute("aria-expanded", String(show));
    if (show) {
      $("composePreviewTitle").textContent = (title.value || "معاينة العنوان")+(parts.length > 1 ? ` · الجزء ${numeric(current + 1)}` : "");
      window.WLReaderProse.renderInto($("composePreviewBody"), body.value, { editorial: $("contentType").value === "editorial" });
      if (scroll) panel.scrollIntoView({ block: "nearest" });
    } else {
      $("composePreviewBody").replaceChildren();
    }
  }
  function focusMode(on) {
    composer.classList.toggle("is-focused", on);
    document.body.classList.toggle("editor-focused", on);
    $("composeFocus").setAttribute("aria-pressed", String(on));
    $("composeFocus").textContent = on ? "خروج من وضع التركيز" : "وضع التركيز";
  }
  function format(prefix, placeholder) {
    const from = body.selectionStart, end = body.selectionEnd;
    const lineStart = from ? body.value.lastIndexOf("\n", from - 1) + 1 : 0;
    const lineEnd = body.value.indexOf("\n", end);
    const to = lineEnd < 0 ? body.value.length : lineEnd;
    const selected = body.value.slice(lineStart, to);
    const lines = selected.split("\n");
    const replacement = lines.map(line => line ? (line.startsWith(prefix) ? line : prefix + line) : line).join("\n") || prefix + placeholder;
    if (body.value.length - (to - lineStart) + replacement.length > body.maxLength) return;
    body.setRangeText(replacement, lineStart, to, "end");
    body.focus();
    if (!selected) body.setSelectionRange(lineStart + prefix.length, lineStart + replacement.length);
    changed();
    updateCount();
  }
  title.addEventListener("input", changed);
  body.addEventListener("input", changed);
  $("composePartSelect").addEventListener("change", event => selectPart(Number(event.target.value)));
  $("previousPart").addEventListener("click", () => selectPart(current - 1));
  $("nextPart").addEventListener("click", () => selectPart(current + 1));
  $("appendPart").addEventListener("click", () => {
    const full = getBody();
    if (full.length >= MAX) return;
    parts.push(full && !full.endsWith("\n") && full.length + 2 <= MAX ? "\n\n" : "");
    selectPart(parts.length - 1);
    body.setSelectionRange(body.value.length, body.value.length);
    changed();
  });
  body.addEventListener("paste", e => {
    const pasted = e.clipboardData?.getData("text")?.replace(/\r\n?/g, "\n");
    if (!pasted) return;
    const start = body.selectionStart, end = body.selectionEnd;
    const full = getBody();
    const available = MAX - full.length + (end - start);
    if (pasted.length > available) {
      e.preventDefault();
      $("workingDraftStatus").textContent = "اللصق يتجاوز حد المليون حرف. لم يتغير النص الحالي.";
    } else if (body.value.length - (end - start) + pasted.length > SECTION) {
      e.preventDefault();
      const offset = parts.slice(0, current).reduce((sum, part) => sum + part.length, 0);
      setBody(full.slice(0, offset + start) + pasted + full.slice(offset + end), offset + start + pasted.length);
      changed();
    }
  });
  $("composeImport").addEventListener("click", () => $("composeFile").click());
  $("composeFile").addEventListener("change", async event => {
    const input = event.currentTarget;
    const [file] = input.files;
    input.value = "";
    if (!file) return;
    fileStatus("");
    if (!file.name.toLowerCase().endsWith(".txt") || file.size > 4 * MAX) {
      fileStatus("اختر ملفًا نصيًا بامتداد .txt لا يتجاوز ٤ ميغابايت.");
      return;
    }
    const initial = getBody(), owner = key, articleId = $("articleId").value;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()).replace(/\r\n?/g, "\n");
      if (owner !== key || articleId !== $("articleId").value || initial !== getBody() || form.inert) return;
      if (!text.trim() || text.length > MAX) {
        fileStatus("الملف فارغ أو يتجاوز حد المليون حرف. لم يتغير نصك.");
        return;
      }
      if (initial.trim() && !confirm("سيستبدل الملف نص المقال الحالي. هل تريد المتابعة؟")) return;
      setBody(text);
      changed();
      updateCount();
      fileStatus("استُورد النص. راجعه قبل النشر.");
      body.focus();
    } catch {
      fileStatus("تعذّر استيراد الملف. احفظه بترميز UTF-8 ثم أعد المحاولة.");
    }
  });
  $("composeHeadingButton").addEventListener("click", () => format("## ", "عنوان القسم"));
  $("composeBulletButton").addEventListener("click", () => format("• ", "اكتب النقطة هنا"));
  $("composePreviewButton").addEventListener("click", () => preview($("composePreview").hidden));
  $("composeFocus").addEventListener("click", () => focusMode(!composer.classList.contains("is-focused")));
  document.addEventListener("keydown", e => {
    if (!key || !form.contains(document.activeElement)) return;
    if (e.key === "Escape") focusMode(false);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); persist(); }
  });
  window.addEventListener("pagehide", persist);
  $("restoreWorkingDraft").addEventListener("click", async () => {
    if (!key || !restore || (dirty && !confirm("هل تريد استبدال العنوان والنص الحاليين بالنسخة المحلية؟"))) return;
    const button = $("restoreWorkingDraft");
    button.disabled = true;
    try {
      const draft = JSON.parse(localStorage.getItem(key) || "null");
      if (draft && await restore(draft)) {
        title.value = draft.title; setBody(draft.body);
        markClean(); button.hidden = true;
        $("workingDraftStatus").textContent = "استُعيد العنوان والنص من هذا الجهاز.";
        body.focus();
      }
    } catch { saved("تعذّر استرجاع النسخة المحلية."); }
    finally { button.disabled = false; }
  });
  function account(id, restoreHandler) {
    const next = id ? storageKey(id) : null;
    if (key === next) return;
    persist();
    markClean();
    focusMode(false);
    key = next;
    restore = restoreHandler;
    showSavedDraft();
  }
  function showSavedDraft() {
    let exists = false;
    try { exists = !!key && !!localStorage.getItem(key); } catch {}
    $("restoreWorkingDraft").hidden = !exists;
    $("workingDraftStatus").textContent = "يحفظ هذا المتصفح نسخة محلية من العنوان والنص.";
  }
  function clearSaved() {
    if (key) try { localStorage.removeItem(key); } catch {}
    $("restoreWorkingDraft").hidden = true;
    $("workingDraftStatus").textContent = "يحفظ هذا المتصفح نسخة محلية من العنوان والنص.";
    markClean();
  }
  window.WLEditorWorkspace = { account, saved, clearSaved, markClean, persist, showSavedDraft, focusMode, getBody, setBody, isDirty: () => dirty };
  updateCount();
})();
