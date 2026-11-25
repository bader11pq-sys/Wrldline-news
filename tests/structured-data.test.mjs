import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { inject, indexable, buildJsonLd, SKIP } from "../scripts/add-structured-data.mjs";

const pages = readdirSync(".").filter((n) => n.endsWith(".html"));

test("every indexable static page carries valid JSON-LD matching its canonical URL", () => {
  let checked = 0;
  for (const f of pages) {
    const html = readFileSync(f, "utf8");
    if (!indexable(html) || SKIP.has(f)) continue;
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 1, `${f}: missing JSON-LD`);
    for (const b of blocks) {
      const data = JSON.parse(b[1]);
      assert.equal(data["@context"], "https://schema.org", f);
    }
    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)[1];
    assert.ok(blocks.some((b) => b[1].includes(JSON.stringify(canonical).slice(1, -1))), `${f}: canonical not referenced`);
    checked++;
  }
  assert.ok(checked > 25);
});

test("noindex pages are not given structured data", () => {
  for (const f of ["admin.html", "account.html", "audience.html"]) {
    assert.equal(/application\/ld\+json/.test(readFileSync(f, "utf8")), false, f);
  }
});

test("injection is idempotent and escapes angle brackets", () => {
  const html = '<html lang="en"><head><title>A &lt;b&gt; | X</title><link rel="canonical" href="https://al-ghaib.us.ci/a.html"></head></html>';
  const once = inject("a.html", html);
  assert.ok(once.includes("application/ld+json"));
  assert.equal(inject("a.html", once), null);
  assert.ok(!/<b>/.test(once.split("ld+json")[1]));
});

test("language and breadcrumb names follow the page language", () => {
  const ar = buildJsonLd("x.html", '<html lang="ar"><title>صفحة | W</title><link rel="canonical" href="https://al-ghaib.us.ci/x.html">');
  assert.equal(ar["@graph"][1].itemListElement[0].name, "الرئيسية");
  const en = buildJsonLd("x.html", '<html lang="en"><title>Page | W</title><link rel="canonical" href="https://al-ghaib.us.ci/x.html">');
  assert.equal(en["@graph"][1].itemListElement[0].name, "Home");
});
