/* WRLDLINE: "ما الجديد في هذا الخبر" — dated updates under a published story. Text only, no HTML. */
(() => {
  "use strict";
  const URL_ = "https://vmaxbnogmmfyrcucapnq.supabase.co", KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const holder = document.getElementById("articleTrust"), article = document.querySelector("[data-public-article]");
  const id = holder?.dataset.articleId;
  if (!article || !id || !/^[0-9a-f-]{36}$/i.test(id) || document.getElementById("storyUpdates")) return;
  const en = document.documentElement.lang === "en";
  const kinds = { update: ["تحديث", "Update"], development: ["تطور جديد", "New development"], correction: ["تصحيح", "Correction"], clarification: ["توضيح", "Clarification"] };
  const label = k => (kinds[k] || kinds.update)[en ? 1 : 0];
  const safe = v => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) && !u.username ? u.href : null; } catch { return null; } };
  function ago(date) {
    const m = Math.round((Date.now() - date.getTime()) / 60000);
    if (m < 1) return en ? "just now" : "الآن";
    const f = new Intl.RelativeTimeFormat(en ? "en" : "ar", { numeric: "auto" });
    if (m < 60) return f.format(-m, "minute");
    if (m < 1440) return f.format(-Math.round(m / 60), "hour");
    if (m < 10080) return f.format(-Math.round(m / 1440), "day");
    return date.toLocaleDateString(en ? "en-GB" : "ar-SA", { dateStyle: "medium" });
  }
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  fetch(URL_ + "/rest/v1/rpc/public_article_updates", {
    method: "POST", credentials: "omit",
    headers: { "Content-Type": "application/json", apikey: KEY }, body: JSON.stringify({ p_id: id })
  }).then(r => r.ok ? r.json() : []).then(rows => {
    if (!Array.isArray(rows) || !rows.length) return;
    const sec = el("section", "pn-updates"); sec.id = "storyUpdates"; sec.setAttribute("aria-labelledby", "storyUpdatesTitle");
    const h = el("h2", null, en ? "What's new in this story" : "ما الجديد في هذا الخبر"); h.id = "storyUpdatesTitle";
    const latest = new Date(rows[0].created_at);
    const meta = el("p", "pn-updates-meta", (en ? "Last updated " : "آخر تحديث ") + ago(latest) + (en ? ` · ${rows.length} update(s)` : ` · ${rows.length} ${rows.length > 2 ? "تحديثات" : "تحديث"}`));
    const ol = el("ol", "pn-updates-list");
    for (const r of rows) {
      const d = new Date(r.created_at); if (Number.isNaN(d.getTime())) continue;
      const li = el("li", "pn-update pn-update--" + (kinds[r.kind] ? r.kind : "update"));
      const top = el("p", "pn-update-top"), tag = el("strong", "pn-update-kind", label(r.kind)), t = el("time", null, ago(d));
      t.dateTime = d.toISOString(); t.title = d.toLocaleString(en ? "en-GB" : "ar-SA");
      top.append(tag, " · ", t);
      const body = el("p", "pn-update-body", String(r.body || "")); body.dir = "auto";
      li.append(top, body);
      const u = r.source_url && safe(r.source_url);
      if (u) { const a = el("a", "pn-update-src", en ? "Reference ↗" : "المرجع ↗"); a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; li.append(a); }
      ol.append(li);
    }
    sec.append(h, meta, ol);
    const anchor = article.querySelector('[data-reader-step="event"]');
    if (anchor) anchor.after(sec); else article.prepend(sec);
    // A jump link under the headline so the reader sees there is more without scrolling.
    const head = article.querySelector("h1");
    if (head && !document.getElementById("storyUpdatesJump")) {
      const jump = el("a", "pn-updates-jump", (en ? "Updated " : "حُدّث ") + ago(latest) + " ↓"); jump.id = "storyUpdatesJump"; jump.href = "#storyUpdates";
      head.after(jump);
    }
  }).catch(() => {});
})();
