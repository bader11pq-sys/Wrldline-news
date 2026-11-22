import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name) => fs.readFileSync(new URL(name, new URL("../", import.meta.url)), "utf8");
const story = "/originals/saudi-ports-2025.html";
const dossier = "/dossier/opec-plus-december-2026.html";

test("coverage priorities link to a dossier, the first original and the watchlist", () => {
  const home = read("index.html");
  const focus = home.match(/<section [^>]*aria-labelledby="editorialFocusTitle"[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(focus);
  for (const target of ["/originals/", story, `${dossier}#reader-brief`, "/dossier/watchlist.html"]) {
    assert.ok(focus.includes(`href="${target}"`), target);
  }
  for (const href of [story, "/originals/"]) {
    assert.ok(read("sitemap.xml").includes(`<loc>https://al-ghaib.us.ci${href}</loc>`));
  }
  assert.ok(read("originals/index.html").includes(`href="${story}"`));
});

test("the shipping original uses separate denominators and reproduces the published shares from its CSV", () => {
  const csv = read("originals/saudi-ports-2025.csv").trim().split("\n").slice(1)
    .map((line) => line.split(",")).map(([year, table, metric, port, volume, total]) =>
      ({ year, table, metric, port, volume: Number(volume), total: Number(total) }));
  const inbound = csv.filter(({ metric }) => metric === "inbound_containers");
  const handled = csv.filter(({ metric }) => metric === "handled_teu");
  assert.deepEqual(inbound.map(({ table, total }) => [table, total]), [["4-1", 1953780], ["4-1", 1953780]]);
  assert.deepEqual(handled.map(({ table, total }) => [table, total]), [["3-1", 9080153], ["3-1", 9080153]]);
  const html = read(story.slice(1));
  const englishNumber = Intl.NumberFormat("en-US");
  const asPercent = (n, total) => `${(100 * n / total).toFixed(1)}%`;
  for (const { volume, total } of csv) {
    assert.ok(html.includes(englishNumber.format(volume)));
    assert.ok(html.includes(englishNumber.format(total)));
    assert.ok(html.includes(asPercent(volume, total)));
  }
  const combined = inbound.reduce((sum, { volume }) => sum + volume, 0);
  assert.ok(html.includes(englishNumber.format(combined)));
  assert.ok(html.includes(asPercent(combined, inbound[0].total)));
  assert.match(html, /www\.stats\.gov\.sa\/[^"]+2025\+EN\.xlsx/);
  assert.match(html, /href="\/originals\/saudi-ports-2025\.csv" download/);
});
