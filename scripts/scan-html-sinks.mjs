#!/usr/bin/env node
// Static scanner for HTML sinks (innerHTML, outerHTML, insertAdjacentHTML, document.write) in browser JS.
// For each sink it extracts every ${expression} of the template literals assigned and reports expressions that are
// not provably safe (escaped, numeric, constant). It is a triage tool, not a proof: review each finding.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SAFE_CALL = /^(?:[\w.$]*\.)?(?:esc|escape\w*|escHtml|escapeHTML|escapeHtml|safeUrl|safeHref|sanitize\w*|encodeURIComponent|Number|parseInt|parseFloat|String\(\s*Number|fmt\w*|formatNumber|number|num|pct|clamp|Math\.\w+|JSON\.stringify|t|tr|text|i18n\w*|label|safe\w*|attr|h)\s*\(/;
const SAFE_SIMPLE = /^(?:[\d.]+|\w+\.length|i|index|idx|n|count|year|pct|percent|score|rank|\d+\s*[-+*\/]\s*\d+)$/;

export function templateExpressions(src, from) {
  const found = []; let i = from, depth = 0; const stack = [];
  // walk to the end of the statement, descending into template literals
  const end = Math.min(src.length, from + 20000);
  let inTpl = false, tplDepth = 0;
  while (i < end) {
    const ch = src[i];
    if (!inTpl) {
      if (ch === "`") { inTpl = true; i++; continue; }
      if (ch === '"' || ch === "'") { const q = ch; i++; while (i < end && src[i] !== q) { if (src[i] === "\\") i++; i++; } i++; continue; }
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") { depth--; if (depth < 0) break; }
      else if (ch === ";" && depth <= 0) break;
      i++; continue;
    }
    // inside template literal
    if (ch === "\\") { i += 2; continue; }
    if (ch === "`") { inTpl = false; i++; continue; }
    if (ch === "$" && src[i + 1] === "{") {
      let j = i + 2, d = 1, exprStart = j;
      while (j < end && d > 0) {
        const c = src[j];
        if (c === "`") { // nested template: skip it entirely but collect its expressions
          const inner = templateExpressions(src, j - 0); j = inner.next; found.push(...inner.found); continue;
        }
        if (c === '"' || c === "'") { const q = c; j++; while (j < end && src[j] !== q) { if (src[j] === "\\") j++; j++; } j++; continue; }
        if (c === "{") d++; else if (c === "}") d--;
        j++;
      }
      found.push({ expr: src.slice(exprStart, j - 1).trim(), at: exprStart });
      i = j; continue;
    }
    i++;
  }
  return { found, next: i };
}

/** Split the RHS statement on top-level `+`, returning non-literal operands. */
export function concatOperands(src, from) {
  const ops = []; let i = from, depth = 0, cur = "", end = Math.min(src.length, from + 20000);
  const flush = () => { const t = cur.trim(); if (t && !/^(["'`])(?:[^\\]|\\.)*?\1$/s.test(t)) ops.push(t); cur = ""; };
  while (i < end) {
    const ch = src[i];
    if (ch === '"' || ch === "'") { const q = ch; let j = i + 1; while (j < end && src[j] !== q) { if (src[j] === "\\") j++; j++; } cur += src.slice(i, j + 1); i = j + 1; continue; }
    if (ch === "`") { let j = i + 1, d = 0; while (j < end) { if (src[j] === "\\") { j += 2; continue; } if (src[j] === "$" && src[j + 1] === "{") { d++; j += 2; continue; } if (src[j] === "}" && d > 0) { d--; j++; continue; } if (src[j] === "`" && d === 0) break; j++; } cur += src.slice(i, j + 1); i = j + 1; continue; }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) { depth--; if (depth < 0) break; }
    else if (ch === ";" && depth === 0) break;
    else if (ch === "+" && depth === 0 && src[i + 1] !== "+" && src[i - 1] !== "+") { flush(); i++; continue; }
    cur += ch; i++;
  }
  flush(); return ops;
}

export function isSafeExpr(expr) {
  const e = expr.replace(/\s+/g, " ").trim();
  if (!e) return true;
  if (SAFE_SIMPLE.test(e) || SAFE_CALL.test(e)) return true;
  if (/^[\w.]+\s*\?\s*["'`][^"'`$]*["'`]\s*:\s*["'`][^"'`$]*["'`]$/.test(e)) return true; // constant ternary
  if (/^["'`][^"'`$]*["'`]$/.test(e)) return true;
  if (/^\(?\s*[\w.]+\s*\|\|\s*(?:0|\d+)\s*\)?$/.test(e)) return true;
  if (/^\w+(?:\.\w+)*\s*\?\s*`[^`$]*`\s*:\s*["'`]{2}$/.test(e)) return true;
  if (/\.(?:join)\(/.test(e) && /\bmap\(/.test(e) && /(?:esc|escape\w*|safe\w*)\s*\(/.test(e)) return true;
  if (/^(?:\w+\.)?(?:cards?|chips?|rows?|items?|list|options|html)\w*(?:Html|HTML)?$/i.test(e) && /html$/i.test(e)) return true; // pre-built *Html fragments (built by escaped helpers)
  return false;
}

const SINK = /(?:\.innerHTML\s*\+?=|\.outerHTML\s*=|insertAdjacentHTML\s*\(\s*["'`]\w+["'`]\s*,|document\.write(?:ln)?\s*\()/g;

export function scanSource(src, file = "<mem>") {
  const findings = []; let m;
  SINK.lastIndex = 0;
  while ((m = SINK.exec(src))) {
    const start = m.index + m[0].length;
    const line = src.slice(0, m.index).split("\n").length;
    const { found } = templateExpressions(src, start);
    const stmt = src.slice(start, Math.min(src.length, start + 400)).split(";")[0];
    const concatOps = stmt.trimStart().startsWith("`") ? [] : concatOperands(src, start).filter((o) => !isSafeExpr(o) && !/^(["'`])/.test(o));
    const concat = concatOps.length > 0;
    const unsafe = [...found.filter((f) => !isSafeExpr(f.expr)), ...concatOps.map((o) => ({ expr: o }))];
    if (unsafe.length || concat) findings.push({ file, line, sink: m[0].replace(/\s+/g, " ").slice(0, 30), unsafe: unsafe.map((u) => u.expr.slice(0, 90)), concatenation: concat });
  }
  return findings;
}

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "vendor", "cloudflare-backups", "tests", "scripts", "design-agent", "originals", "assets"].includes(name)) continue;
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) walk(p, out); else if (/\.js$/.test(name) && !/\.min\.js$/.test(name)) out.push(p);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] || ".";
  const all = walk(root).flatMap((f) => scanSource(readFileSync(f, "utf8"), f));
  if (process.argv.includes("--json")) console.log(JSON.stringify(all, null, 1));
  else { for (const f of all) console.log(`${f.file}:${f.line} ${f.sink} ${f.concatenation ? "[concat] " : ""}${f.unsafe.map((u) => "${" + u + "}").join(" ")}`); console.log(`\n${all.length} sinks with unproven expressions`); }
  process.exitCode = 0;
}
