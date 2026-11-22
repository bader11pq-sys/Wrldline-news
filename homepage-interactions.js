/* Homepage theme affordance; the theme itself is set by script.js. */
(() => {
  const root = document.documentElement;
  const themeButton = document.getElementById("themeButton");
  if (!themeButton) return;
  function syncTheme() {
    const dark = root.dataset.theme === "dark";
    const en = root.lang === "en";
    themeButton.innerHTML = '<svg aria-hidden="true"><use href="' + (dark ? "#i-sun" : "#i-moon") + '"></use></svg>';
    themeButton.setAttribute("aria-label", en ? (dark ? "Switch to light theme" : "Switch to dark theme") : (dark ? "التبديل إلى المظهر الفاتح" : "التبديل إلى المظهر الداكن"));
    themeButton.setAttribute("aria-pressed", String(dark));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#09121e" : "#f1f0ea";
  }
  document.addEventListener("DOMContentLoaded", syncTheme);
  document.addEventListener("wrldline:language", syncTheme);
  themeButton.addEventListener("click", () => requestAnimationFrame(() => {
    syncTheme();
    window.dispatchEvent(new CustomEvent("wrldline:theme-change", { detail: { theme: root.dataset.theme } }));
  }));
})();
