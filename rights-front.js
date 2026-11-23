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
})();
