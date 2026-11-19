/* WRLDLINE — homepage watchlist strip */
(() => {
  const section = document.getElementById("watchStripSection");
  const grid = document.getElementById("watchStripGrid");
  if (!section || !grid) return;

  const card = (item) => {
    const link = document.createElement("a");
    link.className = "watch-strip-card";
    link.href = item.url || "/dossier/watchlist.html";
    const top = document.createElement("div");
    top.className = "watch-strip-top";
    const tag = document.createElement("span");
    tag.className = "watch-strip-tag";
    tag.textContent = item.dossierTitle || "ملف";
    top.appendChild(tag);
    if (item.when) {
      const when = document.createElement("span");
      when.className = "watch-strip-when";
      when.textContent = item.when + (item.approximate ? " · تقديري" : "");
      top.appendChild(when);
    }
    const title = document.createElement("h3");
    title.textContent = item.what || "";
    const why = document.createElement("p");
    why.textContent = item.why || "";
    link.append(top, title, why);
    return link;
  };

  const API = "https://vmaxbnogmmfyrcucapnq.supabase.co/rest/v1/editorial_publications";
  const KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const render = items => {
    const selected = (items || []).filter(item => item && item.timing !== "undated").slice(0, 4);
    if (!selected.length) return false;
    grid.replaceChildren(...selected.map(card));
    section.hidden = false;
    return true;
  };
  const query = new URLSearchParams({ select:"content", section:"eq.watchlist", status:"eq.published", order:"published_at.desc", limit:"1" });
  fetch(API + "?" + query.toString(), { cache:"no-store", headers:{ apikey:KEY, Accept:"application/json" } })
    .then(r => r.ok ? r.json() : [])
    .then(rows => {
      const weekly = rows?.[0]?.content;
      if (weekly && Array.isArray(weekly.items) && render(weekly.items.map(item => ({
        dossierTitle: item.sector || "متابعة",
        what: item.what,
        why: item.why,
        when: item.when,
        approximate: item.timing === "approximate",
        url: "/dossier/"
      })))) return;
      return fetch("/dossier/watchlist.json", { cache:"no-store" }).then(r => r.ok ? r.json() : null).then(data => render(data?.items || []));
    })
    .catch(() => fetch("/dossier/watchlist.json", { cache:"no-store" }).then(r => r.ok ? r.json() : null).then(data => render(data?.items || [])).catch(() => {}));
})();
