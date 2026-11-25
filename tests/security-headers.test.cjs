// Production security policy: document metadata for statically hosted pages,
// the _headers file for hosts that honour it, and the worker policy for article
// routes. Run: node --test tests/security-headers.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const WORKER = read("cloudflare/workers/wrldline-public/worker.js");

test("every static page declares a referrer policy", async () => {
  const { htmlFiles } = await import("../scripts/apply-security-meta.mjs");
  const files = htmlFiles();
  assert.ok(files.length > 30, `expected the static site, found ${files.length} pages`);
  for (const file of files) {
    const html = read(file);
    const value = (html.match(/<meta[^>]+name="referrer"[^>]+content="([^"]+)"/i) || [])[1];
    assert.ok(value, `${file}: missing <meta name="referrer">`);
    assert.match(value, /^(?:no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/, `${file}: unexpected ${value}`);
  }
});

test("the security meta generator is in sync with the pages", async () => {
  const { applyToHtml, htmlFiles } = await import("../scripts/apply-security-meta.mjs");
  for (const file of htmlFiles()) {
    const html = read(file);
    assert.strictEqual(applyToHtml(html), html, `${file}: run node scripts/apply-security-meta.mjs`);
  }
});

test("_headers carries a complete policy for every path", () => {
  const file = read("_headers");
  const blocks = file
    .replace(/^#[^\n]*$/gm, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  assert.ok(blocks.length >= 3, "expected a global block and asset blocks");
  const global = blocks.find((block) => block.startsWith("/*\n"));
  assert.ok(global, "_headers needs a global /* block");
  const expected = [
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "X-Frame-Options: SAMEORIGIN",
    "Cross-Origin-Opener-Policy: same-origin",
  ];
  for (const line of expected) assert.ok(global.includes(line), `_headers missing: ${line}`);
  assert.match(global, /Permissions-Policy: [^\n]*camera=\(\)/, "_headers must deny camera");
  const csp = (global.match(/Content-Security-Policy: ([^\n]+)/) || [])[1] || "";
  for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'self'", "form-action 'self'"]) {
    assert.ok(csp.includes(directive), `_headers CSP missing ${directive}`);
  }
});

test("the worker sends the same hardening for article responses", () => {
  for (const header of ["Permissions-Policy", "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy", "Referrer-Policy", "X-Content-Type-Options"]) {
    assert.ok(WORKER.includes(`"${header}"`), `worker missing ${header}`);
  }
  const csp = WORKER.split("\n").find((line) => line.includes('"Content-Security-Policy"')) || "";
  for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'self'", "form-action 'self'"]) {
    assert.ok(csp.includes(directive), `worker CSP missing ${directive}`);
  }
  assert.ok(/camera=\(\), microphone=\(\), geolocation=\(\)/.test(WORKER), "worker should deny sensor permissions");
});
