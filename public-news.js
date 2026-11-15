/* Optional public-page enhancement. Article text and links are already in initial HTML. */
(() => {
  "use strict";
  const article = document.querySelector("[data-public-article]");
  if (!article) return;
  const en = document.documentElement.lang.startsWith("en");
  const status = document.getElementById("publicNewsStatus");
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  if (!canonical || new URL(canonical).origin !== "https://al-ghaib.us.ci") return;
  const shareButton = document.getElementById("publicNewsShare");
  const copyButton = document.getElementById("publicNewsCopy");
  shareButton?.addEventListener("click", () => {
    const data = { ...window.WRLDLINE_SHARE?.payloadFrom(article), url: canonical, button: shareButton };
    if (window.WRLDLINE_SHARE) window.WRLDLINE_SHARE.share(data);
    else if (navigator.share) navigator.share({ title: article.querySelector("h1")?.textContent, url: canonical }).catch(() => {});
  });
  copyButton?.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(canonical);
      if (status) status.textContent = en ? "Article link copied." : "نُسخ رابط الخبر.";
    } catch {
      window.prompt(en ? "Copy article link" : "انسخ رابط الخبر", canonical);
    }
  });
})();
