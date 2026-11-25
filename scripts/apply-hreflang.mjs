#!/usr/bin/env node
/**
 * WRLDLINE international SEO: hreflang + locale metadata.
 *
 * Every indexable static page declares the language it is actually written in.
 * Pages that exist as a real Arabic/English pair cross-reference each other, and
 * every page names an x-default so search engines have an unambiguous entry
 * point. Existing `rel="alternate" hreflang` lines are replaced, so the script
 * is idempotent and can run as a pre-commit or CI check.
 *
 * The site switches language client-side with ?lang=en for most pages, which is
 * not a separate URL and therefore not a valid hreflang target; those pages only
 * declare their own language plus x-default. Real pairs (about, corrections) get
 * the full ar/en/x-default triples.
 *
 * Usage: node scripts/apply-hreflang.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://al-ghaib.us.ci";

/** Real bilingual pairs: Arabic page -> English page. */
export const PAIRS = {
  "about.html": "about-en.html",
  "corrections.html": "corrections-en.html",
};
const EN_TO_AR = Object.fromEntries(Object.entries(PAIRS).map(([ar, en]) => [en, ar]));

const LOCALE = { ar: "ar_AR", en: "en_US" };

const attr = (html, re) => (html.match(re) || [])[1];

export function pages() {
  return fs
    .readdirSync(ROOT)
    .filter((f) => f.endsWith(".html"))
    .filter((f) => !/name="robots"[^>]*noindex/i.test(fs.readFileSync(path.join(ROOT, f), "utf8")))
    .sort();
}

export function canonicalOf(html) {
  return attr(html, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
}

/** Expected hreflang block lines for one page. */
export function hreflangLines(file, html) {
  const canonical = canonicalOf(html);
  if (!canonical) return null;
  const lang = (attr(html, /<html[^>]+lang="([a-z-]+)"/i) || "ar").toLowerCase();
  const arFile = lang === "en" ? EN_TO_AR[file] : file;
  const enFile = lang === "en" ? file : PAIRS[file];
  const url = (f) => (f === "index.html" ? ORIGIN + "/" : `${ORIGIN}/${f}`);
  const lines = [`  <link rel="alternate" hreflang="${lang}" href="${canonical}">`];
  if (arFile && enFile) {
    lines.push(`  <link rel="alternate" hreflang="ar" href="${url(arFile)}">`);
    lines.push(`  <link rel="alternate" hreflang="en" href="${url(enFile)}">`);
  }
  const xDefault = arFile ? url(arFile) : canonical;
  lines.push(`  <link rel="alternate" hreflang="x-default" href="${xDefault}">`);
  return { lang, lines: [...new Set(lines)] };
}

export function localeLines(lang, hasPair) {
  const lines = [`  <meta property="og:locale" content="${LOCALE[lang] || LOCALE.ar}">`];
  if (hasPair) {
    const other = lang === "en" ? "ar_AR" : "en_US";
    lines.push(`  <meta property="og:locale:alternate" content="${other}">`);
  }
  return lines;
}

export function applyToHtml(file, html) {
  const spec = hreflangLines(file, html);
  if (!spec) return html;
  const hasPair = Boolean(PAIRS[file] || EN_TO_AR[file]);

  // Drop inherited hreflang/og:locale lines, then re-insert in canonical order.
  let out = html
    .replace(/[ \t]*<link[^>]+rel="alternate"[^>]+hreflang="[^"]*"[^>]*>\r?\n/gi, "")
    .replace(/[ \t]*<meta[^>]+property="og:locale(?::alternate)?"[^>]*>\r?\n/gi, "");

  out = out.replace(/(<link[^>]+rel="canonical"[^>]*>\r?\n)/i, (m) => m + spec.lines.join("\n") + "\n");

  const locale = localeLines(spec.lang, hasPair).join("\n") + "\n";
  if (/<meta[^>]+property="og:url"[^>]*>\r?\n/i.test(out)) {
    out = out.replace(/(<meta[^>]+property="og:url"[^>]*>\r?\n)/i, (m) => m + locale);
  } else if (/<meta[^>]+property="og:type"[^>]*>\r?\n/i.test(out)) {
    out = out.replace(/(<meta[^>]+property="og:type"[^>]*>\r?\n)/i, (m) => m + locale);
  } else {
    // Pages without Open Graph tags still declare the content locale, right after
    // the hreflang block so related metadata stays together.
    out = out.replace(/(<link[^>]+rel="canonical"[^>]*>\r?\n(?:[ \t]*<link[^>]+hreflang="[^"]*"[^>]*>\r?\n)*)/i, (m) => m + locale);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes("--check");
  let changed = 0;
  for (const file of pages()) {
    const before = fs.readFileSync(path.join(ROOT, file), "utf8");
    const after = applyToHtml(file, before);
    if (after !== before) {
      changed += 1;
      if (check) console.error(`out of date: ${file}`);
      else fs.writeFileSync(path.join(ROOT, file), after);
    }
  }
  console.log(check ? `hreflang: ${changed} file(s) out of date` : `hreflang: updated ${changed} file(s)`);
  if (check && changed) process.exit(1);
}
