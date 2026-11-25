#!/usr/bin/env node
/**
 * WRLDLINE render path: web fonts must never block first paint.
 *
 * Every page used to request the Google Fonts stylesheet as a blocking
 * <link rel="stylesheet">, which cost about a second of First Contentful Paint
 * on a cold cache. The generator rewrites each such link into a preload plus a
 * print-media stylesheet that flips to all on load, keeping a <noscript> copy
 * for readers without JavaScript. Font files themselves still use
 * display=swap, so text paints in the fallback face immediately.
 *
 * Usage: node scripts/apply-font-loading.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOOGLE = "https://fonts.googleapis.com/css2";

export function htmlFiles() {
  const out = [];
  for (const dir of [".", "dossier"]) {
    for (const file of fs.readdirSync(path.join(ROOT, dir))) {
      if (file.endsWith(".html")) out.push(dir === "." ? file : `${dir}/${file}`);
    }
  }
  return out.sort();
}

/** @param {string} html */
export function applyToHtml(html) {
  const lines = html.split("\n");
  /** @type {string[]} */
  const out = [];
  const done = new Set(
    lines
      .filter((line) => line.includes('rel="preload"') && line.includes(GOOGLE))
      .map((line) => (line.match(/href="([^"]+)"/) || [])[1])
      .filter(Boolean),
  );
  for (const line of lines) {
    const isGoogle = line.includes(GOOGLE);
    const isStylesheet = /rel="stylesheet"/.test(line);
    const isBlocking = isGoogle && isStylesheet && !/media="print"/.test(line) && !/<noscript>/.test(line);
    if (!isBlocking) {
      out.push(line);
      continue;
    }
    const url = (line.match(/href="([^"]+)"/) || [])[1];
    if (!url || done.has(url)) continue;
    done.add(url);
    const indent = (line.match(/^([ \t]*)/) || ["", ""])[1];
    out.push(`${indent}<link rel="preload" as="style" href="${url}">`);
    out.push(`${indent}<link rel="stylesheet" href="${url}" media="print" onload="this.media='all'">`);
    out.push(`${indent}<noscript><link rel="stylesheet" href="${url}"></noscript>`);
  }
  return out.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes("--check");
  let changed = 0;
  for (const file of htmlFiles()) {
    const full = path.join(ROOT, file);
    const before = fs.readFileSync(full, "utf8");
    const after = applyToHtml(before);
    if (after !== before) {
      changed += 1;
      if (check) console.error(`out of date: ${file}`);
      else fs.writeFileSync(full, after);
    }
  }
  console.log(check ? `font loading: ${changed} file(s) out of date` : `font loading: updated ${changed} file(s)`);
  if (check && changed) process.exit(1);
}
