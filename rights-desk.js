(() => {
  "use strict";
  const container = document.getElementById("rightsFilter");
  const select = document.getElementById("rightsTopic");
  const reset = document.getElementById("rightsReset");
  const count = document.getElementById("rightsCount");
  const cards = [...document.querySelectorAll(".rd-guide[data-topic]")];
  if (!container || !select || !reset || !count || cards.length === 0) return;
  const digits = new Intl.NumberFormat("ar", { numberingSystem: "arab" });
  const render = () => {
    let visible = 0;
    for (const card of cards) {
      card.hidden = !(select.value === "all" || card.dataset.topic === select.value);
      if (!card.hidden) visible++;
    }
    count.textContent = `${digits.format(visible)} من ${digits.format(cards.length)}`;
    reset.disabled = select.value === "all";
  };
  function showLinkedItem() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const item = document.getElementById(id);
    if (!item) return;
    if (item.classList.contains("rd-guide") && item.hidden) {
      select.value = "all";
      render();
      item.scrollIntoView();
    }
    if (item.classList.contains("rd-file")) {
      const details = item.querySelector("details");
      if (details) details.open = true;
    }
  }
  select.addEventListener("change", render);
  reset.addEventListener("click", () => { select.value = "all"; render(); select.focus(); });
  window.addEventListener("hashchange", showLinkedItem);
  select.value = "all";
  render();
  showLinkedItem();
  container.hidden = false;
})();

/* Latest rights news beside the case files: reads the public /section/rights page. */
(() => {
  const box = document.getElementById("rightsNews"), list = document.getElementById("rightsNewsList");
  if (!box || !list) return;
  fetch("/section/rights", { credentials: "omit" }).then(r => r.ok ? r.text() : "").then(html => {
    if (!html) return;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const cards = [...doc.querySelectorAll(".pn-card h2 a")].slice(0, 6);
    if (!cards.length) return;
    for (const a of cards) {
      const li = document.createElement("li"), link = document.createElement("a");
      link.href = a.getAttribute("href"); link.textContent = a.textContent.trim(); li.append(link); list.append(li);
    }
    box.hidden = false;
  }).catch(() => {});
})();
