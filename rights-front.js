(() => {
  "use strict";
  // A shared link to a legacy panel should still reveal its destination.
  function openParents(fragment) {
    let name;
    try { name = decodeURIComponent(fragment.slice(1)); } catch { return null; }
    if (!name) return null;
    const node = document.getElementById(name);
    for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches("details.rf-extra, details.rf-compact-index")) parent.open = true;
    }
    return node;
  }
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href^="#"]');
    if (link) openParents(link.getAttribute("href"));
  });
  window.addEventListener("hashchange", () => openParents(location.hash));
  const target = openParents(location.hash);
  if (target?.closest("details.rf-extra, details.rf-compact-index")) {
    requestAnimationFrame(() => target.scrollIntoView());
  }

  const viewSwitch = document.getElementById("readerViewSwitch");
  const feed = document.getElementById("newsGrid");
  if (!viewSwitch || !feed) return;
  const buttons = [...viewSwitch.querySelectorAll("button[data-reader-view]")];
  const compact = matchMedia("(max-width: 700px)");
  const preference = "wrldline:reader-view";
  const valid = value => value === "headlines" || value === "cards";
  let selected;
  try {
    const stored = localStorage.getItem(preference);
    if (valid(stored)) selected = stored;
  } catch {}
  function setView() {
    const view = selected ?? (compact.matches ? "headlines" : "cards");
    feed.dataset.readerView = view;
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.readerView === view));
  }
  function syncLanguage() {
    viewSwitch.setAttribute("aria-label", document.documentElement.lang === "en" ? "News display" : "طريقة عرض الأخبار");
  }
  for (const button of buttons) button.addEventListener("click", () => {
    selected = button.dataset.readerView;
    if (!valid(selected)) return;
    try { localStorage.setItem(preference, selected); } catch {}
    setView();
  });
  compact.addEventListener?.("change", setView);
  document.addEventListener("wrldline:language", syncLanguage);
  setView();
  syncLanguage();
  viewSwitch.hidden = false;
})();
