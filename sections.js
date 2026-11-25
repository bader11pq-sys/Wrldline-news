/* Keeps the visible hierarchy in one language as the reader moves through it.
 * The page is static and indexable; this only carries ?lang=en across links.
 */
(function () {
  function sync(lang) {
    document.querySelectorAll("a[data-section-link]").forEach(function (a) {
      try {
        var url = new URL(a.getAttribute("href"), location.href);
        if (url.origin !== location.origin) return;
        if (lang === "en") url.searchParams.set("lang", "en");
        else url.searchParams.delete("lang");
        a.setAttribute("href", url.pathname + url.search + url.hash);
      } catch (_) {}
    });
  }
  function current() {
    var lang = new URLSearchParams(location.search).get("lang") || window.wrldlineLang || "ar";
    return lang === "en" ? "en" : "ar";
  }
  document.addEventListener("DOMContentLoaded", function () { sync(current()); });
  document.addEventListener("wrldline:language", function (event) {
    sync(event.detail && event.detail.lang === "en" ? "en" : "ar");
  });
})();
