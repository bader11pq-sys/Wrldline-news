#!/usr/bin/env node
// Idempotently adds schema.org JSON-LD (WebPage/AboutPage/ContactPage/CollectionPage/WebSite + BreadcrumbList)
// to indexable static pages that have none. Run: node scripts/add-structured-data.mjs [--check]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ORIGIN = "https://al-ghaib.us.ci";
const attr = (html, re) => (html.match(re) || [])[1];
const decode = (s = "") => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function buildJsonLd(file, html) {
  const canonical = attr(html, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
  const title = decode(attr(html, /<title>([^<]+)<\/title>/i) || "").trim();
  const description = decode(attr(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i) || "").trim();
  const lang = attr(html, /<html[^>]+lang="([a-z-]+)"/i) || "ar";
  if (!canonical || !title) return null;
  const type = /^about(-en)?\.html$/.test(file) ? "AboutPage" : file === "contact.html" ? "ContactPage"
    : /^(sections|topics|tags|sources|explainers|history-library|history-explore)\.html$/.test(file) ? "CollectionPage" : "WebPage";
  const homeName = lang === "en" ? "Home" : "الرئيسية";
  const siteName = "WRLDLINE NEWS";
  const graph = [
    { "@type": type, "@id": canonical + "#webpage", url: canonical, name: title, ...(description && { description }), inLanguage: lang,
      isPartOf: { "@id": ORIGIN + "/#website" }, breadcrumb: { "@id": canonical + "#breadcrumb" } },
    { "@type": "BreadcrumbList", "@id": canonical + "#breadcrumb", itemListElement: [
      { "@type": "ListItem", position: 1, name: homeName, item: ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: title.split("|")[0].trim(), item: canonical } ] },
    { "@type": "WebSite", "@id": ORIGIN + "/#website", url: ORIGIN + "/", name: siteName, inLanguage: ["ar", "en"] },
  ];
  return { "@context": "https://schema.org", "@graph": graph };
}

// sections.html is asserted script-free by tests/human-news.test.cjs
export const SKIP = new Set(["sections.html"]);

export function indexable(html) {
  return !/<meta[^>]+name="robots"[^>]+noindex/i.test(html) && /rel="canonical"/i.test(html);
}

export function inject(file, html) {
  if (SKIP.has(file) || /application\/ld\+json/.test(html) || !indexable(html)) return null;
  const data = buildJsonLd(file, html);
  if (!data) return null;
  const json = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
  return html.replace(/<\/head>/i, `  <script type="application/ld+json">\n${json}\n  </script>\n</head>`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check"); let changed = 0;
  for (const f of readdirSync(".").filter((n) => n.endsWith(".html"))) {
    const html = readFileSync(f, "utf8"); const out = inject(f, html);
    if (out) { changed++; if (!check) writeFileSync(f, out); console.log((check ? "would update " : "updated ") + f); }
  }
  console.log(`${changed} page(s)`); if (check && changed) process.exitCode = 1;
}
