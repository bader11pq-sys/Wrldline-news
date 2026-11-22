/* Optional public-page enhancement. Article text and links are already in initial HTML. */
(() => {
  "use strict";
  const article = document.querySelector("[data-public-article]");
  if (!article) return;
  const en = document.documentElement.lang.startsWith("en");
  const summary = article.querySelector(".public-news-summary");
  if (summary) {
    const tools = document.createElement("div");
    tools.className = "public-reading-tools";
    const size = document.createElement("button");
    size.type = "button";
    size.textContent = en ? "Larger text" : "تكبير النص";
    function showSize(large) {
      article.classList.toggle("public-text-large", large);
      size.setAttribute("aria-pressed", String(large));
    }
    let large = false;
    try { large = localStorage.getItem("wrldline:article-large-text") === "1"; } catch {}
    showSize(large);
    size.addEventListener("click", () => {
      large = !large;
      showSize(large);
      try { localStorage.setItem("wrldline:article-large-text", large ? "1" : "0"); } catch {}
    });
    tools.append(size);
    summary.before(tools);
    const text = [...summary.querySelectorAll(":scope > p")].map(p => p.textContent).join("\n\n");
    if (text) {
      Promise.all([
        import("/reader-prose.js?v=20261122-longread1"),
        import("/public-article-body.js?v=20261122-longread2")
      ]).then(() => {
        window.WLPublicArticleBody.enhance(summary, {
          id: article.dataset.articleId, excerpt: text, english: en,
          options: { lang: document.documentElement.lang, editorial: /WRLDLINE/i.test(article.dataset.shareSource || "") }
        });
      }).catch(() => { /* The server-rendered text remains readable without enhancement. */ });
    }
  }
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
