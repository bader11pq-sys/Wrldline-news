#!/usr/bin/env node
/**
 * WRLDLINE security metadata for statically hosted pages.
 *
 * GitHub Pages ignores custom response headers, so the only lever the repo has
 * for those pages is document metadata. Every page gets an explicit
 * Referrer-Policy; pages that already declare one keep their own value. The
 * header-level policy (CSP, COOP, CORP, Permissions-Policy) lives in `_headers`
 * for hosts that honour it and in the Cloudflare worker for article routes.
 *
 * Usage: node scripts/apply-security-meta.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REFERRER = "strict-origin-when-cross-origin";
const META = `  <meta name="referrer" content="${REFERRER}">\n`;
const VIEWPORT = /[ \t]*<meta[^>]+name="viewport"[^>]*>\r?\n/i;

export function htmlFiles() {
  const out = [];
  for (const dir of [".", "dossier"]) {
    for (const file of fs.readdirSync(path.join(ROOT, dir))) {
      if (file.endsWith(".html")) out.push(dir === "." ? file : `${dir}/${file}`);
    }
  }
  return out.sort();
}

export function applyToHtml(html) {
  if (/<meta[^>]+name="referrer"/i.test(html)) return html;
  if (VIEWPORT.test(html)) return html.replace(VIEWPORT, (m) => m + META);
  return html.replace(/(<meta[^>]+charset[^>]*>)/i, (m) => m + "\n" + META);
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
  console.log(check ? `security meta: ${changed} file(s) out of date` : `security meta: updated ${changed} file(s)`);
  if (check && changed) process.exit(1);
}
