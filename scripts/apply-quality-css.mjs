#!/usr/bin/env node
/**
 * WRLDLINE quality layer: link quality.css from every page.
 *
 * Each page pulls in its own page stylesheet (home bundle, policy, markets,
 * editorial desk, rights desk, shorts...), so there is no single correct file
 * to append cross-cutting rules to. quality.css holds only the rules that must
 * hold everywhere — pointer target sizes and the micro-type floor — and this
 * generator inserts its link as the last stylesheet in <head> so those rules
 * win at equal specificity.
 *
 * Idempotent: re-running rewrites nothing. --check fails when a page is stale.
 *
 * Usage: node scripts/apply-quality-css.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const HREF = "/quality.css?v=quality-1";
const MARKER = "quality.css";

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
  if (html.includes(MARKER)) return html;
  const lines = html.split("\n");
  const idx = lines.findIndex((line) => /<\/head>/i.test(line));
  if (idx === -1) return html;
  const tag = `<link rel="stylesheet" href="${HREF}">`;
  const head = lines[idx];
  if (/<\/head>/i.test(head.trim()) && head.trim() !== "</head>") {
    // <head> closes mid-line: insert the link just before it.
    lines[idx] = head.replace(/<\/head>/i, `  ${tag}\n</head>`);
  } else {
    lines.splice(idx, 0, `  ${tag}`);
  }
  return lines.join("\n");
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
  console.log(check ? `quality css: ${changed} file(s) out of date` : `quality css: updated ${changed} file(s)`);
  if (check && changed) process.exit(1);
}
