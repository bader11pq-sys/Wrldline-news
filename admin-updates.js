/* Admin: add dated "ما الجديد" updates to a saved story, without re-publishing it. */
(() => {
  "use strict";
  const form = document.getElementById("articleForm"), idField = document.getElementById("articleId");
  if (!form || !idField) return;
  const kinds = { update: "تحديث", development: "تطور جديد", correction: "تصحيح", clarification: "توضيح" };
  const box = document.createElement("section");
  box.id = "updatesPanel"; box.className = "panel"; box.hidden = true;
  box.innerHTML = '<h3>ما الجديد في هذا الخبر</h3><p class="hint">تحديثات قصيرة مؤرخة تظهر تحت الخبر المنشور دون إعادة نشره. التصحيح يحدّث أيضاً ملاحظة التصحيح في الخبر.</p>' +
    '<label for="upKind">النوع</label><select id="upKind"></select>' +
    '<label for="upBody">النص</label><textarea id="upBody" rows="3" maxlength="1200"></textarea><small id="upCount">0 / 1200</small>' +
    '<label for="upUrl">رابط مرجعي (اختياري)</label><input id="upUrl" type="url" dir="ltr" placeholder="https://">' +
    '<button type="button" id="upAdd">إضافة التحديث</button> <span id="upMsg" role="status"></span><ol id="upList"></ol>';
  form.after(box);
  const $ = i => box.querySelector("#" + i);
  for (const [k, v] of Object.entries(kinds)) $("upKind").add(new Option(v, k));
  const say = t => { $("upMsg").textContent = t; };
  const db = () => window.WRLDLINE_ADMIN_DB;
  async function load() {
    const id = idField.value;
    box.hidden = !id; if (!id || !db()) return;
    const { data, error } = await db().from("article_updates").select("id,kind,body,source_url,created_at").eq("article_id", id).order("created_at", { ascending: false }).limit(50);
    const ol = $("upList"); ol.replaceChildren();
    if (error) { say("تعذر تحميل التحديثات: " + error.message); return; }
    for (const r of data) {
      const li = document.createElement("li");
      li.textContent = `${kinds[r.kind] || r.kind} · ${new Date(r.created_at).toLocaleString("ar-SA")} — ${r.body} `;
      const del = document.createElement("button"); del.type = "button"; del.textContent = "حذف";
      del.onclick = async () => {
        if (!confirm("حذف هذا التحديث نهائياً؟")) return;
        const { error: e } = await db().from("article_updates").delete().eq("id", r.id);
        say(e ? "تعذر الحذف: " + e.message : "تم الحذف."); load();
      };
      li.append(del); ol.append(li);
    }
  }
  $("upBody").addEventListener("input", () => { $("upCount").textContent = $("upBody").value.length + " / 1200"; });
  $("upAdd").addEventListener("click", async () => {
    const body = $("upBody").value.trim(), url = $("upUrl").value.trim(), id = idField.value;
    if (body.length < 3) return say("اكتب نص التحديث.");
    if (url && !/^https?:\/\//i.test(url)) return say("الرابط يجب أن يبدأ بـ https://");
    $("upAdd").disabled = true;
    const { error } = await db().from("article_updates").insert({ article_id: id, kind: $("upKind").value, body, source_url: url || null });
    $("upAdd").disabled = false;
    if (error) return say("تعذر الحفظ: " + error.message);
    $("upBody").value = ""; $("upUrl").value = ""; $("upCount").textContent = "0 / 1200"; say("أُضيف التحديث وسيظهر تحت الخبر."); load();
  });
  let last = ""; setInterval(() => { if (idField.value !== last) { last = idField.value; load(); } }, 700);
})();
