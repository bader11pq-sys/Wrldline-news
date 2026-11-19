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

  fetch("/dossier/watchlist.json", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const items = (data && Array.isArray(data.items) ? data.items : [])
        .filter((item) => item && item.timing !== "undated")
        .slice(0, 4);
      if (!items.length) return;
      grid.replaceChildren(...items.map(card));
      section.hidden = false;
    })
    .catch(() => {});
})();
